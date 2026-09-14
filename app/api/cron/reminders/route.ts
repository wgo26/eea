import { NextResponse } from 'next/server'
import { logger, generateCorrelationId } from '@/lib/observability/logger'
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
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    logger.error('cron/reminders', 'CRON_SECRET not configured', { correlationId })
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ ok: false, error: 'Reminders cron not configured' }, { status: 500 })
    }
    logger.warn('cron/reminders', 'running without CRON_SECRET (non-production only)', { correlationId })
  } else if (authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('cron/reminders', 'unauthorized invocation', { correlationId })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

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
  return runReminders(request)
}

export async function POST(request: Request) {
  return runReminders(request)
}
