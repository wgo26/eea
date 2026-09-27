import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/observability/logger'
import { sendEmail, sendWhatsAppProactive } from '@/lib/notify/channels'
import { SITE } from '@/lib/constants'
import { buildDailyBrief, groupBriefStories, type BriefStory } from './brief'

/**
 * Shared digest delivery (Stream A). One place renders + sends a brief
 * (daily ops-digest, weekly recap, personalized follow briefs) and archives
 * the issue, so subject lines, diaspora framing, locale fallback, and the
 * digest_issues upsert (sent_on + locale + cadence) can never drift between
 * the three senders.
 */

export type DigestDelivery = { emailed: number; whatsapped: number; skipped: number }

export type DigestDeliverOptions = {
  /** Per-locale story lists; a locale with an empty list borrows the other's. */
  storiesByLocale: Partial<Record<'en' | 'fr', BriefStory[]>>
  /** Display label in the brief heading (e.g. '2026-09-25' or 'week of 09-19'). */
  dateLabel: string
  /** The day the issue covers (digest_issues.sent_on). */
  sentOn: string
  cadence: 'daily' | 'weekly'
  subject: { en: string; fr: string }
  /**
   * P3 — admin-previewed intro/subject override (from /admin/digest
   * Regenerate). When absent the send path resolves its own AI intro
   * best-effort (flag + key gated, offline = no intro line).
   */
  introOverride?: Partial<Record<'en' | 'fr', { intro: string; subject: string }>>
  /** Defaults to all active digest_subscribers; personalized senders pass their own recipients. */
  recipients?: PersonalRecipient[]
  /** Personalized variants default to false — only site-wide issues belong in the public archive. */
  archive?: boolean
}

export type PersonalRecipient = {
  email: string | null
  phone: string | null
  whatsapp: string | null
  locale: string | null
  diasporaMode: boolean | null
}

async function activeSubscribers(): Promise<PersonalRecipient[]> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('digest_subscribers')
    .select('email, phone, whatsapp, locale, diaspora_mode')
    .eq('is_active', true)
    .limit(500)
  if (error) {
    logger.error('digest/deliver', 'subscriber fetch failed', { error: error.message })
    return []
  }
  return ((data ?? []) as {
    email: string | null
    phone: string | null
    whatsapp: string | null
    locale: string | null
    diaspora_mode: boolean | null
  }[]).map((s) => ({
    email: s.email,
    phone: s.phone,
    whatsapp: s.whatsapp,
    locale: s.locale,
    diasporaMode: s.diaspora_mode,
  }))
}

const empty = (): DigestDelivery => ({ emailed: 0, whatsapped: 0, skipped: 0 })

/**
 * P3 — best-effort AI intro per locale. Returns null when the layer is
 * off/unconfigured/over budget (the brief renders identically to before —
 * no intro line, default subject). Never throws: a failed intro must not
 * fail the nightly fan-out. An admin `introOverride` (previewed in
 * /admin/digest) wins over a fresh generation.
 */
async function resolveAiIntro(
  locale: 'en' | 'fr',
  dateLabel: string,
  stories: BriefStory[],
  override?: { intro: string; subject: string },
): Promise<{ intro: string | null; subject: string | null }> {
  if (override && (override.intro.trim() || override.subject.trim())) {
    return { intro: override.intro.trim().slice(0, 220) || null, subject: override.subject.trim().slice(0, 70) || null }
  }
  try {
    const { getLlmRuntime } = await import('@/lib/ai/settings')
    const { getAppFlag } = await import('@/lib/automation/flags')
    const rt = await getLlmRuntime()
    if (!rt.apiKey || rt.disabled) return { intro: null, subject: null }
    if (!(await getAppFlag<boolean>('ai.digest_intro', true))) return { intro: null, subject: null }
    const { llmDigestIntro } = await import('@/lib/translate/prompts')
    const { logLlmCall } = await import('@/lib/translate/llm')
    const out = await llmDigestIntro({ locale, dateLabel, headlines: stories.map((x) => x.title).slice(0, 12) })
    await logLlmCall({ action: 'ai.digest_intro_send', model: rt.model, status: 'ok' })
    return { intro: out.intro.trim().slice(0, 220) || null, subject: out.subject.trim().slice(0, 70) || null }
  } catch (e) {
    logger.warn('digest/intro', 'AI intro fell back to offline', { error: e instanceof Error ? e.message.slice(0, 120) : 'error', locale })
    return { intro: null, subject: null }
  }
}

/** Render + send the brief to each recipient, then archive one issue per served locale. */
export async function deliverDigest(options: DigestDeliverOptions): Promise<DigestDelivery> {
  const out = empty()
  const subs = options.recipients ?? (await activeSubscribers())
  if (subs.length === 0) return out

  const enStories = options.storiesByLocale.en ?? []
  const frStories = options.storiesByLocale.fr ?? []
  if (enStories.length === 0 && frStories.length === 0) {
    out.skipped = subs.length
    return out
  }

  const storiesFor = (fr: boolean): BriefStory[] =>
    (fr ? frStories : enStories).length > 0
      ? (fr ? frStories : enStories)
      : fr
        ? enStories
        : frStories

  const archiveStories: Record<'en' | 'fr', { title: string; path: string }[]> = { en: [], fr: [] }
  const perLocaleDelivered: Record<'en' | 'fr', { emailed: number; whatsapped: number }> = {
    en: { emailed: 0, whatsapped: 0 },
    fr: { emailed: 0, whatsapped: 0 },
  }

  // P3 — resolve one AI intro per served locale (cached per delivery, not
  // per recipient, so 500 subscribers cost 2 LLM calls, not 500).
  const introCache = new Map<'en' | 'fr', { intro: string | null; subject: string | null }>()
  const introFor = async (locale: 'en' | 'fr'): Promise<{ intro: string | null; subject: string | null }> => {
    const hit = introCache.get(locale)
    if (hit) return hit
    const pool = locale === 'fr' ? frStories : enStories
    const val = await resolveAiIntro(locale, options.dateLabel, pool.length > 0 ? pool : [...enStories, ...frStories].slice(0, 12), options.introOverride?.[locale])
    introCache.set(locale, val)
    return val
  }

  for (const s of subs) {
    const fr = /^fr/i.test(s.locale ?? '')
    const locale: 'en' | 'fr' = fr ? 'fr' : 'en'
    const stories = storiesFor(fr)
    const ai = await introFor(locale)
    // W18 — diaspora framing: same stories, "home, today" heading for
    // readers following home from abroad.
    const { title, body } = buildDailyBrief(groupBriefStories(stories), {
      locale,
      dateLabel: options.dateLabel,
      siteUrl: SITE.url,
      digestPath: fr ? '/fr/digest' : '/en/digest',
      framing: s.diasporaMode ? 'diaspora' : 'standard',
      intro: ai.intro,
      subject: ai.subject ?? options.subject[locale],
    })
    const url = `${SITE.url}/${locale}/digest`
    if (archiveStories[locale].length === 0) {
      archiveStories[locale] = stories.map((story) => ({ title: story.title, path: story.path }))
    }
    if (s.email && /^\S+@\S+\.\S+$/.test(s.email)) {
      const res = await sendEmail(s.email, title, title, body, url)
      if (res.delivered) {
        out.emailed += 1
        perLocaleDelivered[locale].emailed += 1
      } else out.skipped += 1
    }
    const phone = s.whatsapp ?? s.phone
    if (phone) {
      // Digest recipients are never in the 24h window: template first when
      // WHATSAPP_TEMPLATE is configured (per-subscriber locale), else
      // best-effort free text.
      const res = await sendWhatsAppProactive(phone, `${title}\n${body}`, s.locale)
      if (res.delivered) {
        out.whatsapped += 1
        perLocaleDelivered[locale].whatsapped += 1
      }
    }
  }

  const db = createAdminClient()
  if (options.archive === false) return out
  for (const locale of ['en', 'fr'] as const) {
    const counts = perLocaleDelivered[locale]
    if (counts.emailed + counts.whatsapped === 0) continue
    const archivedSubject = introCache.get(locale)?.subject?.trim() || options.subject[locale]
    const { error: archiveError } = await db.from('digest_issues').upsert(
      {
        sent_on: options.sentOn,
        locale,
        cadence: options.cadence,
        subject: archivedSubject,
        stories: archiveStories[locale],
        emailed: counts.emailed,
        whatsapped: counts.whatsapped,
      },
      { onConflict: 'sent_on,locale,cadence' },
    )
    if (archiveError) {
      logger.error('digest/deliver', 'archive upsert failed', { error: archiveError.message, locale, cadence: options.cadence })
    }
  }
  return out
}

const WEEKLY_SUBJECT: Record<'en' | 'fr', string> = {
  en: 'Eagle Eye Africa — weekly recap',
  fr: 'Eagle Eye Africa — résumé hebdomadaire',
}

/* ------------------------------------------------------------------ */
/* Personalized follow briefs (A6)                                    */
/* ------------------------------------------------------------------ */

type FollowRow = { user_id: string; content_type: string; category_id: string | null; location_id: string | null }
type ProfileRow = { id: string; email: string | null; phone: string | null; preferred_locale: string }

/** Does one frozen story match one follow row (type / location / category)? */
export function matchesFollow(story: BriefStory, follow: FollowRow): boolean {
  if (follow.location_id) return story.locationId === follow.location_id
  if (follow.category_id) return story.categoryId === follow.category_id
  return story.type === follow.content_type || (follow.content_type === 'news' && story.type === 'micro_story')
}

/**
 * Personal daily briefs for account holders with content follows: same
 * frozen slot pool as the site-wide digest, filtered to what they follow.
 * Email-only (profile email), min two matches — a one-story personal brief
 * is noise the site-wide send already covers. Never archived (personal
 * variants belong to the recipient, not the public /digest/archive page).
 */
export async function sendPersonalBriefs(
  storiesByLocale: Partial<Record<'en' | 'fr', BriefStory[]>>,
  dateLabel: string,
): Promise<{ sent: number; considered: number }> {
  const result = { sent: 0, considered: 0 }
  try {
    const db = createAdminClient()
    const { data: follows } = await db
      .from('content_follows')
      .select('user_id, content_type, category_id, location_id')
      .limit(5000)
    const rows = (follows ?? []) as FollowRow[]
    if (rows.length === 0) return result
    const userIds = [...new Set(rows.map((f) => f.user_id))].slice(0, 200)
    const { data: profiles } = await db
      .from('profiles')
      .select('id, email, phone, preferred_locale')
      .in('id', userIds)
    const profileById = new Map(((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p]))
    const followsByUser = new Map<string, FollowRow[]>()
    for (const f of rows) {
      const list = followsByUser.get(f.user_id) ?? []
      list.push(f)
      followsByUser.set(f.user_id, list)
    }
    for (const userId of userIds) {
      const profile = profileById.get(userId)
      if (!profile?.email || !/^\S+@\S+\.\S+$/.test(profile.email)) continue
      const userFollows = followsByUser.get(userId) ?? []
      if (userFollows.length === 0) continue
      result.considered += 1
      const fr = /^fr/i.test(profile.preferred_locale ?? '')
      const pool = (fr ? storiesByLocale.fr : storiesByLocale.en) ?? storiesByLocale.en ?? []
      const personal = pool.filter((story) => userFollows.some((f) => matchesFollow(story, f)))
      if (personal.length < 2) continue
      const { title, body } = buildDailyBrief(groupBriefStories(personal), {
        locale: fr ? 'fr' : 'en',
        dateLabel,
        siteUrl: SITE.url,
        digestPath: fr ? '/fr/digest' : '/en/digest',
        framing: 'standard',
      })
      const res = await sendEmail(profile.email, title, title, body, `${SITE.url}/${fr ? 'fr' : 'en'}/digest`)
      if (res.delivered) result.sent += 1
    }
  } catch (e) {
    logger.error('digest/personal', 'personal briefs failed', { error: e instanceof Error ? e.message : String(e) })
  }
  return result
}

/**
 * Weekly recap (A5): aggregate the last `windowDays` of FIRST-published
 * items into one issue sent Mondays. Reads published content directly
 * (slots roll on), so a missed week still covers its full window.
 *
 * Duplicate-proof: filters on first_published_at (edits bump updated_at,
 * never first_published_at) AND excludes ids already frozen into
 * digest_slots with sent_at set — an edit can never re-enter as "this week".
 */
export async function sendWeeklyDigest(windowDays = 7): Promise<DigestDelivery & { stories: number }> {
  const db = createAdminClient()
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()
  // ids already delivered via the daily slots must not re-send in weekly
  const { data: sent } = await db
    .from('digest_slots')
    .select('content_item_id')
    .not('sent_at', 'is', null)
    .limit(5000)
  const sentIds = new Set(((sent ?? []) as { content_item_id: string }[]).map((r) => r.content_item_id))
  // first_published_at is new (migration 20261114000000) — fall back to
  // published_at on rows/deployments where it is still null.
  const { data, error } = await db
    .from('content_items')
    .select('id, type, slug, is_featured, published_at, first_published_at, updated_at, translations:content_translations(locale, title, share_text)')
    .eq('status', 'published')
    .eq('is_archived', false)
    .order('is_featured', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(120)
  if (error || !data) {
    logger.error('digest/weekly', 'source fetch failed', { error: error?.message ?? 'no data' })
    return { ...empty(), stories: 0 }
  }
  const rows = (data as unknown as {
    id: string
    type: string | null
    slug: string | null
    is_featured: boolean
    published_at: string | null
    first_published_at?: string | null
    updated_at?: string | null
    translations: { locale: string; title: string | null; share_text: string | null }[] | { locale: string; title: string | null; share_text: string | null } | null
  }[]).filter((r) => {
    if (sentIds.has(r.id)) return false
    // An edit bumps updated_at but not first_published_at — only the
    // first go-live date counts for weekly inclusion.
    const first = r.first_published_at ?? r.published_at
    if (!first) return false
    return Date.parse(first) >= Date.parse(since)
  }).slice(0, 60)

  const SECTION_PATH: Record<string, string> = {
    photo_story: 'photo-stories',
    notice: 'notices',
    listing: 'buy-sell',
    culture: 'culture',
    news: 'news',
    micro_story: 'news',
  }

  const byLocale: Record<'en' | 'fr', BriefStory[]> = { en: [], fr: [] }
  for (const r of rows) {
    const list = Array.isArray(r.translations) ? r.translations : r.translations ? [r.translations] : []
    for (const locale of ['en', 'fr'] as const) {
      const tx = list.find((t) => t.locale === locale && t.title)
      const title = tx?.title ?? list.find((t) => t.title)?.title
      if (!title) continue
      byLocale[locale].push({
        title: title.slice(0, 120),
        type: r.type ?? 'news',
        path: `/${SECTION_PATH[r.type ?? 'news'] ?? 'news'}/${r.slug ?? r.id}`,
        shareText: tx?.share_text ?? null,
        contentItemId: r.id,
      })
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const label = new Date().toISOString().slice(5, 10)
  const result = await deliverDigest({
    storiesByLocale: byLocale,
    dateLabel: `week of ${label}`,
    sentOn: today,
    cadence: 'weekly',
    subject: WEEKLY_SUBJECT,
  })
  return { ...result, stories: byLocale.en.length + byLocale.fr.length }
}
