import 'server-only'

import type { Locale } from '@/lib/i18n'
import { db, safe } from './shared'

/* ------------------------------------------------------------------ */
/* Fundraising campaigns (admin management)                           */
/* ------------------------------------------------------------------ */

export type AdminFundraiserRow = {
  contentItemId: string
  slug: string | null
  storyType: string | null
  storyTitle: string | null
  storyTitleEn: string | null
  storyTitleFr: string | null
  storyBodyEn: string | null
  storyBodyFr: string | null
  /** True when the story has translations but none in the requested locale. */
  missingLocale: boolean
  storyStatus: string | null
  goalAmount: number
  raisedAmount: number
  currency: string
  organizerName: string | null
  organizerPhone: string | null
  organizerEmail: string | null
  donationUrl: string | null
  payoutMethod: string | null
  payoutAccount: string | null
  payoutAccountName: string | null
  verificationNotes: string | null
  closedAt: string | null
  deadlineAt: string | null
}

/**
 * Paginated page of fundraiser campaigns with its parent story. `content_item_id`
 * is the fundraisers primary key, so the join is one-to-one. The story title
 * prefers the requested locale so /fr/admin/fundraisers shows French titles
 * instead of leaking English copy into the French back office. Search matches
 * the story slug, both translation titles, and the organizer name.
 */
export async function getFundraisersAdmin(options?: {
  search?: string
  limit?: number
  offset?: number
  locale?: Locale
}): Promise<{ rows: AdminFundraiserRow[]; total: number }> {
  const locale = options?.locale ?? 'en'
  const search = options?.search?.trim() ?? ''
  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0

  // Title search runs against the translation table first (PostgREST cannot
  // filter on an embedded resource), then narrows fundraisers to those ids.
  let contentIdFilter: string[] | null = null
  if (search) {
    const [slugMatches, titleMatches] = await Promise.all([
      safe(db().from('content_items').select('id').ilike('slug', `%${search}%`)),
      safe(db().from('content_translations').select('content_item_id').ilike('title', `%${search}%`)),
    ])
    const ids = new Set<string>()
    for (const r of (slugMatches.data ?? []) as { id: string }[]) ids.add(r.id)
    for (const r of (titleMatches.data ?? []) as { content_item_id: string }[]) ids.add(r.content_item_id)
    if (ids.size === 0) return { rows: [], total: 0 }
    contentIdFilter = Array.from(ids)
  }

  let query = db()
      .from('fundraisers')
      .select(`content_item_id, goal_amount, currency, raised_amount, organizer_name,
        organizer_phone, organizer_email, donation_url, payout_method, payout_account, payout_account_name, verification_notes, closed_at,
        story:content_items(id, slug, type, status, expires_at,
          translations:content_translations(locale, title, body))`, { count: 'exact' })
      .order('content_item_id', { ascending: false })
      .range(offset, offset + limit - 1)
  if (search) {
    query = query.or(
      [
        `organizer_name.ilike.%${search}%`,
        `content_item_id.in.(${contentIdFilter!.join(',')})`,
      ].join(','),
    )
  }
  const res = await safe(query)
  const data = res.data

  const rows = (data ?? []).map((row) => {
    const story = Array.isArray(row.story) ? row.story[0] : row.story
    const translations = story && Array.isArray(story.translations) ? story.translations : []
    const list = translations as { locale: string; title: string | null; body: string | null }[]
    const titleEn = list.find((x) => x.locale === 'en')?.title ?? null
    const titleFr = list.find((x) => x.locale === 'fr')?.title ?? null
    const bodyEn = list.find((x) => x.locale === 'en')?.body ?? null
    const bodyFr = list.find((x) => x.locale === 'fr')?.body ?? null
    const localized = list.find(
      (x) => x.locale === locale && x.title,
    )
    const title =
      localized?.title ??
      list.find((x) => x.title)?.title ??
      null
    const missingLocale = list.length > 0 && !list.some((x) => x.locale === locale && x.title)
    return {
      contentItemId: row.content_item_id,
      slug: story?.slug ?? null,
      storyTitle: title,
      storyTitleEn: titleEn,
      storyTitleFr: titleFr,
      storyBodyEn: bodyEn,
      storyBodyFr: bodyFr,
      missingLocale,
      storyType: story?.type ?? null,
      storyStatus: story?.status ?? null,
      goalAmount: Number(row.goal_amount ?? 0),
      raisedAmount: Number(row.raised_amount ?? 0),
      currency: (row.currency ?? 'XAF').trim(),
      organizerName: row.organizer_name,
      organizerPhone: row.organizer_phone,
      organizerEmail: row.organizer_email,
      donationUrl: row.donation_url,
      payoutMethod: row.payout_method,
      payoutAccount: row.payout_account,
      payoutAccountName: row.payout_account_name,
      verificationNotes: row.verification_notes,
      closedAt: row.closed_at,
      deadlineAt: story?.expires_at ?? null,
    }
  })
  return { rows, total: res.count ?? rows.length }
}

/* ------------------------------------------------------------------ */
/* Legal policies (admin management)                                */
/* ------------------------------------------------------------------ */

export type AdminPolicyRow = {
  id: string
  policyType: string
  locale: string
  version: string
  isCurrent: boolean
  publishedAt: string | null
  content: string | null
  excerpt: string | null
}

/** Every policy version, newest first — the /about/* source of truth. */
export async function getPoliciesAdmin(limit = 100): Promise<AdminPolicyRow[]> {
  const { data } = await safe(
    db()
      .from('policy_versions')
      .select('id, policy_type, locale, version, is_current, published_at, content')
      .order('published_at', { ascending: false })
      .limit(limit),
  )
  return ((data ?? []) as {
    id: string
    policy_type: string
    locale: string
    version: string
    is_current: boolean
    published_at: string | null
    content: string | null
  }[]).map((row) => ({
    id: row.id,
    policyType: row.policy_type,
    locale: row.locale,
    version: row.version,
    isCurrent: row.is_current,
    publishedAt: row.published_at,
    content: row.content,
    excerpt: row.content ? row.content.slice(0, 140) : null,
  }))
}

/* ------------------------------------------------------------------ */
/* About index overrides (admin-editable copy, dict fallback)         */
/* ------------------------------------------------------------------ */

export const ABOUT_SECTION_KEYS = [
  'hero',
  'loop',
  'stats',
  'pipeline',
  'values',
  'charter',
  'closing',
] as const

export type AboutSectionKey = (typeof ABOUT_SECTION_KEYS)[number]

export type AboutSectionRow = {
  id: string
  sectionKey: string
  locale: string
  heading: string | null
  body: string | null
  ctaLabel: string | null
  ctaHref: string | null
  isActive: boolean
  updatedAt: string | null
}

/** All overrides (both locales) for the admin editor. */
export async function getAboutSectionsAdmin(): Promise<AboutSectionRow[]> {
  const { data } = await safe(
    db()
      .from('about_sections')
      .select('id, section_key, locale, heading, body, cta_label, cta_href, is_active, updated_at')
      .order('section_key', { ascending: true }),
  )
  return ((data ?? []) as {
    id: string
    section_key: string
    locale: string
    heading: string | null
    body: string | null
    cta_label: string | null
    cta_href: string | null
    is_active: boolean
    updated_at: string | null
  }[]).map((row) => ({
    id: row.id,
    sectionKey: row.section_key,
    locale: row.locale,
    heading: row.heading,
    body: row.body,
    ctaLabel: row.cta_label,
    ctaHref: row.cta_href,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  }))
}

/** Active overrides for one locale — the public /about page merges these
 *  over the dictionary (empty table = dictionary defaults, never blank). */
export async function getAboutOverrides(
  locale: Locale,
): Promise<Partial<Record<AboutSectionKey, AboutSectionRow>>> {
  const rows = await getAboutSectionsAdmin()
  const map: Partial<Record<AboutSectionKey, AboutSectionRow>> = {}
  for (const row of rows) {
    if (row.locale === locale && row.isActive) {
      map[row.sectionKey as AboutSectionKey] = row
    }
  }
  return map
}

/* ------------------------------------------------------------------ */
/* Advertise page overrides (admin-editable copy, dict fallback)      */
/* ------------------------------------------------------------------ */

export const ADVERTISE_SECTION_KEYS = [
  'title',
  'tagline',
  'intro',
  'placements',
  'audience',
  'pricing',
] as const

export type AdvertiseSectionKey = (typeof ADVERTISE_SECTION_KEYS)[number]

export type AdvertiseSectionRow = {
  id: string
  sectionKey: string
  locale: string
  heading: string | null
  body: string | null
  isActive: boolean
  updatedAt: string | null
}

/** All overrides (both locales) for the admin editor. */
export async function getAdvertiseSectionsAdmin(): Promise<AdvertiseSectionRow[]> {
  const { data } = await safe(
    db()
      .from('advertise_sections')
      .select('id, section_key, locale, heading, body, is_active, updated_at')
      .order('section_key', { ascending: true }),
  )
  return ((data ?? []) as {
    id: string
    section_key: string
    locale: string
    heading: string | null
    body: string | null
    is_active: boolean
    updated_at: string | null
  }[]).map((row) => ({
    id: row.id,
    sectionKey: row.section_key,
    locale: row.locale,
    heading: row.heading,
    body: row.body,
    isActive: row.is_active,
    updatedAt: row.updated_at,
  }))
}

/** Active overrides for one locale — the public /advertise page merges these
 *  over the dictionary (empty table = dictionary defaults, never blank). */
export async function getAdvertiseOverrides(
  locale: Locale,
): Promise<Partial<Record<AdvertiseSectionKey, AdvertiseSectionRow>>> {
  const rows = await getAdvertiseSectionsAdmin()
  const map: Partial<Record<AdvertiseSectionKey, AdvertiseSectionRow>> = {}
  for (const row of rows) {
    if (row.locale === locale && row.isActive) {
      map[row.sectionKey as AdvertiseSectionKey] = row
    }
  }
  return map
}

