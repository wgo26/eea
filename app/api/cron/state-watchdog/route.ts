import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger, generateCorrelationId } from '@/lib/observability/logger'
import { requireCronSecret } from '@/lib/security/cron-auth'
import { stampHeartbeat } from '@/lib/automation/heartbeat'
import { getSystemMetrics } from '@/lib/observability/metrics'
import { ensurePluginStatesRegistered } from '@/lib/platform/states/index'
import { logStateEvent, setStateActive } from '@/lib/admin/state-writes'
import { getEffectiveState, resolveActiveStates, toSystemState } from '@/lib/platform/state-engine'
import { enqueueStaffAlert } from '@/lib/notify/queue'

export const dynamic = 'force-dynamic'

/**
 * Telemetry-driven DEGRADED automation (System & Infrastructure → States).
 *
 * `DEGRADED` declared `automated: true` but nothing ever lit it — this
 * 15-minute job closes that gap using the same `getSystemMetrics()` verdict
 * the dashboard renders:
 *
 *   * `degraded`/`unavailable` + DEGRADED not live + no open incident →
 *     light DEGRADED (reason names the failing components) + staff alert.
 *   * `healthy`/`unknown` + DEGRADED live + the watchdog lit it (last
 *     activation event is actorless with a `Watchdog:` reason) → clear it.
 *     A human-lit DEGRADED is never auto-cleared.
 *   * An open incident always wins: the job stands down (the incident
 *     console owns every operational signal while one runs).
 *
 * Operational states are never touched. Auth: CRON_SECRET, fail-closed.
 */

const WATCHDOG_REASON_PREFIX = 'Watchdog: '

async function activeIncidentOpen(admin: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const { data } = await admin
    .from('incidents')
    .select('id')
    .neq('current_status', 'resolved')
    .limit(1)
  return ((data ?? []) as unknown[]).length > 0
}

async function watchdogLitDegraded(admin: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const { data } = await admin
    .from('system_state_events')
    .select('action, actor_id, reason')
    .eq('state_id', 'DEGRADED')
    .order('created_at', { ascending: false })
    .limit(10)
  const events = (data ?? []) as unknown as { action: string; actor_id: string | null; reason: string | null }[]
  // Walk back to the most recent activation: only a watchdog activation
  // (no actor, Watchdog reason) is ours to clear.
  for (const event of events) {
    if (event.action === 'activated') {
      return event.actor_id === null && (event.reason ?? '').startsWith(WATCHDOG_REASON_PREFIX)
    }
  }
  return false
}

async function runWatchdog(request: Request) {
  const startedAt = Date.now()
  const correlationId = generateCorrelationId()
  const denied = requireCronSecret(request, 'state-watchdog', correlationId)
  if (denied) return denied

  try {
    ensurePluginStatesRegistered()
    const admin = createAdminClient()

    if (await activeIncidentOpen(admin)) {
      return NextResponse.json({
        ok: true,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        correlationId,
        stoodDown: 'incident-open',
      })
    }

    const metrics = await getSystemMetrics()
    const unhealthy = metrics.status === 'degraded' || metrics.status === 'unavailable'

    const { data: degradedRow } = await admin
      .from('system_states')
      .select('*')
      .eq('id', 'DEGRADED')
      .maybeSingle()
    const degraded = degradedRow ? toSystemState(degradedRow as unknown as Record<string, unknown>) : null
    const live = degraded ? resolveActiveStates([degraded], new Date()).length > 0 : false

    let action: string = live ? (unhealthy ? 'none-live' : 'awaiting-recovery-check') : unhealthy ? 'activating' : 'none'
    let detail: string | null = null

    if (unhealthy && !live) {
      const failing = metrics.components
        .filter((c) => c.status !== 'operational')
        .map((c) => `${c.id}:${c.status}`)
        .join(', ')
      detail = failing || `status=${metrics.status}`
      const { data: actives } = await admin.from('system_states').select('*').eq('active', true)
      const previousState = getEffectiveState(
        ((actives ?? []) as unknown as Record<string, unknown>[]).map(toSystemState),
      )
      const written = await setStateActive(admin, 'DEGRADED', true, null)
      if (!written.ok) throw new Error(written.error)
      await logStateEvent(admin, {
        stateId: 'DEGRADED',
        action: 'activated',
        previousStateId: previousState.id,
        reason: `${WATCHDOG_REASON_PREFIX}${detail}`.slice(0, 200),
        actorId: null,
      })
      await enqueueStaffAlert('system.degraded', { detail }, '/admin/states')
      action = 'activated'
    } else if (!unhealthy && live && (await watchdogLitDegraded(admin))) {
      const { data: actives } = await admin.from('system_states').select('*').eq('active', true)
      const previousState = getEffectiveState(
        ((actives ?? []) as unknown as Record<string, unknown>[]).map(toSystemState),
      )
      const written = await setStateActive(admin, 'DEGRADED', false, null)
      if (!written.ok) throw new Error(written.error)
      await logStateEvent(admin, {
        stateId: 'DEGRADED',
        action: 'deactivated',
        previousStateId: previousState.id,
        reason: `${WATCHDOG_REASON_PREFIX}recovered (status=${metrics.status})`,
        actorId: null,
      })
      action = 'cleared'
    } else if (!unhealthy && live) {
      action = 'none-manual-hold'
    }

    const result = {
      ok: true,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      correlationId,
      metricsStatus: metrics.status,
      action,
      detail,
    }
    logger.info('cron/state-watchdog', 'watchdog evaluation complete', {
      correlationId,
      durationMs: result.durationMs,
      metricsStatus: result.metricsStatus,
      action: result.action,
    })
    return NextResponse.json(result)
  } catch (err) {
    logger.error('cron/state-watchdog', 'watchdog evaluation failed', {
      correlationId,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Watchdog evaluation failed', correlationId },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  return stampHeartbeat('state-watchdog', runWatchdog(request))
}

// Vercel Cron invokes scheduled jobs with GET — same auth semantics as POST.
export async function GET(request: Request) {
  return runWatchdog(request)
}
