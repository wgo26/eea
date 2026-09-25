import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger, generateCorrelationId } from '@/lib/observability/logger'
import { requireCronSecret } from '@/lib/security/cron-auth'
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
 *
 * Stream A (accumulating digest): the primary source is now the digest_slots
 * staging table — one snapshot row per (item, locale) written by the publish
 * trigger the moment content goes live. digest_freeze(today) returns every
 * still-open slot (issue_date <= today, never sent, not dropped by an
 * editor) ranked pinned → featured → oldest, per locale. legacyBriefStories
 * below is the pre-A fallback for when the slots migration is not applied
 * yet (rpc error), so deploys stay green either way.
 */
async function frozenBriefStories(): Promise<Record<'en' | 'fr', import('@/lib/digest/brief').BriefStory[]> | null> {
  try {
    const db = createAdminClient();
    const issueDate = new Date().toISOString().slice(0, 10);
    const { data, error } = await db.rpc('digest_freeze', { p_issue_date: issueDate });
    if (error) throw new Error(error.message);
    const map = (data ?? {}) as Record<string, { title: string; type: string; path: string; shareText: string | null }[]>;
    if (!Array.isArray(map.en) && !Array.isArray(map.fr)) return null;
    const toStories = (rows: { title: string; type: string; path: string; shareText: string | null }[] | undefined) =>
      (rows ?? []).map((r) => ({
        title: String(r.title ?? '').slice(0, 120),
        type: String(r.type ?? 'news'),
        path: String(r.path ?? '/news'),
        shareText: r.shareText ?? null,
      }));
    return { en: toStories(map.en), fr: toStories(map.fr) };
  } catch {
    return null;
  }
}

async function legacyBriefStories(): Promise<import('@/lib/digest/brief').BriefStory[]> {
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
async function deliverPublicDigest(correlationId: string): Promise<{ emailed: number; whatsapped: number; skipped: number }> {
  const out = { emailed: 0, whatsapped: 0, skipped: 0 };
  try {
    const db = createAdminClient();
    const { data, error } = await db
      .from('digest_subscribers')
      .select('email, phone, whatsapp, locale, diaspora_mode')
      .eq('is_active', true)
      .limit(500);
    if (error) {
      logger.error('cron/ops-digest', 'subscriber fetch failed', { correlationId, error: error.message });
      return out;
    }
    const subs = (data ?? []) as { email: string | null; phone: string | null; whatsapp: string | null; locale: string | null; diaspora_mode: boolean | null }[];
    if (subs.length === 0) return out;

    const { groupBriefStories } = await import('@/lib/digest/brief');
    const frozen = await frozenBriefStories();
    if (frozen && (frozen.en.length > 0 || frozen.fr.length > 0)) {
      // Stream A path: per-locale snapshots; an empty locale borrows the
      // other one's list (same cross-locale fallback the legacy path had).
      const sectionsFor = (locale: 'en' | 'fr') =>
        groupBriefStories(
          frozen[locale].length > 0
            ? frozen[locale]
            : (locale === 'en' ? frozen.fr : frozen.en),
        );
      const storiesOf = (locale: 'en' | 'fr') => {
        const s = sectionsFor(locale);
        return [...s.visual, ...s.community, ...s.notices, ...s.listings, ...s.culture].map(
          (story) => ({ title: story.title, path: story.path }),
        );
      };
      await fanOut(subs, (fr) => ({ sectionsFor: sectionsFor(fr ? 'fr' : 'en'), stories: storiesOf(fr ? 'fr' : 'en') }), correlationId, out, db);
      await markSlotsSent();
      return out;
    }

    const briefStories = await legacyBriefStories();
    if (briefStories.length === 0) {
      out.skipped = subs.length;
      return out;
    }
    const sections = groupBriefStories(briefStories);
    const stories: DigestStory[] = [...sections.visual, ...sections.community, ...sections.notices, ...sections.listings, ...sections.culture].map(
      (s) => ({ title: s.title, path: s.path }),
    );
    await fanOut(subs, () => ({ sectionsFor: sections, stories }), correlationId, out, db);
  } catch (err) {
    logger.error('cron/ops-digest', 'public fan-out exception', {
      correlationId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return out;
}

type FanoutDb = ReturnType<typeof createAdminClient>;

async function fanOut(
  subs: { email: string | null; phone: string | null; whatsapp: string | null; locale: string | null; diaspora_mode: boolean | null }[],
  forLocale: (fr: boolean) => { sectionsFor: import('@/lib/digest/brief').BriefSections; stories: DigestStory[] },
  correlationId: string,
  out: { emailed: number; whatsapped: number; skipped: number },
  db: FanoutDb,
): Promise<void> {
  const { buildDailyBrief } = await import('@/lib/digest/brief');
  const dateLabel = new Date().toISOString().slice(0, 10);
  const perLocale: Record<string, { emailed: number; whatsapped: number }> = {};
  for (const s of subs) {
    const fr = /^fr/i.test(s.locale ?? '');
    const { sectionsFor } = forLocale(fr);
    // W18 — diaspora framing: same stories, "home, today" heading for
    // readers following home from abroad. Timezone-aware send times are a
    // recorded follow-up (the cron fires once nightly for everyone).
    const { title, body } = buildDailyBrief(sectionsFor, {
      locale: fr ? 'fr' : 'en',
      dateLabel,
      siteUrl: SITE.url,
      digestPath: fr ? '/fr/digest' : '/en/digest',
      framing: s.diaspora_mode ? 'diaspora' : 'standard',
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
    const { stories } = forLocale(issueLocale === 'fr');
    const { error: archiveError } = await db.from('digest_issues').upsert(
      {
        sent_on: today,
        locale: issueLocale,
        cadence: 'daily',
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