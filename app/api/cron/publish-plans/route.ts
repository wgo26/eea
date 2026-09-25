import { NextResponse } from 'next/server'
import { logger, generateCorrelationId } from '@/lib/observability/logger'
import { requireCronSecret } from '@/lib/security/cron-auth'
import { runDuePublishPlans } from '@/lib/automation/publish-plans-run'
import { stampHeartbeat } from '@/lib/automation/heartbeat'

export const dynamic = 'force-dynamic'

/**
 * Publish-plan worker (Stream C): wakes every 30 minutes and runs due
 * release plans — compile recap drafts (via the template runner), optionally
 * auto-scheduling them for the pg_cron publisher. A plan that fails compiles
 * self-disables after 3 runs (handled in the runner), so only an exception is
 * a 500 here; the E1 heartbeat records both outcomes.
 */
async function runPlans(request: Request) {
  const correlationId = generateCorrelationId()
  const startedAt = Date.now()
  const denied = requireCronSecret(request, 'publish-plans', correlationId)
  if (denied) return denied

  try {
    const summary = await runDuePublishPlans()
    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      correlationId,
      ...summary,
    })
  } catch (err) {
    logger.error('cron/publish-plans', 'worker exception', {
      error: err instanceof Error ? err.message : String(err),
      correlationId,
    })
    return NextResponse.json({ ok: false, error: 'Publish-plans worker failed', correlationId }, { status: 500 })
  }
}

export async function GET(request: Request) {
  return stampHeartbeat('publish-plans', runPlans(request))
}

export async function POST(request: Request) {
  return stampHeartbeat('publish-plans', runPlans(request))
}
