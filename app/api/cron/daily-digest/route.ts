import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireCronSecret } from '@/lib/security/cron-auth'
import { stampHeartbeat } from '@/lib/automation/heartbeat'
import { generateCorrelationId, logger } from '@/lib/observability/logger'
import { deliverDigest, markPersistedDigestSlots, retryFailedDigestBatches } from '@/lib/digest/deliver'
import { hasFrozenStories, parseDigestFreeze } from '@/lib/digest/freeze'
import { compileTemplatesForCadence } from '@/lib/content/templates-run'
import { isPublicFanoutPaused } from '@/lib/platform/fanout'

export const dynamic = 'force-dynamic'

const SUBJECT = {
  en: 'Eagle Eye Africa — daily digest',
  fr: 'Eagle Eye Africa — résumé du jour',
}

async function run(request: Request) {
  const correlationId = generateCorrelationId()
  const denied = requireCronSecret(request, 'daily-digest', correlationId)
  if (denied) return denied
  const startedAt = Date.now()
  const issueDate = new Date().toISOString().slice(0, 10)
  const db = createAdminClient()

  try {
    const fanoutGate = await isPublicFanoutPaused()
    let retries = {
      emailed: 0,
      whatsapped: 0,
      skipped: 0,
      failed: 0,
      uncertain: 0,
      durableByLocale: { en: false, fr: false },
      queuedByLocale: { en: 0, fr: 0 },
      deliveredByLocale: {
        en: { emailed: 0, whatsapped: 0 },
        fr: { emailed: 0, whatsapped: 0 },
      },
    }
    if (!fanoutGate.paused) {
      await markPersistedDigestSlots('daily', issueDate)
      retries = await retryFailedDigestBatches('daily')
    }
    const { data, error } = await db.rpc('digest_freeze', { p_issue_date: issueDate })
    if (error) throw new Error(`Digest freeze failed: ${error.message}`)
    const storiesByLocale = parseDigestFreeze(data)
    if (!hasFrozenStories(storiesByLocale)) {
      const failed = retries.failed
      return NextResponse.json(
        { ok: failed === 0, correlationId, issueDate, skipped: 'no_stories', retries },
        { status: failed > 0 ? 502 : 200 },
      )
    }

    let delivery = {
      emailed: 0,
      whatsapped: 0,
      skipped: 0,
      failed: 0,
      uncertain: 0,
      durableByLocale: { en: false, fr: false },
      queuedByLocale: { en: 0, fr: 0 },
      deliveredByLocale: {
        en: { emailed: 0, whatsapped: 0 },
        fr: { emailed: 0, whatsapped: 0 },
      },
    }
    if (fanoutGate.paused) {
      logger.info('cron/daily-digest', 'public fan-out paused by system state', {
        correlationId,
        stateId: fanoutGate.stateId,
      })
    } else {
      delivery = await deliverDigest({
        storiesByLocale,
        dateLabel: issueDate,
        sentOn: issueDate,
        cadence: 'daily',
        subject: SUBJECT,
      })

      for (const locale of ['en', 'fr'] as const) {
        if (!delivery.durableByLocale[locale]) continue
        const { error: markError } = await db.rpc('digest_mark_locale_sent', {
          p_issue_date: issueDate,
          p_locale: locale,
        })
        if (markError) throw new Error(`Could not mark ${locale} digest slots sent: ${markError.message}`)
      }
    }

    const templates = await compileTemplatesForCadence('daily')
    logger.info('cron/daily-digest', 'daily digest run complete', {
      correlationId,
      durationMs: Date.now() - startedAt,
      issueDate,
      paused: fanoutGate.paused,
      delivery,
      retries,
      templates,
    })
    const failed = delivery.failed + retries.failed
    const uncertain = delivery.uncertain + retries.uncertain
    if (uncertain > 0) {
      logger.warn('cron/daily-digest', 'provider acceptance uncertain; operator review required', {
        correlationId,
        uncertain,
      })
    }
    return NextResponse.json(
      { ok: failed === 0, correlationId, issueDate, paused: fanoutGate.paused, delivery, retries, templates },
      { status: failed > 0 ? 502 : 200 },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Daily digest failed'
    logger.error('cron/daily-digest', 'daily digest failed', { correlationId, error: message })
    return NextResponse.json({ ok: false, error: message, correlationId }, { status: 502 })
  }
}

export async function POST(request: Request) {
  return stampHeartbeat('daily-digest', run(request))
}

export async function GET(request: Request) {
  return stampHeartbeat('daily-digest', run(request))
}
