import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/observability/logger'

/**
 * Cron heartbeats (Stream E, E1). Every scheduled route stamps its outcome
 * through the service-role `cron_heartbeat` RPC (migration 20261108000000);
 * /api/ready and the admin automations strip read the table back so a silent
 * scheduler failure (workflow paused, secret rotated, route renamed) is
 * visible WITHOUT depending on the failed scheduler to report on itself.
 *
 * Staleness uses per-job grace windows: the 15-minute notify worker goes stale
 * in an hour, the nightly ops digest only in 36.
 */

export type HeartbeatRow = {
  job: string
  lastSuccess: string | null
  lastRunAt: string
  lastStatus: 'ok' | 'failed'
  lastError: string | null
}

/** Expected cadence + tolerated silence per scheduled job (hours). */
export const CRON_GRACE_HOURS: Record<string, number> = {
  notify: 1,
  reminders: 2,
  'state-schedules': 36,
  'ops-digest': 36,
  'weekly-digest': 8 * 24,
  'publish-plans': 1,
  'db-maintenance': 36,
  'storage-backup': 36,
  'db-dump': 60,
  'credential-hygiene': 8 * 24,
}

/**
 * Stamp one run. Best-effort: a heartbeat failure never fails the job it is
 * reporting on, but a failure to record a FAILED run is itself alarming —
 * the error is logged loudly for the log-based alerts.
 */
export async function recordCronHeartbeat(job: string, ok: boolean, error?: string | null): Promise<void> {
  try {
    const db = createAdminClient()
    const { error: rpcError } = await db.rpc('cron_heartbeat', { p_job: job, p_ok: ok, p_error: error ?? null })
    if (rpcError) {
      // Most likely cause: the migration has not been applied yet — noisy but
      // non-fatal during deploy window, real afterwards.
      logger.warn('cron/heartbeat', 'heartbeat stamp failed', { job, error: rpcError.message })
    }
  } catch (e) {
    logger.warn('cron/heartbeat', 'heartbeat stamp exception', { job, error: e instanceof Error ? e.message : String(e) })
  }
}

export type HeartbeatHealth = { job: string; status: 'ok' | 'stale' | 'failing' | 'unknown'; lastSuccess: string | null }

/** Pure staleness classification over fetched rows — unit-tested. */
export function classifyHeartbeats(
  rows: { job: string; last_success: string | null; last_status: string }[],
  now: Date = new Date(),
): HeartbeatHealth[] {
  return rows.map((row) => {
    let status: HeartbeatHealth['status']
    if (row.last_status === 'failed') status = 'failing'
    else if (!row.last_success) status = 'unknown'
    else {
      const grace = (CRON_GRACE_HOURS[row.job] ?? 36) * 3_600_000
      status = now.getTime() - Date.parse(row.last_success) > grace ? 'stale' : 'ok'
    }
    return { job: row.job, status, lastSuccess: row.last_success }
  })
}

/** Read every heartbeat, classified. Throws only on programmer error. */
export async function getCronHeartbeatHealth(): Promise<HeartbeatHealth[]> {
  const db = createAdminClient()
  const { data, error } = await db.from('cron_heartbeats').select('job, last_success, last_status').limit(50)
  if (error) {
    logger.warn('cron/heartbeat', 'heartbeat read failed', { error: error.message })
    return []
  }
  return classifyHeartbeats((data ?? []) as { job: string; last_success: string | null; last_status: string }[])
}

/**
 * Wrap a cron route's response promise: 2xx stamps ok, >=500 stamps failed
 * (a production missing-secret 500 counts — the strip SHOULD show failing),
 * 4xx (auth denial) stamps nothing since the job never ran.
 */
export async function stampHeartbeat<T extends Response>(job: string, response: Promise<T>): Promise<T> {
  const res = await response
  if (res.status >= 500) await recordCronHeartbeat(job, false, `route returned ${res.status}`)
  else if (res.status < 400) await recordCronHeartbeat(job, true)
  return res
}
