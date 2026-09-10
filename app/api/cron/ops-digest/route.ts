import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger, generateCorrelationId } from '@/lib/observability/logger'

export const dynamic = 'force-dynamic'

/**
 * Nightly ops digest (P1 — moderation-loop visibility). Summarises the queue
 * sizes staff currently have to poll the admin UI to see and POSTs them to a
 * Discord/Slack-compatible webhook (DIGEST_WEBHOOK_URL). It doubles as a
 * watchdog: even with zero pending items it posts, so a failure of the nightly
 * call is itself the alert (surfaced by the GitHub schedule run failing).
 *
 * Queue stats (cheap head-count queries on the service-role client):
 *   - moderation: submissions pending / in_review / needs_clarification
 *   - legal inbox: reports with status 'open' (takedown + data requests)
 *   - ads: ad_campaigns still in status 'pending' (the pending-inquiries queue)
 *   - storage: media assets pending backup, pending verification
 *   - staff: user_roles row count
 *
 * Auth: CRON_SECRET bearer — same fail-closed pattern as db-maintenance
 * (missing secret = 500 in production, wrong secret = 401). No-op (200) when
 * DIGEST_WEBHOOK_URL is unset so the schedule is harmless until configured.
 */

const count = async (fn: (db: ReturnType<typeof createAdminClient>) => Promise<number>): Promise<number> => {
  try {
    return await fn(createAdminClient())
  } catch {
    return -1
  }
}

async function runDigest(request: Request) {
  const correlationId = generateCorrelationId()
  const startedAt = Date.now()
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const webhook = process.env.DIGEST_WEBHOOK_URL

  if (!cronSecret) {
    logger.error('cron/ops-digest', 'CRON_SECRET not configured', { correlationId })
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ ok: false, error: 'Digest cron not configured' }, { status: 500 })
    }
    logger.warn('cron/ops-digest', 'running without CRON_SECRET (non-production only)', { correlationId })
  } else if (authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('cron/ops-digest', 'unauthorized invocation', { correlationId })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!webhook) {
    logger.info('cron/ops-digest', 'DIGEST_WEBHOOK_URL unset — digest skipped', { correlationId })
    return NextResponse.json({ ok: true, skipped: true, reason: 'DIGEST_WEBHOOK_URL not configured' })
  }

  const moderationPending = await count(async (db) => {
    const { count } = await db
      .from('submissions')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'in_review', 'needs_clarification'])
    return count ?? 0
  })

  const legalInboxOpen = await count(async (db) => {
    const { count } = await db.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open')
    return count ?? 0
  })

  const adsInquiriesOpen = await count(async (db) => {
    const { count } = await db
      .from('ad_campaigns')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
    return count ?? 0
  })

  const storagePendingBackup = await count(async (db) => {
    const { count } = await db
      .from('media_assets')
      .select('id', { count: 'exact', head: true })
      .eq('provider', 'r2')
      .is('backed_up_at', null)
    return count ?? 0
  })

  const storagePendingVerification = await count(async (db) => {
    const { count } = await db
      .from('media_assets')
      .select('id', { count: 'exact', head: true })
      .eq('verification_status', 'pending')
    return count ?? 0
  })

  const staffCount = await count(async (db) => {
    const { count } = await db.from('user_roles').select('user_id', { count: 'exact', head: true })
    return count ?? 0
  })

  const payload = JSON.stringify({
    content: `**Eagle Eye Africa — ops digest** (${new Date().toISOString()})`,
    embeds: [
      {
        color: 0xf59e0b,
        fields: [
          { name: 'Moderation queue', value: String(moderationPending), inline: true },
          { name: 'Legal inbox', value: String(legalInboxOpen), inline: true },
          { name: 'Ad inquiries', value: String(adsInquiriesOpen), inline: true },
          { name: 'Pending backup', value: String(storagePendingBackup), inline: true },
          { name: 'Pending verification', value: String(storagePendingVerification), inline: true },
          { name: 'Staff', value: String(staffCount), inline: true },
        ],
      },
    ],
  })

  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: payload,
    })
    if (!res.ok) {
      logger.error('cron/ops-digest', 'webhook rejected the digest', {
        correlationId,
        status: res.status,
        webhookHost: new URL(webhook).host,
      })
      return NextResponse.json({ ok: false, error: `Webhook replied ${res.status}`, correlationId }, { status: 502 })
    }
  } catch (err) {
    logger.error('cron/ops-digest', 'webhook POST failed', {
      correlationId,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Digest delivery failed', correlationId },
      { status: 502 },
    )
  }

  const counts = {
    moderationPending,
    legalInboxOpen,
    adsInquiriesOpen,
    storagePendingBackup,
    storagePendingVerification,
    staffCount,
  }

  logger.info('cron/ops-digest', 'digest delivered', {
    correlationId,
    durationMs: Date.now() - startedAt,
    counts,
  })
  return NextResponse.json({ ok: true, correlationId, counts })
}

export async function POST(request: Request) {
  return runDigest(request)
}

export async function GET(request: Request) {
  return runDigest(request)
}