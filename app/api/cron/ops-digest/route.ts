import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger, generateCorrelationId } from '@/lib/observability/logger'
import { requireCronSecret } from '@/lib/security/cron-auth'
import { stampHeartbeat } from '@/lib/automation/heartbeat'
import { compileTemplatesForCadence } from '@/lib/content/templates-run'
import { buildTomorrowQueue, runAutoOpsSweep } from '@/lib/automation/ops-sweep'
import { deliverDigest, sendPersonalBriefs, type DigestDelivery } from '@/lib/digest/deliver'
import { parseDigestFreeze, hasFrozenStories, type FrozenDigest } from '@/lib/digest/freeze'
import type { BriefStory } from '@/lib/digest/brief'

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
 *
 * Public duties beyond the webhook: deliver the daily subscriber digest
 * (accumulated digest_slots), compile daily-cadence recap templates into
 * drafts (Stream B), and send personalized follow briefs (A6). All
 * best-effort after the webhook.
 */

const count = async (fn: (db: ReturnType<typeof createAdminClient>) => Promise<number>): Promise<number> => {
  try {
    return await fn(createAdminClient())
  } catch {
    return -1
  }
}

const BRIEF_SEGMENT: Record<string, string> = {
  news: 'news',
  micro_story: 'news',
  timeline: 'news',
  photo_story: 'photo-stories',
  listing: 'buy-sell',
  notice: 'notices',
  culture: 'culture',
};

/**
 * Phase 4 — WhatsApp-first Daily Brief (Differentiator #9). Curates the
 * freshest published stories per type (Diff. #9 caps live in
 * lib/digest/brief.ts), prefers the editor's Pidgin/Camfranglais share_text
 * per line, and links every line to the story URL (not the section index)
 * so WhatsApp unfurls the preview.
 *
 * Stream A (accumulating digest): the primary source is now the digest_slots
 * staging table — one snapshot row per (item, locale) written by the publish
 * trigger the moment content goes live. digest_freeze(today) returns every
 * still-open slot (issue_date <= today, never sent, not dropped by an
 * editor) ranked pinned → featured → oldest, per locale. legacyBriefStories
 * below is the pre-A fallback for when the slots migration is not applied
 * yet (rpc error), so deploys stay green either way.
 *
 * After delivery: daily-cadence recap templates are compiled (Stream B) and
 * personalized follow briefs go out (A6) — both best-effort, neither can
 * fail the nightly job.
 */
async function frozenBriefStories(): Promise<import('@/lib/digest/freeze').FrozenDigest | null> {
  try {
    const db = createAdminClient();
    const issueDate = new Date().toISOString().slice(0, 10);
    const { data, error } = await db.rpc('digest_freeze', { p_issue_date: issueDate });
    if (error) throw new Error(error.message);
    return parseDigestFreeze(data);
  } catch {
    return null;
  }
}

async function legacyBriefStories(): Promise<BriefStory[]> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from('content_items')
      .select('id, type, slug, translations:content_translations(locale, title, share_text)')
      .eq('status', 'published')
      .eq('is_archived', false)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(40);
    const rows = (data ?? []) as {
      id: string;
      type: string | null;
      slug: string | null;
      translations: { locale: string; title: string | null; share_text: string | null } | { locale: string; title: string | null; share_text: string | null }[] | null;
    }[];
    return rows.flatMap((r) => {
      const list = Array.isArray(r.translations) ? r.translations : r.translations ? [r.translations] : [];
      const preferred = list.find((t) => t.locale === 'en' && t.title) ?? list.find((t) => t.title);
      const title = preferred?.title ?? r.type ?? 'Story';
      if (!title) return [];
      const segment = BRIEF_SEGMENT[r.type ?? ''] ?? 'news';
      const shareText = list.find((t) => t.share_text?.trim())?.share_text ?? null;
      return [{
        title: title.slice(0, 120),
        type: r.type ?? 'news',
        path: `/${segment}/${r.slug ?? r.id}`,
        shareText,
      }];
    });
  } catch {
    return [];
  }
}

/** Stamp the day's delivered slots so a cron re-run never re-sends. */
async function markSlotsSent(): Promise<void> {
  try {
    const db = createAdminClient();
    const issueDate = new Date().toISOString().slice(0, 10);
    await db.rpc('digest_mark_sent', { p_issue_date: issueDate });
  } catch {
    // best-effort: an unmarked slot just re-enters tomorrow's issue.
  }
}

/** Send the day's stories to active digest_subscribers (email + WhatsApp). */
async function deliverPublicDigest(correlationId: string): Promise<DigestDelivery & { personal?: { sent: number; considered: number } }> {
  try {
    const frozen = await frozenBriefStories();
    let storiesByLocale: FrozenDigest
    let fromSlots = false
    if (frozen && hasFrozenStories(frozen)) {
      storiesByLocale = frozen
      fromSlots = true
    } else {
      const briefStories = await legacyBriefStories()
      storiesByLocale = { en: briefStories }
    }
    const today = new Date().toISOString().slice(0, 10)
    const delivery = await deliverDigest({
      storiesByLocale,
      dateLabel: today,
      sentOn: today,
      cadence: 'daily',
      subject: {
        en: 'Eagle Eye Africa — daily digest',
        fr: 'Eagle Eye Africa — résumé du jour',
      },
    })
    // Only stamp slots when delivery actually went out — an all-failed run
    // leaves the day's accumulation open for tonight's retry.
    if (fromSlots && delivery.emailed + delivery.whatsapped > 0) {
      await markSlotsSent()
    }
    let personal: { sent: number; considered: number } | undefined
    if (fromSlots) {
      // A6 — account holders with content follows get a filtered variant.
      personal = await sendPersonalBriefs(storiesByLocale, today)
    }
    return { ...delivery, personal }
  } catch (err) {
    logger.error('cron/ops-digest', 'public fan-out exception', {
      correlationId,
      error: err instanceof Error ? err.message : String(err),
    })
    return { emailed: 0, whatsapped: 0, skipped: 0 }
  }
}

async function runDigest(request: Request) {
  const correlationId = generateCorrelationId()
  const startedAt = Date.now()
  const denied = requireCronSecret(request, 'ops-digest', correlationId)
  if (denied) return denied
  const webhook = process.env.DIGEST_WEBHOOK_URL

  if (!webhook) {
    // Ops webhook unset — still deliver the public subscriber digest so the
    // user-facing loop never depends on staff webhook config.
    const fanout = await deliverPublicDigest(correlationId);
    const templates = await compileTemplatesForCadence('daily');
    const ops = await runAutoOpsSweep();
    logger.info('cron/ops-digest', 'DIGEST_WEBHOOK_URL unset — ops skipped, public fan-out ran', { correlationId, fanout, templates, ops })
    return NextResponse.json({ ok: true, skipped: true, reason: 'DIGEST_WEBHOOK_URL not configured', fanout, templates, ops })
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

  // Phase 2: abuse signal — rate-limit hits in the last 24 h (limiter volume
  // spike = someone probing anon intake). Best-effort; count() returns -1 on
  // error, normalized to null so the digest never fails on this signal.
  const abuseRaw = await count(async (db) => {
    const since = new Date(Date.now() - 24 * 3_600_000).toISOString()
    const { count, error } = await db
      .from('rate_limit_hits')
      .select('counter_key', { count: 'exact', head: true })
      .gte('window_start', since)
    if (error) throw new Error(error.message)
    return count ?? 0
  })
  const abuseHits24h = abuseRaw < 0 ? null : abuseRaw

  // D5 — "tomorrow's queue" so staff plan once from this message instead of
  // polling four admin pages through the day. Best-effort like every stat.
  const tomorrow = await buildTomorrowQueue().catch(() => null)

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
          { name: 'Abuse hits 24h', value: abuseHits24h == null ? 'n/a' : String(abuseHits24h), inline: true },
          ...(tomorrow
            ? [
                { name: 'Due to publish', value: String(tomorrow.dueScheduled), inline: true },
                { name: 'Idle drafts 7d+', value: String(tomorrow.idleDrafts), inline: true },
                { name: 'Expiring ≤14d', value: String(tomorrow.expiring), inline: true },
                { name: 'Translation queue', value: String(tomorrow.translationGaps), inline: true },
              ]
            : []),
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
    abuseHits24h,
  }

  // Public daily-digest fan-out (gap B): active opt-in subscribers get the
  // day's published stories by email and/or WhatsApp. Best-effort — a fan-out
  // failure never fails the ops webhook above.
  const fanout = await deliverPublicDigest(correlationId)

  // Stream B: compile daily-cadence recap templates into drafts. Also
  // best-effort — template errors are reported in the response, never thrown.
  const templates = await compileTemplatesForCadence('daily')

  // Stream E: the nightly auto-ops sweep (pitch winner, stale slots, feature
  // ladder, translation gaps, poll/fundraiser/contributor loops, expiry
  // batch, stuck-scheduled detector). Every routine is independently guarded
  // so one failure cannot break the digest or the others.
  const ops = await runAutoOpsSweep()

  logger.info('cron/ops-digest', 'digest delivered', {
    correlationId,
    durationMs: Date.now() - startedAt,
    counts,
    tomorrow,
    fanout,
    templates,
    ops,
  })
  return NextResponse.json({ ok: true, correlationId, counts, tomorrow, fanout, templates, ops })
}

export async function POST(request: Request) {
  return stampHeartbeat('ops-digest', runDigest(request))
}

export async function GET(request: Request) {
  return stampHeartbeat('ops-digest', runDigest(request))
}