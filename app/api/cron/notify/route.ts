import { NextResponse } from 'next/server'
import { logger, generateCorrelationId } from '@/lib/observability/logger'
import { requireCronSecret } from '@/lib/security/cron-auth'
import { stampHeartbeat } from '@/lib/automation/heartbeat'
import { processOutbox } from '@/lib/notify/worker'

export const dynamic = 'force-dynamic'

/**
 * Notification outbox worker (the per-event loop P1-1 asked for). Every
 * 15 minutes it delivers queued staff alerts + user nudges across in-app,
 * email (SMTP) and WhatsApp (Cloud API) per recipient prefs. Unconfigured
 * channels record honest skips — the run stays green while staff finish
 * setup in /admin/notifications.
 *
 * Auth: CRON_SECRET bearer — same fail-closed pattern as the other crons
 * (missing secret = 500 in production, wrong secret = 401). GET (Vercel
 * Cron) and POST (manual/GitHub schedule) share the runner.
 */
async function runNotify(request: Request) {
  const correlationId = generateCorrelationId()
  const startedAt = Date.now()
  // Phase 0 — single fail-closed guard (lib/security/cron-auth.ts). Unset
  // secret fails closed (500 prod / 401 dev) unless ALLOW_UNAUTH_CRON=1.
  const denied = requireCronSecret(request, 'notify', correlationId)
  if (denied) return denied

  try {
    const summary = await processOutbox()
    // D2 — criticals nobody read within the window escalate once (see
    // lib/admin/notification-writes.ts). Runs on the same 15-minute tick so
    // the acknowledgement loop shares the worker's heartbeat.
    let escalations = { escalated: 0, acknowledged: 0 }
    try {
      const { escalateUnacknowledged } = await import('@/lib/admin/notification-writes')
      const { createAdminClient } = await import('@/lib/supabase/admin')
      escalations = await escalateUnacknowledged(createAdminClient())
    } catch (escErr) {
      logger.error('cron/notify', 'escalation pass failed', {
        error: escErr instanceof Error ? escErr.message : String(escErr),
        correlationId,
      })
    }
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      correlationId,
      ...summary,
      escalations,
    })
  } catch (err) {
    logger.error('cron/notify', 'worker exception', {
      error: err instanceof Error ? err.message : String(err),
      correlationId,
    })
    return NextResponse.json({ ok: false, error: 'Notify worker failed', correlationId }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return stampHeartbeat('notify', runNotify(request))
}

export async function POST(request: Request) {
  return runNotify(request)
}
