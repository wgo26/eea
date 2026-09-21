import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger, generateCorrelationId } from '@/lib/observability/logger'
import { bearerMatches } from '@/lib/security/secrets'
import { sendEmail, sendWhatsAppProactive } from '@/lib/notify/channels'
import { SITE } from '@/lib/constants'

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

type DigestStory = { title: string; path: string };

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
 */
async function latestBriefStories(): Promise<import('@/lib/digest/brief').BriefStory[]> {
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

/** Send the day's stories to active digest_subscribers (email + WhatsApp). */
async function deliverPublicDigest(correlationId: string): Promise<{ emailed: number; whatsapped: number; skipped: number }> {
  const out = { emailed: 0, whatsapped: 0, skipped: 0 };
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from('digest_subscribers')
      .select('email, phone, whatsapp, locale')
      .eq('is_active', true)
      .limit(500);
    if (error) {
      logger.error('cron/ops-digest', 'subscriber fetch failed', { correlationId, error: error.message });
      return out;
    }
    const subs = (data ?? []) as { email: string | null; phone: string | null; whatsapp: string | null; locale: string | null }[];
    if (subs.length === 0) return out;
    const briefStories = await latestBriefStories();
    if (briefStories.length === 0) {
      out.skipped = subs.length;
      return out;
    }
    const { groupBriefStories, buildDailyBrief } = await import('@/lib/digest/brief');
    const sections = groupBriefStories(briefStories);
    const stories: DigestStory[] = [...sections.visual, ...sections.community, ...sections.notices, ...sections.listings, ...sections.culture].map(
      (s) => ({ title: s.title, path: s.path }),
    );
    const dateLabel = new Date().toISOString().slice(0, 10);
    const perLocale: Record<string, { emailed: number; whatsapped: number }> = {};
    for (const s of subs) {
      const fr = /^fr/i.test(s.locale ?? '');
      const { title, body } = buildDailyBrief(sections, {
        locale: fr ? 'fr' : 'en',
        dateLabel,
        siteUrl: SITE.url,
        digestPath: fr ? '/fr/digest' : '/en/digest',
      });
      const url = `${SITE.url}/${fr ? 'fr' : 'en'}/digest`;
      const bucket = perLocale[fr ? 'fr' : 'en'] ?? { emailed: 0, whatsapped: 0 };
      perLocale[fr ? 'fr' : 'en'] = bucket;
      if (s.email && /^\S+@\S+\.\S+$/.test(s.email)) {
        const res = await sendEmail(s.email, title, title, body, url);
        if (res.delivered) {
          out.emailed += 1;
          bucket.emailed += 1;
        } else out.skipped += 1;
      }
      const phone = s.whatsapp ?? s.phone;
      if (phone) {
        // Digest recipients are never in the 24h window: template first when
        // WHATSAPP_TEMPLATE is configured (per-subscriber locale), else
        // best-effort free text.
        const res = await sendWhatsAppProactive(phone, `${title}\n${body}`, s.locale);
        if (res.delivered) {
          out.whatsapped += 1;
          bucket.whatsapped += 1;
        }
      }
    }
    // Archive one issue per served locale for the public /digest/archive page.
    const today = new Date().toISOString().slice(0, 10);
    for (const [issueLocale, counts] of Object.entries(perLocale)) {
      if (counts.emailed + counts.whatsapped === 0) continue;
      const { error: archiveError } = await db.from('digest_issues').upsert(
        {
          sent_on: today,
          locale: issueLocale,
          subject:
            issueLocale === 'fr' ? 'Eagle Eye Africa — résumé du jour' : 'Eagle Eye Africa — daily digest',
          stories,
          emailed: counts.emailed,
          whatsapped: counts.whatsapped,
        },
        { onConflict: 'sent_on,locale' },
      );
      if (archiveError) logger.error('cron/ops-digest', 'archive insert failed', { error: archiveError.message, correlationId });
    }
  } catch (err) {
    logger.error('cron/ops-digest', 'public fan-out exception', {
      correlationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return out;
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
  } else if (!bearerMatches(authHeader, cronSecret)) {
    logger.warn('cron/ops-digest', 'unauthorized invocation', { correlationId })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!webhook) {
    // Ops webhook unset — still deliver the public subscriber digest so the
    // user-facing loop never depends on staff webhook config.
    const fanout = await deliverPublicDigest(correlationId);
    logger.info('cron/ops-digest', 'DIGEST_WEBHOOK_URL unset — ops skipped, public fan-out ran', { correlationId, fanout })
    return NextResponse.json({ ok: true, skipped: true, reason: 'DIGEST_WEBHOOK_URL not configured', fanout })
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

  // Public daily-digest fan-out (gap B): active opt-in subscribers get the
  // day's published stories by email and/or WhatsApp. Best-effort — a fan-out
  // failure never fails the ops webhook above.
  const fanout = await deliverPublicDigest(correlationId)

  logger.info('cron/ops-digest', 'digest delivered', {
    correlationId,
    durationMs: Date.now() - startedAt,
    counts,
    fanout,
  })
  return NextResponse.json({ ok: true, correlationId, counts, fanout })
}

export async function POST(request: Request) {
  return runDigest(request)
}

export async function GET(request: Request) {
  return runDigest(request)
}