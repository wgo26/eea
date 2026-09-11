import { NextResponse } from 'next/server'
import { logger, generateCorrelationId } from '@/lib/observability/logger'
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
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    logger.error('cron/notify', 'CRON_SECRET not configured', { correlationId })
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ ok: false, error: 'Notify cron not configured' }, { status: 500 })
    }
    logger.warn('cron/notify', 'running without CRON_SECRET (non-production only)', { correlationId })
  } else if (authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('cron/notify', 'unauthorized invocation', { correlationId })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const summary = await processOutbox()
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      correlationId,
      ...summary,
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
  return runNotify(request)
}

export async function POST(request: Request) {
  return runNotify(request)
}
