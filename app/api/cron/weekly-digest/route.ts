import { NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/security/cron-auth'
import { stampHeartbeat } from '@/lib/automation/heartbeat'
import { generateCorrelationId, logger } from '@/lib/observability/logger'
import { sendWeeklyDigest } from '@/lib/digest/deliver'
import { compileTemplatesForCadence } from '@/lib/content/templates-run'

export const dynamic = 'force-dynamic'

/**
 * Weekly recap (Stream A, A5): Mondays 07:00 UTC — one hour after the daily
 * digest so both never compete for the same channel quota. Aggregates the
 * last 7 days of published items (directly, not via slots — slots roll on
 * delivery, and a missed week must still cover its full window) into one
 * `digest_issues` row per locale with `cadence = 'weekly'`, sent to every
 * active subscriber, and compiles weekly-cadence recap templates (Stream B)
 * into drafts for the editorial review queue.
 *
 * Auth: CRON_SECRET bearer — same fail-closed pattern as ops-digest.
 */
async function run(request: Request) {
  const correlationId = generateCorrelationId()
  const denied = requireCronSecret(request, 'weekly-digest', correlationId)
  if (denied) return denied
  const startedAt = Date.now()

  // Behavior-axis enforcement: no subscriber fan-out during incident /
  // critical states (staff alerts and transactional mail are unaffected).
  const { isPublicFanoutPaused } = await import('@/lib/platform/fanout')
  const fanoutGate = await isPublicFanoutPaused()

  let weekly
  try {
    weekly = fanoutGate.paused
      ? { paused: true, stateId: fanoutGate.stateId }
      : await sendWeeklyDigest(7)
    if (fanoutGate.paused) {
      logger.info('cron/weekly-digest', 'public fan-out paused by system state', {
        correlationId,
        stateId: fanoutGate.stateId,
      })
    }
  } catch (err) {
    logger.error('cron/weekly-digest', 'weekly recap failed', {
      correlationId,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Weekly digest failed', correlationId },
      { status: 502 },
    )
  }

  // Weekly recap templates run after delivery so the drafts land in the same
  // editorial review window. Best-effort — reported, never thrown.
  const templates = await compileTemplatesForCadence('weekly')

  logger.info('cron/weekly-digest', 'weekly recap delivered', {
    correlationId,
    durationMs: Date.now() - startedAt,
    weekly,
    templates,
  })
  return NextResponse.json({ ok: true, correlationId, weekly, templates })
}

export async function POST(request: Request) {
  return stampHeartbeat('weekly-digest', run(request))
}

export async function GET(request: Request) {
  return run(request)
}
