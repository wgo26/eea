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

  for (const s of subs) {
    const fr = /^fr/i.test(s.locale ?? '')
    const locale: 'en' | 'fr' = fr ? 'fr' : 'en'
    const stories = storiesFor(fr)
    // W18 — diaspora framing: same stories, "home, today" heading for
    // readers following home from abroad.
    const { title, body } = buildDailyBrief(groupBriefStories(stories), {
      locale,
      dateLabel: options.dateLabel,
      siteUrl: SITE.url,
      digestPath: fr ? '/fr/digest' : '/en/digest',
      framing: s.diasporaMode ? 'diaspora' : 'standard',
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
    const { error: archiveError } = await db.from('digest_issues').upsert(
      {
        sent_on: options.sentOn,
        locale,
        cadence: options.cadence,
        subject: options.subject[locale],
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

const WEEKDAY_LABELS: Record<'en' | 'fr', string> = {
  en: 'Eagle Eye Africa — weekly recap',
  fr: 'Eagle Eye Africa — résumé hebdomadaire',
}

/**
 * Weekly recap (A5): aggregate the last `windowDays` of published items into
 * one issue sent Mondays. Reads published content directly (slots roll on),
 * so a missed week still covers its full window.
 */
export async function sendWeeklyDigest(windowDays = 7): Promise<DigestDelivery & { stories: number }> {
  const db = createAdminClient()
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()
  const { data, error } = await db
    .from('content_items')
    .select('id, type, slug, is_featured, published_at, translations:content_translations(locale, title, share_text)')
    .eq('status', 'published')
    .eq('is_archived', false)
    .gte('published_at', since)
    .order('is_featured', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(60)
  if (error || !data) {
    logger.error('digest/weekly', 'source fetch failed', { error: error?.message ?? 'no data' })
    return { ...empty(), stories: 0 }
  }
  const rows = data as unknown as {
    id: string
    type: string | null
    slug: string | null
    is_featured: boolean
    translations: { locale: string; title: string | null; share_text: string | null }[] | { locale: string; title: string | null; share_text: string | null } | null
  }[]

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
    subject: WEEKDAY_LABELS,
  })
  return { ...result, stories: byLocale.en.length + byLocale.fr.length }
}
