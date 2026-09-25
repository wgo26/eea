import { NextResponse } from 'next/server'
import { logger, generateCorrelationId } from '@/lib/observability/logger'
import { requireCronSecret } from '@/lib/security/cron-auth'
import { stampHeartbeat } from '@/lib/automation/heartbeat'
import { processDueReminders } from '@/lib/reminders/worker'

export const dynamic = 'force-dynamic'

/**
 * Event-reminder worker: delivers due "remind me" rows through the
 * notification outbox (same CRON_SECRET bearer pattern as /api/cron/notify).
 * Hourly is plenty — reminder presets are 1h/1d/1w before the event.
 */
async function runReminders(request: Request) {
  const correlationId = generateCorrelationId()
  const startedAt = Date.now()
  const denied = requireCronSecret(request, 'reminders', correlationId)
  if (denied) return denied

  try {
    const summary = await processDueReminders()
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      correlationId,
      ...summary,
    })
  } catch (err) {
    logger.error('cron/reminders', 'worker exception', {
      error: err instanceof Error ? err.message : String(err),
      correlationId,
    })
    return NextResponse.json({ ok: false, error: 'Reminders worker failed', correlationId }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return stampHeartbeat('reminders', runReminders(request))
}

export async function POST(request: Request) {
  return runReminders(request)
}
