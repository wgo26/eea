import { NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/security/cron-auth'
import { stampHeartbeat } from '@/lib/automation/heartbeat'
import { generateCorrelationId, logger } from '@/lib/observability/logger'
import { sendSubscriptionDigests } from '@/lib/subscriptions/actions'
import { isPublicFanoutPaused } from '@/lib/platform/fanout'

export const dynamic = 'force-dynamic'

/**
 * Personalized subscription digests (Stream A, Phase 5).
 *
 * Sent to members who have subscribed to places (continent, country, region,
 * division, city, town, quarter, landmark). Each member receives content from
 * their subscribed places and all descendant places. Never archived — personal
 * variants belong to the recipient, not the public /digest/archive page.
 *
 * Runs after the daily digest so both never compete for the same channel quota.
 * Auth: CRON_SECRET bearer — same fail-closed pattern as daily-digest.
 */
async function run(request: Request) {
  const correlationId = generateCorrelationId()
  const denied = requireCronSecret(request, 'subscription-digest', correlationId)
  if (denied) return denied

  const fanoutGate = await isPublicFanoutPaused()
  if (fanoutGate.paused) {
    logger.info('cron/subscription-digest', 'public fan-out paused by system state', {
      correlationId,
      stateId: fanoutGate.stateId,
    })
    return NextResponse.json(
      { ok: true, correlationId, paused: true, stateId: fanoutGate.stateId },
      { status: 200 },
    )
  }

  const startedAt = Date.now()
  const today = new Date().toISOString().slice(0, 10)
  const label = new Date().toISOString().slice(5, 10)

  let result
  try {
    result = await sendSubscriptionDigests(
      `week of ${label}`,
      today,
      'daily',
    )
  } catch (err) {
    logger.error('cron/subscription-digest', 'subscription digest failed', {
      correlationId,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Subscription digest failed', correlationId },
      { status: 502 },
    )
  }

  logger.info('cron/subscription-digest', 'subscription digest delivered', {
    correlationId,
    durationMs: Date.now() - startedAt,
    date: today,
    result,
  })
  return NextResponse.json(
    { ok: true, correlationId, date: today, result },
    { status: 200 },
  )
}

export async function POST(request: Request) {
  return stampHeartbeat('subscription-digest', run(request))
}

export async function GET(request: Request) {
  return stampHeartbeat('subscription-digest', run(request))
}
