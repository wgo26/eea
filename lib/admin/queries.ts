import 'server-only'

import { unstable_cache } from 'next/cache'

import { createAdminClient } from '@/lib/supabase/admin'
import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from '@/lib/cache/tags'
import type { Locale } from '@/lib/i18n'
import type { ContentType, SubmissionStatus } from '@/lib/auth/roles'
import { isRole } from '@/lib/auth/roles'

/**
 * Admin data-access layer. Every read goes through the service-role client
 * (bypasses RLS — appropriate for the editorial back office) and is wrapped
 * in `safe()` so a DB hiccup resolves to a fallback rather than crashing the
 * page, matching the convention in lib/queries/home.ts and photo-stories.ts.
 */

type SafeResult<T> = { data: T | null; count: number | null; error: string | null }

async function safe<T>(
  promise: PromiseLike<{ data: T | null; count?: number | null; error: { message: string } | null }>,
): Promise<SafeResult<T>> {
  try {
    const { data, count, error } = await promise
    if (error) return { data: null, count: null, error: error.message }
    return { data, count: count ?? null, error: null }
  } catch (e) {
    return { data: null, count: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

function db() {
  return createAdminClient()
}

/** The admin client is only usable when the service key is configured. */
function hasDatabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

export type AppRole = 'admin' | 'editor' | 'contributor' | 'advertiser'

/* ------------------------------------------------------------------ */
/* Dashboard                                                          */
/* ------------------------------------------------------------------ */

export type DashboardStats = {
  pendingSubmissions: number
  pendingByType: { type: string; count: number }[]
  publishedToday: number
  scheduled: number
  draftCount: number
  activeListings: number
  expiringListings: number
  activeAds: number
  totalStories: number
  totalNews: number
  totalListings: number
  totalNotices: number
  totalCulture: number
  storageUsed: number
  storageByProvider: { provider: string; bytes: number; count: number }[]
  recentActivity: ModerationEntry[]
  /** submitted_at of the oldest pending/in_review submission (SLA watch). */
  oldestPendingAt: string | null
}

export const EMPTY_DASHBOARD_STATS: DashboardStats = {
  pendingSubmissions: 0,
  pendingByType: [],
  publishedToday: 0,
  scheduled: 0,
  draftCount: 0,
  activeListings: 0,
  expiringListings: 0,
  activeAds: 0,
  totalStories: 0,
  totalNews: 0,
  totalListings: 0,
  totalNotices: 0,
  totalCulture: 0,
  storageUsed: 0,
  storageByProvider: [],
  recentActivity: [],
  oldestPendingAt: null,
}

export async function getDashboardStats(): Promise<DashboardStats> {
  // Fail-safe: the admin shell (layout + page) both call this. If the
  // service-role env is missing or any query throws synchronously (e.g.
  // createClient with undefined URL throws before `safe()` can catch it),
  // return empty stats instead of crashing the whole /admin tree into the
  // global error boundary.
  if (!hasDatabase()) return EMPTY_DASHBOARD_STATS
  try {
    const today = new Date()
    today.setUTCHours(0, 0, 0, 0)
    const expiringWindow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)

  const [pendingRes, byTypeRes, todayRes, scheduledRes, draftRes, activeListingsRes, expiringSoonRes, activeAdsRes, countsRes, storageRes, activityRes, oldestRes] = await Promise.all([
    safe(db().from('submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    safe(db().from('submissions').select('submission_type').eq('status', 'pending')),
    safe(db().from('content_items').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('published_at', today.toISOString())),
    safe(db().from('content_items').select('id', { count: 'exact', head: true }).eq('status', 'scheduled')),
    safe(db().from('content_items').select('id', { count: 'exact', head: true }).eq('status', 'draft')),
    safe(db().from('listings').select('content_item_id', { count: 'exact', head: true }).eq('listing_status', 'active')),
    safe(db().from('content_items').select('id', { count: 'exact', head: true }).eq('type', 'listing').eq('status', 'published').not('expires_at', 'is', null).lte('expires_at', expiringWindow.toISOString())),
    safe(db().from('ad_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'active')),
    safe(db().from('content_items').select('type')),
    safe(db().from('media_assets').select('provider, file_size_bytes')),
    getRecentModeration({ limit: 8 }).then((r) => r.rows),
    safe(db().from('submissions').select('submitted_at').in('status', ['pending', 'in_review']).order('submitted_at', { ascending: true }).limit(1)),
  ])

  const byTypeMap = new Map<string, number>()
  for (const row of (byTypeRes.data ?? []) as { submission_type: string }[]) {
    byTypeMap.set(row.submission_type, (byTypeMap.get(row.submission_type) ?? 0) + 1)
  }

  const providerMap = new Map<string, { bytes: number; count: number }>()
  let storageUsed = 0
  for (const row of (storageRes.data ?? []) as { provider: string; file_size_bytes: number | null }[]) {
    const bytes = row.file_size_bytes ?? 0
    storageUsed += bytes
    const cur = providerMap.get(row.provider) ?? { bytes: 0, count: 0 }
    cur.bytes += bytes; cur.count += 1
    providerMap.set(row.provider, cur)
  }

  const counts = (countsRes.data ?? []) as { type: string }[]
  const countByType = (t: string) => counts.filter((r) => r.type === t).length

    return {
      pendingSubmissions: pendingRes.count ?? 0,
      pendingByType: [...byTypeMap.entries()].map(([type, count]) => ({ type, count })),
      publishedToday: todayRes.count ?? 0,
      scheduled: scheduledRes.count ?? 0,
      draftCount: draftRes.count ?? 0,
      activeListings: activeListingsRes.count ?? 0,
      expiringListings: expiringSoonRes.count ?? 0,
      activeAds: activeAdsRes.count ?? 0,
      totalStories: countByType('photo_story'),
      totalNews: countByType('news'),
      totalListings: countByType('listing'),
      totalNotices: countByType('notice'),
      totalCulture: countByType('culture'),
      storageUsed,
      storageByProvider: [...providerMap.entries()].map(([provider, v]) => ({ provider, ...v })),
      recentActivity: activityRes,
      oldestPendingAt: ((oldestRes.data ?? []) as { submitted_at: string | null }[])[0]?.submitted_at ?? null,
    }
  } catch (e) {
    console.error('[admin] getDashboardStats failed, returning empty stats', e)
    return EMPTY_DASHBOARD_STATS
  }
}
/* ------------------------------------------------------------------ */
/* Moderation queue                                                   */
/* ------------------------------------------------------------------ */

export type SubmissionRow = {
  id: string
  submissionType: string
  status: SubmissionStatus
  guestName: string | null
  guestEmail: string | null
  guestPhone: string | null
  consentConfirmed: boolean
  rightsConfirmed: boolean
  submittedAt: string | null
  reviewedAt: string | null
  rejectionReason: string | null
  internalNotes: string | null
  payload: Record<string, unknown> | null
  contentItemId: string | null
}

export async function getSubmissions(options?: {
  status?: SubmissionStatus | SubmissionStatus[] | 'all'
  type?: ContentType | 'all'
  search?: string
  limit?: number
  offset?: number
}): Promise<{ rows: SubmissionRow[]; total: number }> {
  const status = options?.status ?? 'pending'
  const type = options?.type ?? 'all'
  const search = options?.search?.trim() ?? ''
  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0

  // Fail-safe: a DB hiccup or missing service-role env resolves to an empty
  // queue rather than crashing the page into the global error boundary.
  if (!hasDatabase()) return { rows: [], total: 0 }
  try {
    let query = db()
      .from('submissions')
      .select('id, submission_type, status, guest_name, guest_email, guest_phone, consent_confirmed, rights_confirmed, submitted_at, reviewed_at, rejection_reason, internal_notes, payload, content_item_id', { count: 'exact' })
      .order('submitted_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)

    if (status !== 'all') {
      query = Array.isArray(status) ? query.in('status', status) : query.eq('status', status)
    }
    if (type !== 'all') query = query.eq('submission_type', type)
    if (search) query = query.or(`guest_name.ilike.%${search}%,guest_email.ilike.%${search}%,guest_phone.ilike.%${search}%`)

    const { data, count } = await safe(query)
    return {
      rows: (data ?? []).map((r) => ({
      id: r.id,
      submissionType: r.submission_type,
      status: r.status,
      guestName: r.guest_name,
      guestEmail: r.guest_email,
      guestPhone: r.guest_phone,
      consentConfirmed: r.consent_confirmed,
      rightsConfirmed: r.rights_confirmed,
      submittedAt: r.submitted_at,
      reviewedAt: r.reviewed_at,
      rejectionReason: r.rejection_reason,
      internalNotes: r.internal_notes,
      payload: r.payload,
      contentItemId: r.content_item_id,
      })),
      total: count ?? 0,
    }
  } catch (e) {
    console.error('[admin] getSubmissions failed, returning empty queue', e)
    return { rows: [], total: 0 }
  }
}

/**
 * Tab-badge counts for the moderation queue. Six index-only head counts beat
 * pulling 5×1000 rows; "pending" folds in reopened (in_review) rows exactly
 * like the queue view does.
 */
export async function getSubmissionCounts(): Promise<{
  pending: number
  needs_clarification: number
  approved: number
  rejected: number
  total: number
}> {
  const empty = { pending: 0, needs_clarification: 0, approved: 0, rejected: 0, total: 0 }
  if (!hasDatabase()) return empty
  try {
    const statuses: SubmissionStatus[] = ['pending', 'in_review', 'needs_clarification', 'approved', 'rejected']
    const results = await Promise.all(
      statuses.map((s) => safe(db().from('submissions').select('id', { count: 'exact', head: true }).eq('status', s))),
    )
    const byStatus: Record<string, number> = {}
    statuses.forEach((s, i) => { byStatus[s] = results[i].count ?? 0 })
    const pending = byStatus.pending + byStatus.in_review
    return {
      pending,
      needs_clarification: byStatus.needs_clarification,
      approved: byStatus.approved,
      rejected: byStatus.rejected,
      total: pending + byStatus.needs_clarification + byStatus.approved + byStatus.rejected,
    }
  } catch (e) {
    console.error('[admin] getSubmissionCounts failed, returning empty counts', e)
    return empty
  }
}

export async function getSubmissionById(id: string): Promise<SubmissionRow | null> {
  const { data } = await safe(
    db()
      .from('submissions')
      .select('id, submission_type, status, guest_name, guest_email, guest_phone, consent_confirmed, rights_confirmed, submitted_at, reviewed_at, rejection_reason, internal_notes, payload, content_item_id')
      .eq('id', id)
      .limit(1),
  )
  const row = (data ?? [])[0]
  if (!row) return null
  return {
    id: row.id,
    submissionType: row.submission_type,
    status: row.status,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    guestPhone: row.guest_phone,
    consentConfirmed: row.consent_confirmed,
    rightsConfirmed: row.rights_confirmed,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    internalNotes: row.internal_notes,
    payload: row.payload,
    contentItemId: row.content_item_id,
  }
}

/* ------------------------------------------------------------------ */
/* Content                                                            */
/* ------------------------------------------------------------------ */

export type ContentRow = {
  id: string
  type: ContentType
  slug: string | null
  status: string
  verification: string | null
  isFeatured: boolean
  isArchived: boolean
  publishedAt: string | null
  scheduledFor: string | null
  expiresAt: string | null
  createdAt: string | null
  updatedAt: string | null
  title: string | null
  excerpt: string | null
  /** True when the item has translations but none in the requested locale. */
  missingLocale: boolean
  locationName: string | null
  categoryName: string | null
  coverUrl: string | null
  authorId: string | null
  authorName: string | null
  submittedBy: string | null
}

const CONTENT_SELECT = `id, type, slug, status, verification, is_featured, is_archived, published_at, scheduled_for, expires_at, created_at, updated_at, author_id, submitted_by,
  translations:content_translations(locale, title, excerpt),
  location:locations(name),
  category:categories!category_id(category_translations(locale, name)),
  cover:media_assets(public_url),
  author:profiles!content_items_author_id_fkey(display_name)`

export async function getContentItems(options?: {
  status?: string | 'all'
  type?: ContentType | 'all'
  search?: string
  limit?: number
  offset?: number
  locale?: Locale
}): Promise<{ rows: ContentRow[]; total: number }> {
  const status = options?.status ?? 'all'
  const type = options?.type ?? 'all'
  const search = options?.search?.trim() ?? ''
  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0
  const locale = options?.locale ?? 'en'

  let query = db()
    .from('content_items')
    .select(CONTENT_SELECT, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (status !== 'all') query = query.eq('status', status)
  if (type !== 'all') query = query.eq('type', type)
  if (search) query = query.or(`slug.ilike.%${search}%,translations.title.ilike.%${search}%`)

  const { data, count } = await safe(query)
  return {
    rows: ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => mapContentRow(row, locale)),
    total: count ?? 0,
  }
}

function mapContentRow(row: Record<string, unknown>, locale: Locale): ContentRow {
  const translations = Array.isArray(row.translations) ? row.translations : row.translations ? [row.translations] : []
  const own = (translations as { locale: string; title: string | null; excerpt: string | null }[]).find((x) => x.locale === locale)
  const fallback = (translations as { locale: string; title: string | null; excerpt: string | null }[])[0]
  const t = own ?? fallback
  // Explicit fallback flag so the table can badge "EN only / FR missing"
  // instead of silently showing the wrong language.
  const missingLocale = translations.length > 0 && !own

  const location = Array.isArray(row.location) ? row.location[0] : row.location
  const category = Array.isArray(row.category) ? row.category[0] : row.category
  const catTrans = category && Array.isArray(category.category_translations) ? category.category_translations : []
  const catName = catTrans.length ? (catTrans as { locale: string; name: string }[]).find((c) => c.locale === locale)?.name ?? (catTrans[0] as { name: string }).name : null

  const cover = Array.isArray(row.cover) ? row.cover[0] : row.cover
  const author = Array.isArray(row.author) ? row.author[0] : row.author

  return {
    id: row.id as string,
    type: row.type as ContentType,
    slug: row.slug as string | null,
    status: row.status as string,
    verification: row.verification as string | null,
    isFeatured: !!row.is_featured,
    isArchived: !!row.is_archived,
    publishedAt: row.published_at as string | null,
    scheduledFor: row.scheduled_for as string | null,
    expiresAt: row.expires_at as string | null,
    createdAt: row.created_at as string | null,
    updatedAt: (row.updated_at as string | null) ?? null,
    title: t?.title ?? null,
    excerpt: t?.excerpt ?? null,
    missingLocale,
    locationName: (location as { name: string } | undefined)?.name ?? null,
    categoryName: catName,
    coverUrl: (cover as { public_url: string } | undefined)?.public_url ?? null,
    authorId: row.author_id as string | null,
    authorName: (author as { display_name: string } | undefined)?.display_name ?? null,
    submittedBy: row.submitted_by as string | null,
  }
}

export type ContentEditData = ContentRow & {
  // Full bilingual fields for the edit drawer.
  enTitle: string | null
  enExcerpt: string | null
  enBody: string | null
  frTitle: string | null
  frExcerpt: string | null
  frBody: string | null
  locationId: string | null
  categoryId: string | null
  // Per-permalink + editorial extras (imported posts already carry them).
  enSeoDescription: string | null
  frSeoDescription: string | null
  /** Byline fallback (translation row); public byline prefers profile authorName. */
  byline: string | null
  tags: { id: string; name: string | null }[]
  photos: { id: string; url: string; alt: string | null; caption: string | null; credit: string | null }[]
  listing: { price: number | null; currency: string | null; contactPhone: string | null; contactEmail: string | null; whatsappNumber: string | null; sellerName: string | null; listingStatus: string | null; sellerVerified: boolean } | null
  notice: { noticeType: string; organizationName: string | null; contactPhone: string | null; isOfficial: boolean; noticeDate: string | null; expiryDate: string | null } | null
  event: { startsAt: string | null; endsAt: string | null; venueName: string | null; ticketUrl: string | null; organizerName: string | null; organizerPhone: string | null; organizerEmail: string | null } | null
}

/** Full content item for the admin edit drawer (service-role read, all locales + type rows). */
export async function getContentItemEditData(contentItemId: string): Promise<ContentEditData | null> {
  const { data } = await safe(
    db()
      .from('content_items')
      .select('id, type, slug, status, verification, is_featured, is_archived, published_at, scheduled_for, expires_at, created_at, author_id, submitted_by, location_id, category_id, translations:content_translations(locale, title, excerpt, body, seo_description, byline), tags:content_tags(tag:tags(id, tag_translations(locale, name))), location:locations(name), category:categories!category_id(category_translations(locale, name)), media:media_assets(id, public_url, caption, alt_text, photographer_credit, sort_order), author:profiles!content_items_author_id_fkey(display_name), listing:listings(price, currency, contact_phone, contact_email, whatsapp_number, seller_name, listing_status, seller_is_verified), notice:notices(notice_type, organization_name, contact_phone, is_official, notice_date, expiry_date), event:events(starts_at, ends_at, venue_name, ticket_url, organizer_name, organizer_phone, organizer_email)')
      .eq('id', contentItemId)
      .limit(1),
  )
  const row = ((data ?? []) as unknown as Record<string, unknown>[])[0] ?? null
  if (!row) return null
  const base = mapContentRow(row, 'en')
  const translations = (Array.isArray(row.translations) ? row.translations : row.translations ? [row.translations] : []) as { locale: string; title: string | null; excerpt: string | null; body: string | null; seo_description: string | null; byline: string | null }[]
  const tagRows = (Array.isArray(row.tags) ? row.tags : row.tags ? [row.tags] : []) as { tag: { id: string; tag_translations: { locale: string; name: string }[] } | { id: string; tag_translations: { locale: string; name: string }[] }[] }[]
  const en = translations.find((t) => t.locale === 'en')
  const fr = translations.find((t) => t.locale === 'fr')
  const media = (Array.isArray(row.media) ? row.media : row.media ? [row.media] : []) as { id: string; public_url: string; caption: string | null; alt_text: string | null; photographer_credit: string | null }[]
  const listingRaw = (Array.isArray(row.listing) ? row.listing[0] : row.listing) as { price: number | string | null; currency: string | null; contact_phone: string | null; contact_email: string | null; whatsapp_number: string | null; seller_name?: string | null; listing_status?: string | null; seller_is_verified?: boolean | null } | null | undefined
  const noticeRaw = (Array.isArray(row.notice) ? row.notice[0] : row.notice) as { notice_type: string; organization_name: string | null; contact_phone: string | null; is_official: boolean; notice_date: string | null; expiry_date: string | null } | null | undefined
  const eventRaw = (Array.isArray(row.event) ? row.event[0] : row.event) as { starts_at: string | null; ends_at: string | null; venue_name: string | null; ticket_url: string | null; organizer_name: string | null; organizer_phone: string | null; organizer_email: string | null } | null | undefined
  return {
    ...base,
    enTitle: en?.title ?? null,
    enExcerpt: en?.excerpt ?? null,
    enBody: en?.body ?? null,
    frTitle: fr?.title ?? null,
    frExcerpt: fr?.excerpt ?? null,
    frBody: fr?.body ?? null,
    enSeoDescription: en?.seo_description ?? null,
    frSeoDescription: fr?.seo_description ?? null,
    byline: en?.byline ?? fr?.byline ?? null,
    tags: tagRows
      .flatMap((t) => (Array.isArray(t.tag) ? t.tag : [t.tag]))
      .map((tag) => {
        const names = (tag.tag_translations ?? []) as { locale: string; name: string }[]
        return { id: tag.id, name: names.find((n) => n.locale === 'en')?.name ?? names[0]?.name ?? null }
      }),
    locationId: row.location_id as string | null,
    categoryId: row.category_id as string | null,
    photos: [...media].sort((a, b) => (a as unknown as { sort_order: number }).sort_order - (b as unknown as { sort_order: number }).sort_order).map((m) => ({ id: m.id, url: m.public_url, alt: m.alt_text ?? null, caption: m.caption, credit: m.photographer_credit })),
    listing: listingRaw ? { price: listingRaw.price === null ? null : Number(listingRaw.price), currency: listingRaw.currency, contactPhone: listingRaw.contact_phone, contactEmail: listingRaw.contact_email, whatsappNumber: listingRaw.whatsapp_number, sellerName: (listingRaw.seller_name as string | null) ?? null, listingStatus: (listingRaw.listing_status as string | null) ?? null, sellerVerified: !!listingRaw.seller_is_verified } : null,
    notice: noticeRaw ? { noticeType: noticeRaw.notice_type, organizationName: noticeRaw.organization_name, contactPhone: noticeRaw.contact_phone, isOfficial: !!noticeRaw.is_official, noticeDate: noticeRaw.notice_date, expiryDate: noticeRaw.expiry_date } : null,
    event: eventRaw ? { startsAt: eventRaw.starts_at, endsAt: eventRaw.ends_at, venueName: eventRaw.venue_name, ticketUrl: eventRaw.ticket_url, organizerName: eventRaw.organizer_name, organizerPhone: eventRaw.organizer_phone, organizerEmail: eventRaw.organizer_email } : null,
  }
}

/* ------------------------------------------------------------------ */
/* Homepage curation                                                  */
/* ------------------------------------------------------------------ */

export type HomepageSlot = {
  id: string
  slotKey: string
  contentItemId: string | null
  sortOrder: number
  isActive: boolean
  startsAt: string | null
  endsAt: string | null
  title: string | null
  type: string | null
  coverUrl: string | null
  /** True when the linked content has translations but none in the requested locale. */
  missingLocale: boolean
}

export async function getHomepageSlots(locale: Locale = 'en'): Promise<HomepageSlot[]> {
  const { data } = await safe(
    db()
      .from('homepage_slots')
      .select(`id, slot_key, content_item_id, sort_order, is_active, starts_at, ends_at,
        content:content_items(id, type,
          translations:content_translations(locale, title),
          cover:media_assets(public_url))`)
      .order('sort_order', { ascending: true }),
  )
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const content = (row.content as unknown as { id: string; type: string; translations: { locale: string; title: string }[]; cover: { public_url: string }[] } | null) ?? null
    const translations = content && Array.isArray(content.translations) ? content.translations : content?.translations ? [content.translations] : []
    const list = translations as { locale: string; title: string }[]
    const t = list.find((x) => x.locale === locale) ?? (translations[0] as { title: string } | undefined)
    const missingLocale = list.length > 0 && !list.some((x) => x.locale === locale)
    const cover = content && Array.isArray(content.cover) ? content.cover[0] : content?.cover
    return {
      id: row.id as string,
      slotKey: row.slot_key as string,
      contentItemId: row.content_item_id as string | null,
      sortOrder: row.sort_order as number,
      isActive: row.is_active as boolean,
      startsAt: row.starts_at as string | null,
      endsAt: row.ends_at as string | null,
      title: t?.title ?? null,
      type: content?.type ?? null,
      coverUrl: (cover as { public_url: string } | undefined)?.public_url ?? null,
      missingLocale,
    }
  })
}

export type SlotSearchResult = {
  id: string
  type: string
  status: string
  titleEn: string | null
  titleFr: string | null
  coverUrl: string | null
}

/** Search content by title across both languages for homepage slot assignment. */
export async function queryContentForSlotAssign(query: string, limit = 10): Promise<SlotSearchResult[]> {
  const q = query.trim()
  if (!q) return []
  const { data } = await safe(
    db()
      .from('content_items')
      .select(`id, type, status,
        translations:content_translations(locale, title),
        cover:media_assets(public_url)`)
      .or(`translations.title.ilike.%${q}%`)
      .order('updated_at', { ascending: false })
      .limit(limit),
  )
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const trans = Array.isArray(row.translations) ? row.translations : row.translations ? [row.translations] : []
    const cover = Array.isArray(row.cover) ? row.cover[0] : row.cover
    return {
      id: row.id as string,
      type: row.type as string,
      status: row.status as string,
      titleEn: (trans as { locale: string; title: string | null }[]).find((t) => t.locale === 'en')?.title ?? null,
      titleFr: (trans as { locale: string; title: string | null }[]).find((t) => t.locale === 'fr')?.title ?? null,
      coverUrl: (cover as { public_url: string } | undefined)?.public_url ?? null,
    }
  })
}

/* ------------------------------------------------------------------ */
/* Users                                                              */
/* ------------------------------------------------------------------ */

export type UserRow = {
  id: string
  displayName: string | null
  fullName: string | null
  email: string | null
  phone: string | null
  avatarUrl: string | null
  isVerified: boolean
  isPublic: boolean
  isSuspended: boolean
  isBanned: boolean
  contributorFeatured: boolean
  contributorBioOverride: string | null
  locationName: string | null
  roles: AppRole[]
  createdAt: string | null
}

export async function getUsers(options?: { search?: string; role?: AppRole | 'all'; status?: 'all' | 'active' | 'suspended' | 'banned'; limit?: number; page?: number }): Promise<{ rows: UserRow[]; total: number }> {
  const search = options?.search?.trim()
  const role = options?.role ?? 'all'
  const limit = options?.limit ?? 50
  const page = options?.page ?? 1
  const offset = (page - 1) * limit

  let query = db()
    .from('profiles')
    .select(`id, display_name, full_name, email, phone, avatar_url, is_verified, is_public, is_suspended, is_banned, contributor_featured, contributor_bio_override, created_at,
      location:locations(name),
      roles:user_roles(role)`, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) query = query.or(`display_name.ilike.%${search}%,full_name.ilike.%${search}%,email.ilike.%${search}%`)
  if (role !== 'all') query = query.eq('roles.role', role)
  if (options?.status === 'suspended') query = query.eq('is_suspended', true)
  if (options?.status === 'banned') query = query.eq('is_banned', true)
  if (options?.status === 'active') query = query.eq('is_suspended', false).eq('is_banned', false)

  const { data, count } = await safe(query)
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const roles = Array.isArray(row.roles) ? row.roles : row.roles ? [row.roles] : []
    const location = Array.isArray(row.location) ? row.location[0] : row.location
    return {
      id: row.id as string,
      displayName: row.display_name as string | null,
      fullName: row.full_name as string | null,
      email: row.email as string | null,
      phone: row.phone as string | null,
      avatarUrl: row.avatar_url as string | null,
      isVerified: !!row.is_verified,
      isPublic: !!row.is_public,
      isSuspended: !!row.is_suspended,
      isBanned: !!row.is_banned,
      contributorFeatured: !!row.contributor_featured,
      contributorBioOverride: row.contributor_bio_override as string | null,
      locationName: (location as { name: string } | undefined)?.name ?? null,
      roles: (roles as { role: string }[]).map((r) => r.role).filter(isRole),
      createdAt: row.created_at as string | null,
    }
  })
  return { rows, total: count ?? 0 }
}

export type UserSubmissionMini = {
  id: string
  submissionType: string
  status: string
  submittedAt: string | null
}

export type UserContentMini = {
  id: string
  type: string
  slug: string
  status: string
  title: string
  publishedAt: string | null
}

export type UserDetail = {
  user: UserRow
  submissions: UserSubmissionMini[]
  submissionCount: number
  content: UserContentMini[]
  contentCount: number
}

/**
 * Full preview for the admin user detail page: profile + roles (via getUsers
 * mapping), recent submissions filed by the user, and content they authored.
 */
export async function getUserDetail(userId: string): Promise<UserDetail | null> {
  const profileRes = await safe(
    db()
      .from('profiles')
      .select(`id, display_name, full_name, email, phone, avatar_url, is_verified, is_public, is_suspended, is_banned, contributor_featured, contributor_bio_override, created_at,
        location:locations(name),
        roles:user_roles(role)`)
      .eq('id', userId)
      .maybeSingle(),
  )
  const profile = profileRes.data as Record<string, unknown> | null
  if (!profile) return null

  const rolesRaw = Array.isArray(profile.roles) ? profile.roles : profile.roles ? [profile.roles] : []
  const location = Array.isArray(profile.location) ? profile.location[0] : profile.location
  const user: UserRow = {
    id: profile.id as string,
    displayName: profile.display_name as string | null,
    fullName: profile.full_name as string | null,
    email: profile.email as string | null,
    phone: profile.phone as string | null,
    avatarUrl: profile.avatar_url as string | null,
    isVerified: !!profile.is_verified,
    isPublic: !!profile.is_public,
    isSuspended: !!profile.is_suspended,
    isBanned: !!profile.is_banned,
    contributorFeatured: !!profile.contributor_featured,
    contributorBioOverride: profile.contributor_bio_override as string | null,
    locationName: (location as { name: string } | undefined)?.name ?? null,
    roles: (rolesRaw as { role: string }[]).map((r) => r.role).filter(isRole),
    createdAt: profile.created_at as string | null,
  }

  const [subsRes, contentRes] = await Promise.all([
    safe(
      db()
        .from('submissions')
        .select('id, submission_type, status, submitted_at', { count: 'exact' })
        .eq('submitted_by', userId)
        .order('submitted_at', { ascending: false, nullsFirst: false })
        .limit(10),
    ),
    safe(
      db()
        .from('content_items')
        .select('id, type, slug, status, published_at, translations:content_translations(locale, title)', { count: 'exact' })
        .eq('author_id', userId)
        .order('created_at', { ascending: false })
        .limit(10),
    ),
  ])

  const submissions = ((subsRes.data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    submissionType: (r.submission_type as string) ?? '—',
    status: (r.status as string) ?? '—',
    submittedAt: r.submitted_at as string | null,
  }))

  const content = ((contentRes.data ?? []) as Record<string, unknown>[]).map((r) => {
    const trs = Array.isArray(r.translations) ? r.translations as { locale: string; title: string | null }[] : []
    const title = trs.find((t) => t.locale === 'en')?.title ?? trs[0]?.title ?? (r.slug as string)
    return {
      id: r.id as string,
      type: (r.type as string) ?? '—',
      slug: (r.slug as string) ?? '',
      status: (r.status as string) ?? '—',
      title,
      publishedAt: r.published_at as string | null,
    }
  })

  return {
    user,
    submissions,
    submissionCount: subsRes.count ?? submissions.length,
    content,
    contentCount: contentRes.count ?? content.length,
  }
}

/* ------------------------------------------------------------------ */
/* Ads                                                                */
/* ------------------------------------------------------------------ */

export type AdSlotRow = {
  id: string
  slotKey: string
  name: string
  placement: string
  dimensions: string
  mobileDimensions: string | null
  allowedFormats: string[]
  maxDurationSeconds: number | null
  capacity: number
  basePrice: number | null
  currency: string | null
  isActive: boolean
  activeCampaign: AdCampaignRow | null
}

export type AdCampaignRow = {
  id: string
  name: string
  status: string
  destinationUrl: string | null
  copyText: string | null
  startsAt: string | null
  endsAt: string | null
  agreedPrice: number | null
  currency: string | null
  paymentStatus: string | null
  advertiserName: string | null
  slotId: string | null
  slotName: string | null
  impressions: number
  clicks: number
  creativeType: string
  creativeStatus: string
  creativeRejectionReason: string | null
  creativeHtml: string | null
  creativeWidth: number | null
  creativeHeight: number | null
  imageUrl: string | null
  mobileImageUrl: string | null
  posterUrl: string | null
  durationSeconds: number | null
  budgetLimit: number | null
  impressionLimit: number | null
  clickLimit: number | null
  invoiceReference: string | null
}

export async function getAdSlots(): Promise<AdSlotRow[]> {
  const { data } = await safe(
    db()
      .from('ad_slots')
      .select(`id, slot_key, name, placement, dimensions, mobile_dimensions, allowed_formats, max_duration_seconds, capacity, base_price, currency, is_active,
        campaigns:ad_campaigns(id, name, status, destination_url, copy_text, starts_at, ends_at, agreed_price, currency, payment_status,
          creative_type, creative_status, creative_rejection_reason, creative_html, creative_width, creative_height,
          budget_limit, impression_limit, click_limit, invoice_reference,
          creative:media_assets!ad_campaigns_creative_media_id_fkey(public_url, duration_seconds),
          mobile_creative:media_assets!ad_campaigns_mobile_creative_media_id_fkey(public_url, duration_seconds),
          poster:media_assets!ad_campaigns_poster_media_id_fkey(public_url),
          advertiser:advertisers(company_name),
          events:ad_events(id, event_type))`)
      .order('slot_key', { ascending: true }),
  )
  return (data ?? []).map((row) => {
    const campaigns = Array.isArray(row.campaigns) ? row.campaigns : row.campaigns ? [row.campaigns] : []
    const active = (campaigns as Record<string, unknown>[]).find((c) => c.status === 'active') ?? null
    const events = active && Array.isArray(active.events) ? active.events : active?.events ? [active.events] : []
    const impressions = (events as { event_type: string }[]).filter((e) => e.event_type === 'impression').length
    const clicks = (events as { event_type: string }[]).filter((e) => e.event_type === 'click').length
    const advertiser = active && Array.isArray(active.advertiser) ? active.advertiser[0] : active?.advertiser
    return {
      id: row.id,
      slotKey: row.slot_key,
      name: row.name,
      placement: row.placement,
      dimensions: row.dimensions,
      mobileDimensions: (row.mobile_dimensions as string | null) ?? null,
      allowedFormats: Array.isArray(row.allowed_formats) ? (row.allowed_formats as string[]) : ['image', 'sponsored'],
      maxDurationSeconds: (row.max_duration_seconds as number | null) ?? null,
      capacity: row.capacity ?? 1,
      basePrice: row.base_price,
      currency: row.currency,
      isActive: row.is_active,
      activeCampaign: active
        ? {
            id: active.id as string,
            name: active.name as string,
            status: active.status as string,
            destinationUrl: active.destination_url as string | null,
            copyText: active.copy_text as string | null,
            startsAt: active.starts_at as string | null,
            endsAt: active.ends_at as string | null,
            agreedPrice: active.agreed_price == null ? null : Number(active.agreed_price),
            currency: active.currency as string | null,
            paymentStatus: active.payment_status as string | null,
            advertiserName: (advertiser as { company_name: string } | undefined)?.company_name ?? null,
            slotId: row.id as string,
            slotName: row.name as string,
            impressions,
            clicks,
            ...mapCampaignCreative(active),
          }
        : null,
    }
  })
}

/** Shared mapper: creative columns → AdCampaignRow creative fields. */
function mapCampaignCreative(active: Record<string, unknown>): Pick<
  AdCampaignRow,
  | 'creativeType' | 'creativeStatus' | 'creativeRejectionReason' | 'creativeHtml'
  | 'creativeWidth' | 'creativeHeight' | 'imageUrl' | 'mobileImageUrl'
  | 'posterUrl' | 'durationSeconds' | 'budgetLimit' | 'impressionLimit'
  | 'clickLimit' | 'invoiceReference'
> {
  const one = (v: unknown) => (Array.isArray(v) ? v[0] : v) as { public_url?: string | null; duration_seconds?: number | null } | undefined
  const creative = one(active.creative)
  const mobile = one(active.mobile_creative)
  return {
    creativeType: (active.creative_type as string) ?? 'sponsored',
    creativeStatus: (active.creative_status as string) ?? 'pending',
    creativeRejectionReason: (active.creative_rejection_reason as string | null) ?? null,
    creativeHtml: (active.creative_html as string | null) ?? null,
    creativeWidth: (active.creative_width as number | null) ?? null,
    creativeHeight: (active.creative_height as number | null) ?? null,
    imageUrl: creative?.public_url ?? null,
    mobileImageUrl: mobile?.public_url ?? null,
    posterUrl: one(active.poster)?.public_url ?? null,
    durationSeconds: (creative?.duration_seconds ?? mobile?.duration_seconds ?? null) as number | null,
    budgetLimit: active.budget_limit == null ? null : Number(active.budget_limit),
    impressionLimit: (active.impression_limit as number | null) ?? null,
    clickLimit: (active.click_limit as number | null) ?? null,
    invoiceReference: (active.invoice_reference as string | null) ?? null,
  }
}

export async function getAdvertisers() {
  const { data } = await safe(
    db()
      .from('advertisers')
      .select(`id, company_name, contact_name, email, phone,
        campaigns:ad_campaigns(id, status)`)
      .order('company_name', { ascending: true }),
  )
  return (data ?? []).map((row) => {
    const campaigns = Array.isArray(row.campaigns) ? row.campaigns : row.campaigns ? [row.campaigns] : []
    return {
      id: row.id,
      companyName: row.company_name,
      contactName: row.contact_name,
      email: row.email,
      phone: row.phone,
      totalCampaigns: campaigns.length,
      activeCampaigns: (campaigns as { status: string }[]).filter((c) => c.status === 'active').length,
    }
  })
}

export type AdInquiryRow = {
  id: string
  name: string
  copyText: string | null
  createdAt: string | null
  advertiserName: string | null
  email: string | null
  phone: string | null
}

export async function getPendingAdInquiries(limit = 100): Promise<AdInquiryRow[]> {
  const { data } = await safe(
    db().from('ad_campaigns').select(`id, name, copy_text, created_at,
      advertiser:advertisers(company_name, email, phone)`).eq('status', 'pending').order('created_at', { ascending: false }).limit(limit),
  )
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const advertiser = Array.isArray(row.advertiser) ? row.advertiser[0] : row.advertiser
    return {
      id: row.id as string,
      name: row.name as string,
      copyText: row.copy_text as string | null,
      createdAt: row.created_at as string | null,
      advertiserName: (advertiser as { company_name: string } | undefined)?.company_name ?? null,
      email: (advertiser as { email: string } | undefined)?.email ?? null,
      phone: (advertiser as { phone: string } | undefined)?.phone ?? null,
    }
  })
}

/** Every campaign (not only slotted/active ones) for the full campaigns list. */
export async function getCampaigns(limit = 100): Promise<AdCampaignRow[]> {
  const { data } = await safe(
    db()
      .from('ad_campaigns')
      .select(`id, name, status, destination_url, copy_text, starts_at, ends_at, agreed_price, currency, payment_status,
        creative_type, creative_status, creative_rejection_reason, creative_html, creative_width, creative_height,
        budget_limit, impression_limit, click_limit, invoice_reference,
        creative:media_assets!ad_campaigns_creative_media_id_fkey(public_url, duration_seconds),
        mobile_creative:media_assets!ad_campaigns_mobile_creative_media_id_fkey(public_url, duration_seconds),
        poster:media_assets!ad_campaigns_poster_media_id_fkey(public_url),
        advertiser:advertisers(company_name),
        slot:ad_slots(id, name),
        events:ad_events(event_type)`)
      .order('created_at', { ascending: false })
      .limit(limit),
  )
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const advertiser = Array.isArray(row.advertiser) ? row.advertiser[0] : row.advertiser
    const slot = Array.isArray(row.slot) ? row.slot[0] : row.slot
    const events = Array.isArray(row.events) ? row.events : row.events ? [row.events] : []
    const impressions = (events as { event_type: string }[]).filter((e) => e.event_type === 'impression').length
    const clicks = (events as { event_type: string }[]).filter((e) => e.event_type === 'click').length
    return {
      id: row.id as string,
      name: row.name as string,
      status: row.status as string,
      destinationUrl: row.destination_url as string | null,
      copyText: row.copy_text as string | null,
      startsAt: row.starts_at as string | null,
      endsAt: row.ends_at as string | null,
      agreedPrice: row.agreed_price == null ? null : Number(row.agreed_price),
      currency: row.currency as string | null,
      paymentStatus: row.payment_status as string | null,
      advertiserName: (advertiser as { company_name: string } | undefined)?.company_name ?? null,
      slotId: (slot as { id?: string } | undefined)?.id ?? null,
      slotName: (slot as { name?: string } | undefined)?.name ?? null,
      impressions,
      clicks,
      ...mapCampaignCreative(row),
    }
  })
}

/* ------------------------------------------------------------------ */
/* Audit log                                                          */
/* ------------------------------------------------------------------ */

export type ModerationEntry = {
  id: string
  action: string
  fromStatus: string | null
  toStatus: string | null
  notes: string | null
  createdAt: string | null
  actorId: string | null
  actorName: string | null
  contentTitle: string | null
  contentType: string | null
  submissionId: string | null
}

export async function getRecentModeration(options?: {
  limit?: number
  page?: number
  action?: string
  entityType?: string
  actor?: string
  from?: string
  to?: string
  locale?: Locale
}): Promise<{ rows: ModerationEntry[]; total: number }> {
  const limit = options?.limit ?? 20
  const page = options?.page ?? 1
  const offset = (page - 1) * limit
  const locale = options?.locale ?? 'en'
  if (!hasDatabase()) return { rows: [], total: 0 }
  try {
    let query = db()
        .from('moderation_log')
        .select(`id, action, from_status, to_status, notes, created_at, submission_id, entity_type, actor_id,
          actor:profiles(display_name, full_name),
          content:content_items(type, translations:content_translations(locale, title))`, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
    if (options?.action) query = query.eq('action', options.action)
    if (options?.entityType) query = query.eq('entity_type', options.entityType)
    if (options?.actor) query = query.eq('actor_id', options.actor)
    if (options?.from) query = query.gte('created_at', options.from)
    if (options?.to) query = query.lte('created_at', `${options.to}T23:59:59.999Z`)
    const { data, count } = await safe(query)
    const rows = (data ?? []).map((row) => {
      const actor = Array.isArray(row.actor) ? row.actor[0] : row.actor
      const content = Array.isArray(row.content) ? row.content[0] : row.content
      const translations = content && Array.isArray(content.translations) ? content.translations : content?.translations ? [content.translations] : []
      const list = translations as { locale: string; title: string }[]
      const t = list.find((x) => x.locale === locale) ?? list[0]
      return {
        id: row.id,
        action: row.action,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        notes: row.notes,
        createdAt: row.created_at,
        actorId: (row as { actor_id?: string | null }).actor_id ?? null,
        actorName: (actor as { display_name: string | null; full_name: string | null } | undefined)?.display_name ?? (actor as { full_name: string | null } | undefined)?.full_name ?? null,
        contentTitle: t?.title ?? null,
        contentType: content?.type ?? null,
        submissionId: row.submission_id,
      }
    })
    return { rows, total: count ?? 0 }
  } catch (e) {
    console.error('[admin] getRecentModeration failed', e)
    return { rows: [], total: 0 }
  }
}

/** Distinct action / entity-type values for the audit-log filter dropdowns. */
export async function getAuditFilterOptions(): Promise<{ actions: string[]; entityTypes: string[] }> {
  if (!hasDatabase()) return { actions: [], entityTypes: [] }
  const [actionsRes, entitiesRes] = await Promise.all([
    safe(db().from('moderation_log').select('action').limit(5000)),
    safe(db().from('moderation_log').select('entity_type').limit(5000)),
  ])
  const uniqSorted = (values: (string | null | undefined)[]) =>
    [...new Set(values.filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b))
  return {
    actions: uniqSorted((actionsRes.data ?? []).map((r) => (r as { action: string }).action)),
    entityTypes: uniqSorted((entitiesRes.data ?? []).map((r) => (r as { entity_type: string | null }).entity_type)),
  }
}

/* ------------------------------------------------------------------ */
/* Storage / backup                                                   */
/* ------------------------------------------------------------------ */

export type StorageStats = {
  totalAssets: number
  totalBytes: number
  byProvider: { provider: string; count: number; bytes: number }[]
  byDestination: { destination: string; count: number; bytes: number }[]
  byKind: { kind: string; count: number }[]
  pendingBackup: number
  pendingVerification: number
  lastBackupAt: string | null
}

export async function getStorageStats(): Promise<StorageStats> {
  const [assetsRes, pendingRes, verificationRes] = await Promise.all([
    safe(db().from('media_assets').select('provider, destination, kind, file_size_bytes')),
    safe(db().from('media_assets').select('id', { count: 'exact', head: true }).eq('provider', 'r2').is('backed_up_at', null)),
    safe(db().from('media_assets').select('id', { count: 'exact', head: true }).eq('verification_status', 'pending')),
  ])

  const rows = (assetsRes.data ?? []) as { provider: string; destination: string; kind: string; file_size_bytes: number | null }[]
  const byProvider = new Map<string, { count: number; bytes: number }>()
  const byDestination = new Map<string, { count: number; bytes: number }>()
  const byKind = new Map<string, number>()
  let totalBytes = 0

  for (const row of rows) {
    totalBytes += row.file_size_bytes ?? 0
    const p = byProvider.get(row.provider) ?? { count: 0, bytes: 0 }
    p.count += 1; p.bytes += row.file_size_bytes ?? 0
    byProvider.set(row.provider, p)
    const d = byDestination.get(row.destination) ?? { count: 0, bytes: 0 }
    d.count += 1; d.bytes += row.file_size_bytes ?? 0
    byDestination.set(row.destination, d)
    byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + 1)
  }

  return {
    totalAssets: rows.length,
    totalBytes,
    byProvider: [...byProvider.entries()].map(([provider, v]) => ({ provider, ...v })),
    byDestination: [...byDestination.entries()].map(([destination, v]) => ({ destination, ...v })),
    byKind: [...byKind.entries()].map(([kind, count]) => ({ kind, count })),
    pendingBackup: pendingRes.count ?? 0,
    pendingVerification: verificationRes.count ?? 0,
    lastBackupAt: null,
  }
}

export type MediaAssetRow = {
  id: string
  kind: string
  provider: string
  destination: string
  publicUrl: string | null
  storageKey: string | null
  mimeType: string | null
  sizeBytes: number | null
  backedUpAt: string | null
  backupVerifiedAt: string | null
  verificationStatus: string | null
  createdAt: string | null
  /** Set when a content item references this asset — drives the delete warning. */
  contentItemId: string | null
}

/** Per-asset rows for the storage table (aggregates live in getStorageStats). */
export async function getMediaAssets(options?: {
  page?: number
  limit?: number
  kind?: string
  provider?: string
  backup?: 'backed_up' | 'pending'
}): Promise<{ rows: MediaAssetRow[]; total: number }> {
  const limit = options?.limit ?? 25
  const page = options?.page ?? 1
  const offset = (page - 1) * limit

  let query = db()
    .from('media_assets')
    .select('id, kind, provider, destination, public_url, storage_key, mime_type, file_size_bytes, backed_up_at, backup_verified_at, verification_status, created_at, content_item_id', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (options?.kind && options.kind !== 'all') query = query.eq('kind', options.kind)
  if (options?.provider && options.provider !== 'all') query = query.eq('provider', options.provider)
  if (options?.backup === 'pending') query = query.is('backed_up_at', null)
  if (options?.backup === 'backed_up') query = query.not('backed_up_at', 'is', null)

  const { data, count } = await safe(query)
  return {
    rows: ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      kind: r.kind as string,
      provider: r.provider as string,
      destination: r.destination as string,
      publicUrl: (r.public_url as string | null) ?? null,
      storageKey: (r.storage_key as string | null) ?? null,
      mimeType: (r.mime_type as string | null) ?? null,
      sizeBytes: r.file_size_bytes == null ? null : Number(r.file_size_bytes),
      backedUpAt: (r.backed_up_at as string | null) ?? null,
      backupVerifiedAt: (r.backup_verified_at as string | null) ?? null,
      verificationStatus: (r.verification_status as string | null) ?? null,
      createdAt: (r.created_at as string | null) ?? null,
      contentItemId: (r.content_item_id as string | null) ?? null,
    })),
    total: count ?? 0,
  }
}

/* ------------------------------------------------------------------ */
/* Trust & safety queues (reports + corrections)                      */
/* ------------------------------------------------------------------ */

export type ReportRow = {
  id: string
  reportType: string
  reporterId: string | null
  contentItemId: string | null
  mediaId: string | null
  subject: string | null
  description: string | null
  evidenceUrl: string | null
  status: string
  resolution: string | null
  createdAt: string | null
  updatedAt: string | null
  resolvedAt: string | null
  contentTitle: string | null
  contentType: string | null
  contentSlug: string | null
  contentStatus: string | null
  /** True when the linked content has translations but none in the requested locale. */
  missingLocale: boolean
}

export async function getReports(options?: { status?: string; limit?: number; offset?: number; reportType?: string; locale?: Locale }): Promise<ReportRow[]> {
  const status = options?.status ?? 'all'
  const limit = options?.limit ?? 100
  const offset = options?.offset ?? 0
  const locale = options?.locale ?? 'en'
  let query = db()
    .from('reports')
    .select(`id, report_type, reporter_id, content_item_id, media_id, subject, description, evidence_url,
      status, resolution, created_at, updated_at, resolved_at,
      content:content_items(id, type, slug, status, translations:content_translations(locale, title))`, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (status !== 'all') query = query.eq('status', status)
  if (options?.reportType) query = query.eq('report_type', options.reportType)

  const { data } = await safe(query)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const content = (row.content as Record<string, unknown> | null) ?? null
    const translations =
      content && Array.isArray(content.translations)
        ? content.translations
        : content?.translations
          ? [content.translations]
          : []
    const t = (translations as { locale: string; title: string | null }[]).find((x) => x.locale === locale)
      ?? (translations[0] as { title: string | null } | undefined)
    const missingLocale = (translations as unknown[]).length > 0 && !(translations as { locale: string }[]).some((x) => x.locale === locale)
    return {
      id: row.id as string,
      reportType: row.report_type as string,
      reporterId: row.reporter_id as string | null,
      contentItemId: row.content_item_id as string | null,
      mediaId: row.media_id as string | null,
      subject: row.subject as string | null,
      description: row.description as string | null,
      evidenceUrl: row.evidence_url as string | null,
      status: row.status as string,
      resolution: row.resolution as string | null,
      createdAt: row.created_at as string | null,
      updatedAt: row.updated_at as string | null,
      resolvedAt: row.resolved_at as string | null,
      contentTitle: t?.title ?? null,
      contentType: (content?.type as string | undefined) ?? null,
      contentSlug: (content?.slug as string | undefined) ?? null,
      contentStatus: (content?.status as string | undefined) ?? null,
      missingLocale,
    }
  })
}

export type CorrectionRow = {
  id: string
  contentItemId: string
  reporterId: string | null
  reporterName: string | null
  reporterEmail: string | null
  correctionText: string
  status: string
  resolution: string | null
  createdAt: string | null
  resolvedAt: string | null
  contentTitle: string | null
  contentType: string | null
  contentSlug: string | null
  contentStatus: string | null
  /** True when the linked content has translations but none in the requested locale. */
  missingLocale: boolean
}

export async function getCorrections(options?: { status?: string; limit?: number; offset?: number; locale?: Locale }): Promise<CorrectionRow[]> {
  const status = options?.status ?? 'all'
  const limit = options?.limit ?? 100
  const offset = options?.offset ?? 0
  const locale = options?.locale ?? 'en'
  let query = db()
    .from('corrections')
    .select(`id, content_item_id, reporter_id, reporter_name, reporter_email, correction_text,
      status, resolution, created_at, resolved_at,
      content:content_items(id, type, slug, status, translations:content_translations(locale, title))`)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (status !== 'all') query = query.eq('status', status)

  const { data } = await safe(query)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const content = (row.content as Record<string, unknown> | null) ?? null
    const translations =
      content && Array.isArray(content.translations)
        ? content.translations
        : content?.translations
          ? [content.translations]
          : []
    const t = (translations as { locale: string; title: string | null }[]).find((x) => x.locale === locale)
      ?? (translations[0] as { title: string | null } | undefined)
    const missingLocale = (translations as unknown[]).length > 0 && !(translations as { locale: string }[]).some((x) => x.locale === locale)
    return {
      id: row.id as string,
      contentItemId: row.content_item_id as string,
      reporterId: row.reporter_id as string | null,
      reporterName: row.reporter_name as string | null,
      reporterEmail: row.reporter_email as string | null,
      correctionText: row.correction_text as string,
      status: row.status as string,
      resolution: row.resolution as string | null,
      createdAt: row.created_at as string | null,
      resolvedAt: row.resolved_at as string | null,
      contentTitle: t?.title ?? null,
      contentType: (content?.type as string | undefined) ?? null,
      contentSlug: (content?.slug as string | undefined) ?? null,
      contentStatus: (content?.status as string | undefined) ?? null,
      missingLocale,
    }
  })
}

/** Unfiltered totals for trust-safety tab badges (badges must not reflect the active status filter). */
export async function getTrustSafetyCounts(): Promise<{ reports: number; corrections: number }> {
  if (!hasDatabase()) return { reports: 0, corrections: 0 }
  const [reportsRes, correctionsRes] = await Promise.all([
    safe(db().from('reports').select('id', { count: 'exact', head: true })),
    safe(db().from('corrections').select('id', { count: 'exact', head: true })),
  ])
  return { reports: reportsRes.count ?? 0, corrections: correctionsRes.count ?? 0 }
}

/** Filtered totals for trust-safety pagination (respects the active status pill). */
export async function getTrustSafetyFilteredCounts(status: string): Promise<{ reports: number; corrections: number }> {
  if (!hasDatabase()) return { reports: 0, corrections: 0 }
  const reportsQuery =
    status === 'all'
      ? db().from('reports').select('id', { count: 'exact', head: true })
      : db().from('reports').select('id', { count: 'exact', head: true }).eq('status', status)
  const correctionsQuery =
    status === 'all'
      ? db().from('corrections').select('id', { count: 'exact', head: true })
      : db().from('corrections').select('id', { count: 'exact', head: true }).eq('status', status)
  const [reportsRes, correctionsRes] = await Promise.all([safe(reportsQuery), safe(correctionsQuery)])
  return { reports: reportsRes.count ?? 0, corrections: correctionsRes.count ?? 0 }
}

/**
 * Code-level fallback for the pg_cron job (migration
 * 20260904000000_phase3_content_loop.sql): flips due `scheduled` items to
 * `published` and expires overdue active listings. Called on admin loads —
 * cheap (indexed updates) and idempotent.
 */
export async function runDueContentSweep(): Promise<void> {
  const nowIso = new Date().toISOString()
  await safe(
    db()
      .from('content_items')
      .update({ status: 'published', published_at: nowIso })
      .eq('status', 'scheduled')
      .not('scheduled_for', 'is', null)
      .lte('scheduled_for', nowIso),
  )
  const { data: dueListings } = await safe(
    db()
      .from('content_items')
      .select('id')
      .eq('is_archived', false)
      .not('expires_at', 'is', null)
      .lte('expires_at', nowIso)
      .limit(500),
  )
  const dueIds = ((dueListings ?? []) as { id: string }[]).map((r) => r.id)
  if (dueIds.length > 0) {
    await safe(
      db()
        .from('listings')
        .update({ listing_status: 'expired' })
        .in('content_item_id', dueIds)
        .eq('listing_status', 'active'),
    )
  }
}

/* ------------------------------------------------------------------ */
/* Listings lifecycle queue (Phase 3 buy & sell manager)              */
/* ------------------------------------------------------------------ */

export type AdminListingRow = {
  contentItemId: string
  slug: string | null
  title: string | null
  titleEn: string | null
  titleFr: string | null
  /** True when the item has translations but none in the requested locale. */
  missingLocale: boolean
  price: number | null
  currency: string | null
  listingStatus: string
  contentStatus: string
  isFeatured: boolean
  expiresAt: string | null
  publishedAt: string | null
  sellerName: string | null
  contactPhone: string | null
  contactEmail: string | null
  whatsappNumber: string | null
  sellerVerified: boolean
}

/**
 * Listing rows for the lifecycle manager: content item joined with its
 * listings extension row. When a listing status filter is applied the embed
 * becomes an inner join so the filter runs in SQL, not after the limit.
 */
export async function getListingsAdmin(options?: { status?: string; limit?: number; offset?: number; locale?: Locale; search?: string }): Promise<{ rows: AdminListingRow[]; total: number }> {
  const status = options?.status ?? 'all'
  const limit = options?.limit ?? 100
  const offset = options?.offset ?? 0
  const locale = options?.locale ?? 'en'
  const search = options?.search?.trim() ?? ''

  const select = `id, slug, status, is_featured, expires_at, published_at,
    translations:content_translations(locale, title),
    listing:listings${status !== 'all' ? '!inner' : ''}(price, currency, listing_status, seller_name, seller_is_verified, contact_phone, contact_email, whatsapp_number)`

  let query = db()
    .from('content_items')
    .select(select, { count: 'exact' })
    .eq('type', 'listing')
    .order('published_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)
  if (status !== 'all') query = query.eq('listing.listing_status', status)
  if (search) query = query.or(`slug.ilike.%${search}%,translations.title.ilike.%${search}%`)

  const { data, count } = await safe(query)
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const translations = Array.isArray(row.translations) ? row.translations : row.translations ? [row.translations] : []
    const list = translations as { locale: string; title: string | null }[]
    const titleEn = list.find((x) => x.locale === 'en')?.title ?? null
    const titleFr = list.find((x) => x.locale === 'fr')?.title ?? null
    const t = list.find((x) => x.locale === locale)
      ?? (translations[0] as { title: string | null } | undefined)
    const missingLocale = list.length > 0 && !list.some((x) => x.locale === locale)
    const listing = Array.isArray(row.listing) ? row.listing[0] : row.listing
    const l = (listing as Record<string, unknown> | null) ?? null
    return {
      contentItemId: row.id as string,
      slug: (row.slug as string | null) ?? null,
      title: t?.title ?? null,
      titleEn,
      titleFr,
      missingLocale,
      price: l && l.price != null ? Number(l.price) : null,
      currency: (l ? (l.currency as string | null) : null) ?? null,
      listingStatus: (l ? ((l.listing_status as string) ?? 'active') : 'active'),
      contentStatus: row.status as string,
      isFeatured: !!row.is_featured,
      expiresAt: (row.expires_at as string | null) ?? null,
      publishedAt: (row.published_at as string | null) ?? null,
      sellerName: (l ? (l.seller_name as string | null) : null) ?? null,
      contactPhone: (l ? (l.contact_phone as string | null) : null) ?? null,
      contactEmail: (l ? (l.contact_email as string | null) : null) ?? null,
      whatsappNumber: (l ? (l.whatsapp_number as string | null) : null) ?? null,
      sellerVerified: !!l?.seller_is_verified,
    }
  })
  return { rows, total: count ?? 0 }
}

/* ------------------------------------------------------------------ */
/* Reference data (for forms)                                         */
/* ------------------------------------------------------------------ */

export async function getLocations() {
  const { data } = await safe(db().from('locations').select('id, name, slug').eq('is_active', true).order('name', { ascending: true }))
  return (data ?? []) as { id: string; name: string; slug: string }[]
}

export async function getCategoriesForType(type: ContentType, locale: Locale = 'en') {
  const { data } = await safe(
    db()
      .from('categories')
      .select(`id, slug, translations:category_translations(locale, name)`)
      .eq('content_type', type)
      .eq('is_active', true)
      .order('sort_order', { ascending: true }),
  )
  return (data ?? []).map((row) => {
    const trans = Array.isArray(row.translations) ? row.translations : row.translations ? [row.translations] : []
    const t = (trans as { locale: string; name: string }[]).find((x) => x.locale === locale) ?? (trans[0] as { name: string } | undefined)
    return { id: row.id, slug: row.slug, name: t?.name ?? row.slug }
  })
}

/* ------------------------------------------------------------------ */
/* Taxonomy & places (Phase 1 command center: full back-office lists)  */
/* ------------------------------------------------------------------ */

export type AdminCategoryRow = {
  id: string
  contentType: string
  slug: string
  sortOrder: number
  isActive: boolean
  nameEn: string | null
  nameFr: string | null
  descriptionEn: string | null
  descriptionFr: string | null
  itemCount: number
}

type RawCategoryAdminRow = {
  id: string
  slug: string
  content_type: string
  sort_order: number
  is_active: boolean
  translations: { locale: string; name: string; description: string | null }[] | { locale: string; name: string; description: string | null } | null
  items: { count: number }[] | { count: number } | null
}

/** Every category with both names + live usage count (service-role read). */
export async function getCategoriesAdmin(): Promise<AdminCategoryRow[]> {
  const { data } = await safe(
    db()
      .from('categories')
      .select(
        'id, slug, content_type, sort_order, is_active, translations:category_translations(locale, name, description), items:content_items(count)',
      )
      .order('content_type', { ascending: true })
      .order('sort_order', { ascending: true }),
  )
  return ((data ?? []) as RawCategoryAdminRow[]).map((row) => {
    const trans = Array.isArray(row.translations) ? row.translations : row.translations ? [row.translations] : []
    const items = Array.isArray(row.items) ? row.items[0] : row.items
    return {
      id: row.id,
      contentType: row.content_type,
      slug: row.slug,
      sortOrder: row.sort_order,
      isActive: row.is_active,
      nameEn: trans.find((t) => t.locale === 'en')?.name ?? null,
      nameFr: trans.find((t) => t.locale === 'fr')?.name ?? null,
      descriptionEn: trans.find((t) => t.locale === 'en')?.description ?? null,
      descriptionFr: trans.find((t) => t.locale === 'fr')?.description ?? null,
      itemCount: items?.count ?? 0,
    }
  })
}

export type AdminLocationRow = {
  id: string
  name: string
  slug: string
  locale: string | null
  locationType: string | null
  description: string | null
  latitude: number | null
  longitude: number | null
  isActive: boolean
  parentId: string | null
  parentName: string | null
  contentCount: number
  profileCount: number
}

type RawLocationAdminRow = {
  id: string
  name: string
  slug: string
  locale: string | null
  location_type: string | null
  description: string | null
  latitude: number | string | null
  longitude: number | string | null
  is_active: boolean
  parent_id: string | null
  items: { count: number }[] | { count: number } | null
  residents: { count: number }[] | { count: number } | null
}

/** Every location with parent + live usage counts (service-role read). */
export async function getLocationsAdmin(): Promise<AdminLocationRow[]> {
  const { data } = await safe(
    db()
      .from('locations')
      .select(
        'id, name, slug, locale, location_type, description, latitude, longitude, is_active, parent_id, items:content_items(count), residents:profiles(count)',
      )
      .order('name', { ascending: true }),
  )
  const rows = (data ?? []) as RawLocationAdminRow[]
  // Parent names via a second id→name pass (no self-join FK-hint dependence).
  const nameById = new Map(rows.map((r) => [r.id, r.name] as const))
  return rows.map((row) => {
    const items = Array.isArray(row.items) ? row.items[0] : row.items
    const residents = Array.isArray(row.residents) ? row.residents[0] : row.residents
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      locale: row.locale ?? null,
      locationType: row.location_type,
      description: row.description,
      latitude: row.latitude === null ? null : Number(row.latitude),
      longitude: row.longitude === null ? null : Number(row.longitude),
      isActive: row.is_active,
      parentId: row.parent_id,
      parentName: row.parent_id ? (nameById.get(row.parent_id) ?? null) : null,
      contentCount: items?.count ?? 0,
      profileCount: residents?.count ?? 0,
    }
  })
}

/* ------------------------------------------------------------------ */
/* Community polls (admin management)                                 */
/* ------------------------------------------------------------------ */

export type AdminPollOption = {
  id: string
  label: string
  sortOrder: number
  votes: number
}

export type AdminPollRow = {
  id: string
  slug: string | null
  question: string
  locale: string
  isActive: boolean
  closesAt: string | null
  createdAt: string | null
  contentItemId: string | null
  options: AdminPollOption[]
  totalVotes: number
}

/** All polls (active and closed) with per-option tallies, newest first. */
export async function getPollsAdmin(limit = 100): Promise<AdminPollRow[]> {
  // poll_results is a view with no FK metadata, so PostgREST cannot embed it
  // through poll_options — read the tallies separately and merge, mirroring
  // getActivePolls in lib/queries/polls.ts.
  const [pollsRes, talliesRes] = await Promise.all([
    safe(
      db()
        .from('polls')
        .select('id, slug, question, locale, is_active, closes_at, created_at, content_item_id, poll_options(id, label, sort_order)')
        .order('created_at', { ascending: false })
        .limit(limit),
    ),
    safe(db().from('poll_results').select('option_id, votes')),
  ])

  const tallies = new Map<string, number>()
  for (const r of (talliesRes.data ?? []) as { option_id: string; votes: number | null }[]) {
    tallies.set(r.option_id, Number(r.votes ?? 0))
  }

  return ((pollsRes.data ?? []) as {
    id: string
    slug: string | null
    question: string
    locale: string
    is_active: boolean
    closes_at: string | null
    created_at: string | null
    content_item_id: string | null
    poll_options: { id: string; label: string; sort_order: number | null }[] | null
  }[]).map((row) => {
    const options = (row.poll_options ?? [])
      .slice()
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
      .map((o) => ({
        id: o.id,
        label: o.label,
        sortOrder: o.sort_order ?? 0,
        votes: tallies.get(o.id) ?? 0,
      }))
    return {
      id: row.id,
      slug: row.slug,
      question: row.question,
      locale: row.locale,
      isActive: row.is_active,
      closesAt: row.closes_at,
      createdAt: row.created_at,
      contentItemId: row.content_item_id,
      options,
      totalVotes: options.reduce((sum, o) => sum + o.votes, 0),
    }
  })
}

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
 * Every fundraiser campaign with its parent story. `content_item_id` is the
 * fundraisers primary key, so the join is one-to-one. The story title prefers
 * the requested locale so /fr/admin/fundraisers shows French titles instead
 * of leaking English copy into the French back office.
 */
export async function getFundraisersAdmin(limit = 100, locale: Locale = 'en'): Promise<AdminFundraiserRow[]> {
  const { data } = await safe(
    db()
      .from('fundraisers')
      .select(`content_item_id, goal_amount, currency, raised_amount, organizer_name,
        organizer_phone, organizer_email, donation_url, payout_method, payout_account, payout_account_name, verification_notes, closed_at,
        story:content_items(id, slug, type, status, expires_at,
          translations:content_translations(locale, title, body))`)
      .limit(limit),
  )

  return (data ?? []).map((row) => {
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

/* ------------------------------------------------------------------ */
/* Site settings (public, non-secret key-value config)                */
/* ------------------------------------------------------------------ */

export const SITE_SETTING_KEYS = [
  'social_facebook_url',
  'social_youtube_url',
  'site_logo_url',
  'site_name',
  'site_tagline',
  'site_name_fr',
  'site_tagline_fr',
] as const

export type SiteSettingKey = (typeof SITE_SETTING_KEYS)[number]

export type SiteSettings = {
  facebookUrl: string | null
  youtubeUrl: string | null
  logoUrl: string | null
  siteName: string | null
  siteTagline: string | null
  siteNameFr: string | null
  siteTaglineFr: string | null
}

const EMPTY_SITE_SETTINGS: SiteSettings = {
  facebookUrl: null,
  youtubeUrl: null,
  logoUrl: null,
  siteName: null,
  siteTagline: null,
  siteNameFr: null,
  siteTaglineFr: null,
}

function toSiteSettings(rows: { key: string; value: string | null }[]): SiteSettings {
  const map: SiteSettings = { ...EMPTY_SITE_SETTINGS }
  for (const row of rows) {
    if (row.key === 'social_facebook_url') map.facebookUrl = row.value?.trim() || null
    if (row.key === 'social_youtube_url') map.youtubeUrl = row.value?.trim() || null
    if (row.key === 'site_logo_url') map.logoUrl = row.value?.trim() || null
    if (row.key === 'site_name') map.siteName = row.value?.trim() || null
    if (row.key === 'site_tagline') map.siteTagline = row.value?.trim() || null
    if (row.key === 'site_name_fr') map.siteNameFr = row.value?.trim() || null
    if (row.key === 'site_tagline_fr') map.siteTaglineFr = row.value?.trim() || null
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
    site_logo_url: null,
    site_name: null,
    site_tagline: null,
    site_name_fr: null,
    site_tagline_fr: null,
  }
  for (const row of rows) {
    if (row.key === 'social_facebook_url') result.social_facebook_url = row.value
    if (row.key === 'social_youtube_url') result.social_youtube_url = row.value
    if (row.key === 'site_logo_url') result.site_logo_url = row.value
    if (row.key === 'site_name') result.site_name = row.value
    if (row.key === 'site_tagline') result.site_tagline = row.value
    if (row.key === 'site_name_fr') result.site_name_fr = row.value
    if (row.key === 'site_tagline_fr') result.site_tagline_fr = row.value
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

/* ------------------------------------------------------------------ */
/* Content editor (Phase 3 drawer)                                    */
/* ------------------------------------------------------------------ */

export type ContentTranslationInput = {
  locale: 'en' | 'fr'
  title: string
  excerpt: string
  body: string
}

export type ContentItemFull = {
  id: string
  type: ContentType
  slug: string | null
  status: string
  verification: string | null
  locationId: string | null
  locationName: string | null
  categoryId: string | null
  categoryName: string | null
  authorId: string | null
  submittedBy: string | null
  publishedAt: string | null
  scheduledFor: string | null
  expiresAt: string | null
  translations: ContentTranslationInput[]
  media: { id: string; publicUrl: string | null; caption: string | null; photographerCredit: string | null; isCover: boolean }[]
  listing: { price: number | null; currency: string | null; listingStatus: string; contactPhone: string | null; sellerName: string | null } | null
  notice: { noticeType: string; organizationName: string | null; isOfficial: boolean; contactPhone: string | null; noticeDate: string | null; expiryDate: string | null } | null
}

/**
 * Full content-item shape for the moderation edit drawer: translations,
 * media, location/category and the type-specific extension row (listing or
 * notice) in a single embed.
 */
export async function getContentItemFull(id: string): Promise<ContentItemFull | null> {
  const { data } = await safe(
    db()
      .from('content_items')
      .select(`id, type, slug, status, verification, location_id, category_id, author_id, submitted_by,
        published_at, scheduled_for, expires_at,
        location:locations(id, name),
        category:categories(id, slug),
        translations:content_translations(locale, title, excerpt, body),
        media:media_assets(id, public_url, caption, photographer_credit, is_cover, sort_order),
        listing:listings(price, currency, listing_status, contact_phone, seller_name),
        notice:notices(notice_type, organization_name, is_official, contact_phone, notice_date, expiry_date)`)
      .eq('id', id)
      .limit(1),
  )
  const row = (data ?? [])[0] as Record<string, unknown> | undefined
  if (!row) return null

  const location = Array.isArray(row.location) ? row.location[0] : row.location
  const category = Array.isArray(row.category) ? row.category[0] : row.category
  const translations = Array.isArray(row.translations) ? row.translations : row.translations ? [row.translations] : []
  const media = Array.isArray(row.media) ? row.media : []
  const listing = Array.isArray(row.listing) ? row.listing[0] : row.listing
  const notice = Array.isArray(row.notice) ? row.notice[0] : row.notice

  const trFor = (locale: 'en' | 'fr') =>
    (translations as { locale: string; title: string | null; excerpt: string | null; body: string | null }[]).find((t) => t.locale === locale)

  return {
    id: row.id as string,
    type: row.type as ContentType,
    slug: (row.slug as string | null) ?? null,
    status: row.status as string,
    verification: (row.verification as string | null) ?? null,
    locationId: (row.location_id as string | null) ?? null,
    locationName: (location as { name: string } | undefined)?.name ?? null,
    categoryId: (row.category_id as string | null) ?? null,
    categoryName: (category as { slug: string } | undefined)?.slug ?? null,
    authorId: (row.author_id as string | null) ?? null,
    submittedBy: (row.submitted_by as string | null) ?? null,
    publishedAt: (row.published_at as string | null) ?? null,
    scheduledFor: (row.scheduled_for as string | null) ?? null,
    expiresAt: (row.expires_at as string | null) ?? null,
    translations: (['en', 'fr'] as const).map((locale) => {
      const t = trFor(locale)
      return {
        locale,
        title: t?.title ?? '',
        excerpt: t?.excerpt ?? '',
        body: t?.body ?? '',
      }
    }),
    media: (media as Record<string, unknown>[]).map((m) => ({
      id: m.id as string,
      publicUrl: (m.public_url as string | null) ?? null,
      caption: (m.caption as string | null) ?? null,
      photographerCredit: (m.photographer_credit as string | null) ?? null,
      isCover: !!m.is_cover,
    })),
    listing: listing
      ? {
          price: (listing.price as number | null) ?? null,
          currency: (listing.currency as string | null) ?? null,
          listingStatus: (listing.listing_status as string) ?? 'active',
          contactPhone: (listing.contact_phone as string | null) ?? null,
          sellerName: (listing.seller_name as string | null) ?? null,
        }
      : null,
    notice: notice
      ? {
          noticeType: (notice.notice_type as string) ?? 'other',
          organizationName: (notice.organization_name as string | null) ?? null,
          isOfficial: !!notice.is_official,
          contactPhone: (notice.contact_phone as string | null) ?? null,
          noticeDate: (notice.notice_date as string | null) ?? null,
          expiryDate: (notice.expiry_date as string | null) ?? null,
        }
      : null,
  }
}

