import 'server-only'

import { logger } from '@/lib/observability/logger'
import type { Locale } from '@/lib/i18n'
import type { ContentType, SubmissionStatus } from '@/lib/auth/roles'
import { db, hasDatabase, safe, toPayloadRecord } from './shared'
import type { ModerationEntry } from './safety'
import { getRecentModeration } from './safety'

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

/**
 * Sidebar-badge count: ONE `count` query instead of the 12-query
 * getDashboardStats() fan-out. The admin layout renders on every /admin page
 * but only reads `pendingSubmissions` — it uses this; the full stats stay on
 * the dashboard page itself.
 */
export async function getPendingSubmissionCount(): Promise<number> {
  if (!hasDatabase()) return 0
  try {
    const res = await safe(
      db().from('submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    )
    return res.count ?? 0
  } catch (e) {
    logger.error('admin', 'getPendingSubmissionCount failed, returning 0', { error: e })
    return 0
  }
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
    logger.error('admin', 'getDashboardStats failed, returning empty stats', { error: e })
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
  order?: 'newest' | 'oldest'
}): Promise<{ rows: SubmissionRow[]; total: number }> {
  const status = options?.status ?? 'pending'
  const type = options?.type ?? 'all'
  const search = options?.search?.trim() ?? ''
  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0
  const ascending = options?.order === 'oldest'

  // Fail-safe: a DB hiccup or missing service-role env resolves to an empty
  // queue rather than crashing the page into the global error boundary.
  if (!hasDatabase()) return { rows: [], total: 0 }
  try {
    let query = db()
      .from('submissions')
      .select('id, submission_type, status, guest_name, guest_email, guest_phone, consent_confirmed, rights_confirmed, submitted_at, reviewed_at, rejection_reason, internal_notes, payload, content_item_id', { count: 'exact' })
      .order('submitted_at', { ascending, nullsFirst: false })
      .range(offset, offset + limit - 1)

    if (status !== 'all') {
      query = Array.isArray(status) ? query.in('status', status) : query.eq('status', status)
    }
    if (type !== 'all') query = query.eq('submission_type', type)
    if (search) {
      // Phase 3: sanitize or() metacharacters (commas break the expression,
      // %/_ widen the scan) and extend the search to internal_notes +
      // rejection_reason so editors can find annotated rows.
      const phrase = search.replace(/[,()%\\*]/g, ' ').replace(/[%_]/g, '').trim().slice(0, 80)
      if (phrase) {
        query = query.or(`guest_name.ilike.*${phrase}*,guest_email.ilike.*${phrase}*,guest_phone.ilike.*${phrase}*,payload::text.ilike.*${phrase}*,internal_notes.ilike.*${phrase}*,rejection_reason.ilike.*${phrase}*`)
      }
    }

    const { data, count } = await safe(query)
    return {
      rows: (data ?? []).map((r) => ({
      id: r.id,
      submissionType: r.submission_type,
      status: r.status as SubmissionStatus,
      guestName: r.guest_name,
      guestEmail: r.guest_email,
      guestPhone: r.guest_phone,
      consentConfirmed: r.consent_confirmed,
      rightsConfirmed: r.rights_confirmed,
      submittedAt: r.submitted_at,
      reviewedAt: r.reviewed_at,
      rejectionReason: r.rejection_reason,
      internalNotes: r.internal_notes,
      payload: toPayloadRecord(r.payload),
      contentItemId: r.content_item_id,
      })),
      total: count ?? 0,
    }
  } catch (e) {
    logger.error('admin', 'getSubmissions failed, returning empty queue', { error: e })
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
    logger.error('admin', 'getSubmissionCounts failed, returning empty counts', { error: e })
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
    status: row.status as SubmissionStatus,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    guestPhone: row.guest_phone,
    consentConfirmed: row.consent_confirmed,
    rightsConfirmed: row.rights_confirmed,
    submittedAt: row.submitted_at,
    reviewedAt: row.reviewed_at,
    rejectionReason: row.rejection_reason,
    internalNotes: row.internal_notes,
    payload: toPayloadRecord(row.payload),
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

/** Search public contributor profiles by display name for the author picker. */
export async function searchAuthorProfiles(term: string, limit = 12): Promise<{ id: string; name: string }[]> {
  const q = term.trim()
  if (!q) return []
  if (!hasDatabase()) return []
  try {
    const { data } = await safe(
      db()
        .from('profiles')
        .select('id, display_name, full_name')
        .ilike('display_name', `%${q}%`)
        .order('display_name', { ascending: true, nullsFirst: true })
        .limit(limit),
    )
    return (data ?? []).map((r) => ({
      id: r.id,
      name: (r.display_name || r.full_name || '—').trim(),
    }))
  } catch (e) {
    logger.error('admin', 'searchAuthorProfiles failed', { error: e instanceof Error ? e.message : String(e) })
    return []
  }
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
  /** Phase 4 — WhatsApp share line + voice register (EN row preferred). */
  shareText: string | null
  voiceType: string | null
  tags: { id: string; name: string | null }[]
  photos: { id: string; url: string; alt: string | null; caption: string | null; credit: string | null }[]
  listing: { price: number | null; currency: string | null; contactPhone: string | null; contactEmail: string | null; whatsappNumber: string | null; sellerName: string | null; listingStatus: string | null; sellerVerified: boolean } | null
  notice: { noticeType: string; organizationName: string | null; contactPhone: string | null; isOfficial: boolean; noticeDate: string | null; expiryDate: string | null } | null
  event: { startsAt: string | null; endsAt: string | null; venueName: string | null; ticketUrl: string | null; organizerName: string | null; organizerPhone: string | null; organizerEmail: string | null } | null
}

/**
 * Translation columns the edit drawer selects. `share_text` + `voice_type`
 * arrive from the Phase 4 migration; a database that has not applied it must
 * still open the editor (see getContentItemEditData).
 */
const TRANSLATION_COLUMNS = [
  'locale',
  'title',
  'excerpt',
  'body',
  'seo_description',
  'byline',
  'share_text',
  'voice_type',
] as const

/**
 * The subset allowed to drop out of the select when the database has not
 * caught up. `locale`/`title`/`excerpt`/`body` are load-bearing for the form,
 * and a failure on those is a real outage rather than drift — so they are
 * never retried away.
 */
const DRIFTABLE_TRANSLATION_COLUMNS: readonly string[] = ['seo_description', 'byline', 'share_text', 'voice_type']

/** The edit-drawer select, with the translation columns assembled from above. */
function contentEditSelect(columns: readonly string[]): string {
  return `id, type, slug, status, verification, is_featured, is_archived, published_at, scheduled_for, expires_at, created_at, author_id, submitted_by, location_id, category_id, translations:content_translations(${columns.join(', ')}), tags:content_tags(tag:tags(id, tag_translations(locale, name))), location:locations(name), category:categories!category_id(category_translations(locale, name)), media:media_assets(id, public_url, caption, alt_text, photographer_credit, sort_order), author:profiles!content_items_author_id_fkey(display_name), listing:listings(price, currency, contact_phone, contact_email, whatsapp_number, seller_name, listing_status, seller_is_verified), notice:notices(notice_type, organization_name, contact_phone, is_official, notice_date, expiry_date), event:events(starts_at, ends_at, venue_name, ticket_url, organizer_name, organizer_phone, organizer_email)`
}

/**
 * Postgres 42703 message → the offending content_translations column names.
 * PostgREST phrases it as `column content_translations.share_text does not
 * exist` (or, for an embedded resource, `content_translations_1.share_text`),
 * and reports only the first offender per attempt.
 */
function driftedTranslationColumns(message: string): string[] {
  const names = new Set<string>()
  for (const match of message.matchAll(/content_translations(?:_\d+)?\.(\w+) does not exist/g)) {
    const col = match[1]
    if (DRIFTABLE_TRANSLATION_COLUMNS.includes(col)) names.add(col)
  }
  return [...names]
}

/** Full content item for the admin edit drawer (service-role read, all locales + type rows). */
export async function getContentItemEditData(contentItemId: string): Promise<ContentEditData | null> {
  let columns: string[] = [...TRANSLATION_COLUMNS]
  let result = await safe(
    db()
      .from('content_items')
      .select(contentEditSelect(columns))
      .eq('id', contentItemId)
      .limit(1),
  )
  // A failed select is NOT the same as a missing row. PostgREST rejects the
  // WHOLE embedded resource when one named column is absent, so a database
  // that has not applied the Phase 4 migration reported live items as
  // "Content not found — it may have been deleted". Drop only the columns the
  // server names as missing and retry, so the editor still opens. PostgREST
  // reports one offender per attempt, hence the loop; it is bounded by the
  // number of droppable columns and stops at the first row, the first
  // non-drift error, or once nothing droppable is left in the select.
  while (!result.data && result.error) {
    const drifted = driftedTranslationColumns(result.error).filter((c) => columns.includes(c))
    if (drifted.length === 0) break
    columns = columns.filter((c) => !drifted.includes(c))
    logger.warn('admin', 'content_translations column missing — retrying the edit select without it', {
      contentItemId,
      missing: drifted,
    })
    result = await safe(
      db()
        .from('content_items')
        .select(contentEditSelect(columns))
        .eq('id', contentItemId)
        .limit(1),
    )
  }
  if (!result.data && result.error) {
    logger.error('admin', 'getContentItemEditData query failed', { contentItemId, error: result.error })
  }
  const row = ((result.data ?? []) as unknown as Record<string, unknown>[])[0] ?? null
  if (!row) return null
  const base = mapContentRow(row, 'en')
  const translations = (Array.isArray(row.translations) ? row.translations : row.translations ? [row.translations] : []) as { locale: string; title: string | null; excerpt: string | null; body: string | null; seo_description: string | null; byline: string | null; share_text: string | null; voice_type: string | null }[]
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
    shareText: en?.share_text ?? fr?.share_text ?? null,
    voiceType: en?.voice_type ?? fr?.voice_type ?? null,
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

