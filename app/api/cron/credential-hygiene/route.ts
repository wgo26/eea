import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger, generateCorrelationId } from '@/lib/observability/logger'
import { requireCronSecret } from '@/lib/security/cron-auth'
import { stampHeartbeat } from '@/lib/automation/heartbeat'
import { enqueueStaffAlert } from '@/lib/notify/queue'

export const dynamic = 'force-dynamic'

/**
 * Weekly credential-hygiene sweep (System & Infrastructure → Credentials).
 *
 * Rotation policies (`rotation_policy.intervalDays`) and expiries are
 * display-only metadata — nothing enforces them. This job closes that loop:
 * every Monday it scans `api_credentials` for expired, rotation-due and
 * soon-expiring values and pages staff (notification centre + digest
 * channels) with a single `credential.hygiene` alert. It writes nothing and
 * rotates nothing — the chief still rotates from the Credentials tab, where
 * each step is audited.
 *
 * Auth: CRON_SECRET bearer token, fail-closed like every other cron route.
 */

const EXPIRING_SOON_DAYS = 14

type CredentialHygieneRow = {
  name: string | null
  provider: string | null
  status: string | null
  expires_at: string | null
  updated_at: string | null
  rotation_policy: { intervalDays?: number | null } | null
}

async function runHygiene(request: Request) {
  const startedAt = Date.now()
  const correlationId = generateCorrelationId()
  const denied = requireCronSecret(request, 'credential-hygiene', correlationId)
  if (denied) return denied

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase
      .from('api_credentials')
      .select('name, provider, status, expires_at, updated_at, rotation_policy')
      .in('status', ['active', 'disabled'])
    if (error) throw new Error(error.message)

    const now = Date.now()
    const soonMs = EXPIRING_SOON_DAYS * 86_400_000
    const rows = (data ?? []) as unknown as CredentialHygieneRow[]
    const expired: string[] = []
    const due: string[] = []
    const expiring: string[] = []

    for (const row of rows) {
      const label = `${row.name ?? 'unnamed'} (${row.provider ?? '?'})`
      const expiresMs = row.expires_at ? Date.parse(row.expires_at) : NaN
      if (row.status === 'active' && Number.isFinite(expiresMs)) {
        if (expiresMs < now) {
          expired.push(label)
          continue
        }
        if (expiresMs - now < soonMs) expiring.push(label)
      }
      const days = row.rotation_policy?.intervalDays
      const updatedMs = row.updated_at ? Date.parse(row.updated_at) : NaN
      if (
        row.status === 'active' &&
        typeof days === 'number' &&
        days > 0 &&
        Number.isFinite(updatedMs) &&
        updatedMs + days * 86_400_000 < now
      ) {
        due.push(label)
      }
    }

    const total = expired.length + due.length + expiring.length
    if (total > 0) {
      const names = [...expired, ...due, ...expiring].slice(0, 3).join('; ')
      await enqueueStaffAlert(
        'credential.hygiene',
        {
          expired: expired.length,
          due: due.length,
          expiring: expiring.length,
          names,
        },
        '/admin/secrets',
      )
    }

    const result = {
      ok: true,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      correlationId,
      checked: rows.length,
      expired: expired.length,
      rotationDue: due.length,
      expiringSoon: expiring.length,
      alerted: total > 0,
    }
    logger.info('cron/credential-hygiene', 'hygiene sweep complete', {
      ...result,
    })
    return NextResponse.json(result)
  } catch (err) {
    logger.error('cron/credential-hygiene', 'hygiene sweep failed', {
      correlationId,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Hygiene sweep failed', correlationId },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  return stampHeartbeat('credential-hygiene', runHygiene(request))
}

// Vercel Cron invokes scheduled jobs with GET — same auth semantics as POST.
export async function GET(request: Request) {
  return runHygiene(request)
}
