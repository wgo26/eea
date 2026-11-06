import 'server-only'

import { unstable_cache } from 'next/cache'
import { logger } from '@/lib/observability/logger'
import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from '@/lib/cache/tags'
import { db, hasDatabase, safe } from './shared'

/* ------------------------------------------------------------------ */
/* Site settings (public, non-secret key-value config)                */
/* ------------------------------------------------------------------ */

export const SITE_SETTING_KEYS = [
  'social_facebook_url',
  'social_youtube_url',
  'social_twitter_url',
  'social_linkedin_url',
  'social_instagram_url',
  'contact_email',
  'contact_whatsapp',
  'contact_sms',
  'contact_phone',
  'contact_address_street',
  'contact_address_city',
  'contact_address_region',
  'contact_address_country',
  'contact_address_postal_code',
  'site_logo_url',
  'site_name',
  'site_tagline',
  'site_name_fr',
  'site_tagline_fr',
  'announcement_text_en',
  'announcement_text_fr',
  'announcement_url',
  'announcement_url_en',
  'announcement_url_fr',
  'announcement_starts_at',
  'announcement_ends_at',
  'feature_reading_mode',
  'feature_event_reminders',
  'feature_text_to_speech',
] as const

export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[number]

export type SiteSettings = {
  facebookUrl: string | null
  youtubeUrl: string | null
  twitterUrl: string | null
  linkedinUrl: string | null
  instagramUrl: string | null
  /** Public contact email (mailto) — shown in the guide/help only when set. */
  contactEmail: string | null
  /** Public WhatsApp number in international format — wa.me link, only when set. */
  contactWhatsapp: string | null
  /** Public SMS intake number in international format — sms: link for
   * feature-phone / zero-data reporters, only when set. */
  contactSms: string | null
  /** Public telephone number in international format — tel: link. */
  contactPhone: string | null
  /** Street address for LocalBusiness/Organization schema. */
  contactAddressStreet: string | null
  /** City for LocalBusiness/Organization schema. */
  contactAddressCity: string | null
  /** Region/state for LocalBusiness/Organization schema. */
  contactAddressRegion: string | null
  /** Country for LocalBusiness/Organization schema. */
  contactAddressCountry: string | null
  /** Postal code for LocalBusiness/Organization schema. */
  contactAddressPostalCode: string | null
  logoUrl: string | null
  siteName: string | null
  siteTagline: string | null
  siteNameFr: string | null
  siteTaglineFr: string | null
  announcementTextEn: string | null
  announcementTextFr: string | null
  announcementUrl: string | null
  announcementUrlEn: string | null
  announcementUrlFr: string | null
  announcementStartsAt: string | null
  announcementEndsAt: string | null
  featureReadingMode: boolean
  featureEventReminders: boolean
  featureTextToSpeech: boolean
}

const EMPTY_SITE_SETTINGS: SiteSettings = {
  facebookUrl: null,
  youtubeUrl: null,
  twitterUrl: null,
  linkedinUrl: null,
  instagramUrl: null,
  contactEmail: null,
  contactWhatsapp: null,
  contactSms: null,
  contactPhone: null,
  contactAddressStreet: null,
  contactAddressCity: null,
  contactAddressRegion: null,
  contactAddressCountry: null,
  contactAddressPostalCode: null,
  logoUrl: null,
  siteName: null,
  siteTagline: null,
  siteNameFr: null,
  siteTaglineFr: null,
  announcementTextEn: null,
  announcementTextFr: null,
  announcementUrl: null,
  announcementUrlEn: null,
  announcementUrlFr: null,
  announcementStartsAt: null,
  announcementEndsAt: null,
  featureReadingMode: true,
  featureEventReminders: true,
  featureTextToSpeech: true,
}

function toSiteSettings(rows: { key: string; value: string | null }[]): SiteSettings {
  const map: SiteSettings = { ...EMPTY_SITE_SETTINGS }
  for (const row of rows) {
    if (row.key === 'social_facebook_url') map.facebookUrl = row.value?.trim() || null
    if (row.key === 'social_youtube_url') map.youtubeUrl = row.value?.trim() || null
    if (row.key === 'social_twitter_url') map.twitterUrl = row.value?.trim() || null
    if (row.key === 'social_linkedin_url') map.linkedinUrl = row.value?.trim() || null
    if (row.key === 'social_instagram_url') map.instagramUrl = row.value?.trim() || null
    if (row.key === 'contact_email') map.contactEmail = row.value?.trim() || null
    if (row.key === 'contact_whatsapp') map.contactWhatsapp = row.value?.trim() || null
    if (row.key === 'contact_sms') map.contactSms = row.value?.trim() || null
    if (row.key === 'contact_phone') map.contactPhone = row.value?.trim() || null
    if (row.key === 'contact_address_street') map.contactAddressStreet = row.value?.trim() || null
    if (row.key === 'contact_address_city') map.contactAddressCity = row.value?.trim() || null
    if (row.key === 'contact_address_region') map.contactAddressRegion = row.value?.trim() || null
    if (row.key === 'contact_address_country') map.contactAddressCountry = row.value?.trim() || null
    if (row.key === 'contact_address_postal_code') map.contactAddressPostalCode = row.value?.trim() || null
    if (row.key === 'site_logo_url') map.logoUrl = row.value?.trim() || null
    if (row.key === 'site_name') map.siteName = row.value?.trim() || null
    if (row.key === 'site_tagline') map.siteTagline = row.value?.trim() || null
    if (row.key === 'site_name_fr') map.siteNameFr = row.value?.trim() || null
    if (row.key === 'site_tagline_fr') map.siteTaglineFr = row.value?.trim() || null
    if (row.key === 'announcement_text_en') map.announcementTextEn = row.value?.trim() || null
    if (row.key === 'announcement_text_fr') map.announcementTextFr = row.value?.trim() || null
    if (row.key === 'announcement_url') map.announcementUrl = row.value?.trim() || null
    if (row.key === 'announcement_url_en') map.announcementUrlEn = row.value?.trim() || null
    if (row.key === 'announcement_url_fr') map.announcementUrlFr = row.value?.trim() || null
    if (row.key === 'announcement_starts_at') map.announcementStartsAt = row.value?.trim() || null
    if (row.key === 'announcement_ends_at') map.announcementEndsAt = row.value?.trim() || null
    if (row.key === 'feature_reading_mode') map.featureReadingMode = row.value !== 'false'
    if (row.key === 'feature_event_reminders') map.featureEventReminders = row.value !== 'false'
    if (row.key === 'feature_text_to_speech') map.featureTextToSpeech = row.value !== 'false'
  }
  return map
}

/** All configured settings for the admin editor. */
export async function getSiteSettingsAdmin(): Promise<
  Record<SiteSettingKey, string | null>
> {
  const { data } = await safe(
    db().from('site_settings').select('key, value').in('key', [...SITE_SETTING_KEYS]),
  )
  const rows = (data ?? []) as { key: string; value: string | null }[]
  const result: Record<SiteSettingKey, string | null> = {
    social_facebook_url: null,
    social_youtube_url: null,
    social_twitter_url: null,
    social_linkedin_url: null,
    social_instagram_url: null,
    contact_email: null,
    contact_whatsapp: null,
    contact_sms: null,
    contact_phone: null,
    contact_address_street: null,
    contact_address_city: null,
    contact_address_region: null,
    contact_address_country: null,
    contact_address_postal_code: null,
    site_logo_url: null,
    site_name: null,
    site_tagline: null,
    site_name_fr: null,
    site_tagline_fr: null,
    announcement_text_en: null,
    announcement_text_fr: null,
    announcement_url: null,
    announcement_url_en: null,
    announcement_url_fr: null,
    announcement_starts_at: null,
    announcement_ends_at: null,
    feature_reading_mode: null,
    feature_event_reminders: null,
    feature_text_to_speech: null,
  }
  for (const row of rows) {
    if (row.key === 'social_facebook_url') result.social_facebook_url = row.value
    if (row.key === 'social_youtube_url') result.social_youtube_url = row.value
    // Contact channels were fetched but never mapped — the admin form
    // rendered empty inputs with "not set" badges for numbers that WERE
    // configured (public side read them fine via toSiteSettings).
    if (row.key === 'contact_email') result.contact_email = row.value
    if (row.key === 'contact_whatsapp') result.contact_whatsapp = row.value
    if (row.key === 'contact_sms') result.contact_sms = row.value
    if (row.key === 'contact_phone') result.contact_phone = row.value
    if (row.key === 'contact_address_street') result.contact_address_street = row.value
    if (row.key === 'contact_address_city') result.contact_address_city = row.value
    if (row.key === 'contact_address_region') result.contact_address_region = row.value
    if (row.key === 'contact_address_country') result.contact_address_country = row.value
    if (row.key === 'contact_address_postal_code') result.contact_address_postal_code = row.value
    if (row.key === 'site_logo_url') result.site_logo_url = row.value
    if (row.key === 'site_name') result.site_name = row.value
    if (row.key === 'site_tagline') result.site_tagline = row.value
    if (row.key === 'site_name_fr') result.site_name_fr = row.value
    if (row.key === 'site_tagline_fr') result.site_tagline_fr = row.value
    if (row.key === 'announcement_text_en') result.announcement_text_en = row.value
    if (row.key === 'announcement_text_fr') result.announcement_text_fr = row.value
    if (row.key === 'announcement_url') result.announcement_url = row.value
    if (row.key === 'announcement_url_en') result.announcement_url_en = row.value
    if (row.key === 'announcement_url_fr') result.announcement_url_fr = row.value
    if (row.key === 'announcement_starts_at') result.announcement_starts_at = row.value
    if (row.key === 'announcement_ends_at') result.announcement_ends_at = row.value
    if (row.key === 'feature_reading_mode') result.feature_reading_mode = row.value
    if (row.key === 'feature_event_reminders') result.feature_event_reminders = row.value
    if (row.key === 'feature_text_to_speech') result.feature_text_to_speech = row.value
  }
  return result
}

/**
 * Footer social links for the public shell — read on every public page, so
 * Phase 4.1 cached (tag `site`): the admin mutation invalidates on save and
 * the 5-minute window is the direct-SQL backstop. DB hiccup → nulls (icons
 * hide; the page never breaks).
 */
const getCachedSiteSettings = unstable_cache(
  async (): Promise<SiteSettings> => {
    const { data, error } = await db()
      .from('site_settings')
      .select('key, value')
      .in('key', [...SITE_SETTING_KEYS])
    if (error) throw new Error(error.message)
    return toSiteSettings((data ?? []) as { key: string; value: string | null }[])
  },
  ['site-settings'],
  { tags: [CACHE_TAGS.site], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
)

export async function getPublicSiteSettings(): Promise<SiteSettings> {
  if (!hasDatabase()) return EMPTY_SITE_SETTINGS
  try {
    return await getCachedSiteSettings()
  } catch {
    return EMPTY_SITE_SETTINGS
  }
}

/* ------------------------------------------------------------------ */
/* Digest archive (public past-issue list)                             */
/* ------------------------------------------------------------------ */

export type DigestIssue = {
  id: string
  sentOn: string
  locale: string
  subject: string
  stories: { title: string; path: string }[]
  emailed: number
  whatsapped: number
}

/** Past digest issues, newest first — the /digest/archive page. */
export async function getDigestIssues(limit = 30): Promise<DigestIssue[]> {
  if (!hasDatabase()) return []
  try {
    const { data } = await safe(
      db()
        .from('digest_issues')
        .select('id, sent_on, locale, subject, stories, emailed, whatsapped')
        .order('sent_on', { ascending: false })
        .limit(limit),
    )
    return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      sentOn: row.sent_on as string,
      locale: (row.locale as string) ?? 'en',
      subject: (row.subject as string) ?? '',
      stories: Array.isArray(row.stories)
        ? (row.stories as { title?: string; path?: string }[]).map((s) => ({
            title: s.title ?? 'Untitled',
            path: s.path ?? '/',
          }))
        : [],
      emailed: (row.emailed as number) ?? 0,
      whatsapped: (row.whatsapped as number) ?? 0,
    }))
  } catch (e) {
    logger.error('admin', 'getDigestIssues failed', { error: e })
    return []
  }
}

/* ------------------------------------------------------------------ */
/* Legal inbox (takedown reports + data/contact requests)             */
/* ------------------------------------------------------------------ */

export type DataRequestRow = {
  id: string
  requesterEmail: string | null
  requestType: string
  description: string | null
  status: string
  resolution: string | null
  createdAt: string | null
  resolvedAt: string | null
}

export async function getDataRequests(options?: {
  status?: string
  limit?: number
}): Promise<DataRequestRow[]> {
  const status = options?.status ?? 'all'
  const limit = options?.limit ?? 100
  let query = db()
    .from('data_requests')
    .select('id, requester_email, request_type, description, status, resolution, created_at, resolved_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (status !== 'all') query = query.eq('status', status)

  const { data } = await safe(query)
  return ((data ?? []) as {
    id: string
    requester_email: string | null
    request_type: string
    description: string | null
    status: string
    resolution: string | null
    created_at: string | null
    resolved_at: string | null
  }[]).map((row) => ({
    id: row.id,
    requesterEmail: row.requester_email,
    requestType: row.request_type,
    description: row.description,
    status: row.status,
    resolution: row.resolution,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  }))
}

/** Open-item counts driving the inbox tab badges. */
export async function getLegalInboxCounts(): Promise<{
  openTakedowns: number
  openDataRequests: number
}> {
  const [takedowns, requests] = await Promise.all([
    safe(
      db()
        .from('reports')
        .select('id', { count: 'exact', head: true })
        .eq('report_type', 'copyright')
        .eq('status', 'open'),
    ),
    safe(
      db()
        .from('data_requests')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open'),
    ),
  ])
  return {
    openTakedowns: takedowns.count ?? 0,
    openDataRequests: requests.count ?? 0,
  }
}

/* ------------------------------------------------------------------ */
/* Cross-link helpers                                                  */
/* ------------------------------------------------------------------ */

export type ContentItemRef = {
  id: string
  type: string
  slug: string | null
  status: string
}

/**
 * Minimal content-item lookup used for cross-links (e.g. the moderation
 * review screen linking to the story created from a submission).
 */
export async function getContentItemRef(id: string): Promise<ContentItemRef | null> {
  const { data } = await safe(
    db().from('content_items').select('id, type, slug, status').eq('id', id).limit(1),
  )
  const row = (data ?? [])[0] as { id: string; type: string; slug: string | null; status: string } | undefined
  return row ? { id: row.id, type: row.type, slug: row.slug, status: row.status } : null
}

