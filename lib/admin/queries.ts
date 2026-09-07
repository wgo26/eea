import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
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
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)

  const [pendingRes, byTypeRes, todayRes, scheduledRes, draftRes, expiringRes, activeAdsRes, countsRes, storageRes, activityRes] = await Promise.all([
    safe(db().from('submissions').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
    safe(db().from('submissions').select('submission_type').eq('status', 'pending')),
    safe(db().from('content_items').select('id', { count: 'exact', head: true }).eq('status', 'published').gte('published_at', today.toISOString())),
    safe(db().from('content_items').select('id', { count: 'exact', head: true }).eq('status', 'scheduled')),
    safe(db().from('content_items').select('id', { count: 'exact', head: true }).eq('status', 'draft')),
    safe(db().from('listings').select('content_item_id', { count: 'exact', head: true }).eq('listing_status', 'active')),
    safe(db().from('ad_campaigns').select('id', { count: 'exact', head: true }).eq('status', 'active')),
    safe(db().from('content_items').select('type')),
    safe(db().from('media_assets').select('provider, file_size_bytes')),
    getRecentModeration(8),
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
    expiringListings: expiringRes.count ?? 0,
    activeAds: activeAdsRes.count ?? 0,
    totalStories: countByType('photo_story'),
    totalNews: countByType('news'),
    totalListings: countByType('listing'),
    totalNotices: countByType('notice'),
    totalCulture: countByType('culture'),
    storageUsed,
    storageByProvider: [...providerMap.entries()].map(([provider, v]) => ({ provider, ...v })),
    recentActivity: activityRes,
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
  status?: SubmissionStatus | 'all'
  type?: ContentType | 'all'
  limit?: number
}): Promise<SubmissionRow[]> {
  const status = options?.status ?? 'pending'
  const type = options?.type ?? 'all'
  const limit = options?.limit ?? 50

  let query = db()
    .from('submissions')
    .select('id, submission_type, status, guest_name, guest_email, guest_phone, consent_confirmed, rights_confirmed, submitted_at, reviewed_at, rejection_reason, internal_notes, payload, content_item_id')
    .order('submitted_at', { ascending: false, nullsFirst: false })
    .limit(limit)

  if (status !== 'all') query = query.eq('status', status)
  if (type !== 'all') query = query.eq('submission_type', type)

  const { data } = await safe(query)
  return (data ?? []).map((r) => ({
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
  }))
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
  title: string | null
  excerpt: string | null
  locationName: string | null
  categoryName: string | null
  coverUrl: string | null
  authorId: string | null
  submittedBy: string | null
}

const CONTENT_SELECT = `id, type, slug, status, verification, is_featured, is_archived, published_at, scheduled_for, expires_at, created_at, author_id, submitted_by,
  translations:content_translations(locale, title, excerpt),
  location:locations(name),
  category:categories!category_id(category_translations(locale, name)),
  cover:media_assets!inner(public_url)`

export async function getContentItems(options?: {
  status?: string | 'all'
  type?: ContentType | 'all'
  search?: string
  limit?: number
  locale?: Locale
}): Promise<ContentRow[]> {
  const status = options?.status ?? 'all'
  const type = options?.type ?? 'all'
  const limit = options?.limit ?? 50
  const locale = options?.locale ?? 'en'

  let query = db()
    .from('content_items')
    .select(CONTENT_SELECT)
    .order('updated_at', { ascending: false })
    .limit(limit)

  if (status !== 'all') query = query.eq('status', status)
  if (type !== 'all') query = query.eq('type', type)

  const { data } = await safe(query)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => mapContentRow(row, locale))
}

function mapContentRow(row: Record<string, unknown>, locale: Locale): ContentRow {
  const translations = Array.isArray(row.translations) ? row.translations : row.translations ? [row.translations] : []
  const t = (translations as { locale: string; title: string | null; excerpt: string | null }[]).find((x) => x.locale === locale) ?? (translations[0] as { title: string | null; excerpt: string | null } | undefined)

  const location = Array.isArray(row.location) ? row.location[0] : row.location
  const category = Array.isArray(row.category) ? row.category[0] : row.category
  const catTrans = category && Array.isArray(category.category_translations) ? category.category_translations : []
  const catName = catTrans.length ? (catTrans as { locale: string; name: string }[]).find((c) => c.locale === locale)?.name ?? (catTrans[0] as { name: string }).name : null

  const cover = Array.isArray(row.cover) ? row.cover[0] : row.cover

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
    title: t?.title ?? null,
    excerpt: t?.excerpt ?? null,
    locationName: (location as { name: string } | undefined)?.name ?? null,
    categoryName: catName,
    coverUrl: (cover as { public_url: string } | undefined)?.public_url ?? null,
    authorId: row.author_id as string | null,
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
  photos: { id: string; url: string; caption: string | null; credit: string | null }[]
  listing: { price: number | null; currency: string | null; contactPhone: string | null; contactEmail: string | null; whatsappNumber: string | null; sellerName: string | null } | null
  notice: { noticeType: string; organizationName: string | null; contactPhone: string | null; isOfficial: boolean; noticeDate: string | null; expiryDate: string | null } | null
  event: { startsAt: string | null; endsAt: string | null; venueName: string | null; ticketUrl: string | null; organizerName: string | null; organizerPhone: string | null; organizerEmail: string | null } | null
}

/** Full content item for the admin edit drawer (service-role read, all locales + type rows). */
export async function getContentItemEditData(contentItemId: string): Promise<ContentEditData | null> {
  const { data } = await safe(
    db()
      .from('content_items')
      .select('id, type, slug, status, verification, is_featured, is_archived, published_at, scheduled_for, expires_at, created_at, author_id, submitted_by, location_id, category_id, translations:content_translations(locale, title, excerpt, body), location:locations(name), category:categories!category_id(category_translations(locale, name)), media:media_assets(id, public_url, caption, photographer_credit, sort_order), listing:listings(price, currency, contact_phone, contact_email, whatsapp_number), notice:notices(notice_type, organization_name, contact_phone, is_official, notice_date, expiry_date), event:events(starts_at, ends_at, venue_name, ticket_url, organizer_name, organizer_phone, organizer_email)')
      .eq('id', contentItemId)
      .limit(1),
  )
  const row = ((data ?? []) as unknown as Record<string, unknown>[])[0] ?? null
  if (!row) return null
  const base = mapContentRow(row, 'en')
  const translations = (Array.isArray(row.translations) ? row.translations : row.translations ? [row.translations] : []) as { locale: string; title: string | null; excerpt: string | null; body: string | null }[]
  const en = translations.find((t) => t.locale === 'en')
  const fr = translations.find((t) => t.locale === 'fr')
  const media = (Array.isArray(row.media) ? row.media : row.media ? [row.media] : []) as { id: string; public_url: string; caption: string | null; photographer_credit: string | null }[]
  const listingRaw = (Array.isArray(row.listing) ? row.listing[0] : row.listing) as { price: number | string | null; currency: string | null; contact_phone: string | null; contact_email: string | null; whatsapp_number: string | null; seller_name?: string | null } | null | undefined
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
    locationId: row.location_id as string | null,
    categoryId: row.category_id as string | null,
    photos: [...media].sort((a, b) => (a as unknown as { sort_order: number }).sort_order - (b as unknown as { sort_order: number }).sort_order).map((m) => ({ id: m.id, url: m.public_url, caption: m.caption, credit: m.photographer_credit })),
    listing: listingRaw ? { price: listingRaw.price === null ? null : Number(listingRaw.price), currency: listingRaw.currency, contactPhone: listingRaw.contact_phone, contactEmail: listingRaw.contact_email, whatsappNumber: listingRaw.whatsapp_number, sellerName: (listingRaw.seller_name as string | null) ?? null } : null,
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
}

export async function getHomepageSlots(locale: Locale = 'en'): Promise<HomepageSlot[]> {
  const { data } = await safe(
    db()
      .from('homepage_slots')
      .select(`id, slot_key, content_item_id, sort_order, is_active, starts_at, ends_at,
        content:content_items(id, type,
          translations:content_translations(locale, title),
          cover:media_assets!inner(public_url))`)
      .order('sort_order', { ascending: true }),
  )
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const content = (row.content as unknown as { id: string; type: string; translations: { locale: string; title: string }[]; cover: { public_url: string }[] } | null) ?? null
    const translations = content && Array.isArray(content.translations) ? content.translations : content?.translations ? [content.translations] : []
    const t = (translations as { locale: string; title: string }[]).find((x) => x.locale === locale) ?? (translations[0] as { title: string } | undefined)
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

export async function getUsers(options?: { search?: string; role?: AppRole | 'all'; status?: 'all' | 'active' | 'suspended' | 'banned'; limit?: number }): Promise<UserRow[]> {
  const search = options?.search?.trim()
  const role = options?.role ?? 'all'
  const limit = options?.limit ?? 50

  let query = db()
    .from('profiles')
    .select(`id, display_name, full_name, email, phone, avatar_url, is_verified, is_public, is_suspended, is_banned, contributor_featured, contributor_bio_override, created_at,
      location:locations(name),
      roles:user_roles(role)`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (search) query = query.or(`display_name.ilike.%${search}%,full_name.ilike.%${search}%,email.ilike.%${search}%`)
  if (role !== 'all') query = query.eq('roles.role', role)
  if (options?.status === 'suspended') query = query.eq('is_suspended', true)
  if (options?.status === 'banned') query = query.eq('is_banned', true)
  if (options?.status === 'active') query = query.eq('is_suspended', false).eq('is_banned', false)

  const { data } = await safe(query)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
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
  impressions: number
  clicks: number
}

export async function getAdSlots(): Promise<AdSlotRow[]> {
  const { data } = await safe(
    db()
      .from('ad_slots')
      .select(`id, slot_key, name, placement, dimensions, base_price, currency, is_active,
        campaigns:ad_campaigns(id, name, status, destination_url, copy_text, starts_at, ends_at, agreed_price, currency, payment_status,
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
            agreedPrice: active.agreed_price as number | null,
            currency: (active.currency as string) ?? row.currency,
            paymentStatus: active.payment_status as string | null,
            advertiserName: (advertiser as { company_name: string } | undefined)?.company_name ?? null,
            impressions,
            clicks,
          }
        : null,
    }
  })
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
  actorName: string | null
  contentTitle: string | null
  contentType: string | null
  submissionId: string | null
}

export async function getRecentModeration(limit = 20): Promise<ModerationEntry[]> {
  const { data } = await safe(
    db()
      .from('moderation_log')
      .select(`id, action, from_status, to_status, notes, created_at, submission_id,
        actor:profiles(display_name, full_name),
        content:content_items(type, translations:content_translations(locale, title))`)
      .order('created_at', { ascending: false })
      .limit(limit),
  )
  return (data ?? []).map((row) => {
    const actor = Array.isArray(row.actor) ? row.actor[0] : row.actor
    const content = Array.isArray(row.content) ? row.content[0] : row.content
    const translations = content && Array.isArray(content.translations) ? content.translations : content?.translations ? [content.translations] : []
    const t = (translations as { title: string }[])[0]
    return {
      id: row.id,
      action: row.action,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      notes: row.notes,
      createdAt: row.created_at,
      actorName: (actor as { display_name: string | null; full_name: string | null } | undefined)?.display_name ?? (actor as { full_name: string | null } | undefined)?.full_name ?? null,
      contentTitle: t?.title ?? null,
      contentType: content?.type ?? null,
      submissionId: row.submission_id,
    }
  })
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
  lastBackupAt: string | null
}

export async function getStorageStats(): Promise<StorageStats> {
  const [assetsRes, pendingRes] = await Promise.all([
    safe(db().from('media_assets').select('provider, destination, kind, file_size_bytes')),
    safe(db().from('media_assets').select('id', { count: 'exact', head: true }).eq('provider', 'r2').is('backed_up_at', null)),
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
    lastBackupAt: null,
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
}

export async function getReports(options?: { status?: string; limit?: number; reportType?: string }): Promise<ReportRow[]> {
  const status = options?.status ?? 'all'
  const limit = options?.limit ?? 100
  let query = db()
    .from('reports')
    .select(`id, report_type, reporter_id, content_item_id, media_id, subject, description, evidence_url,
      status, resolution, created_at, updated_at, resolved_at,
      content:content_items(id, type, slug, status, translations:content_translations(locale, title))`)
    .order('created_at', { ascending: false })
    .limit(limit)
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
    const t = (translations as { locale: string; title: string | null }[]).find((x) => x.locale === 'en')
      ?? (translations[0] as { title: string | null } | undefined)
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
}

export async function getCorrections(options?: { status?: string; limit?: number }): Promise<CorrectionRow[]> {
  const status = options?.status ?? 'all'
  const limit = options?.limit ?? 100
  let query = db()
    .from('corrections')
    .select(`id, content_item_id, reporter_id, reporter_name, reporter_email, correction_text,
      status, resolution, created_at, resolved_at,
      content:content_items(id, type, slug, status, translations:content_translations(locale, title))`)
    .order('created_at', { ascending: false })
    .limit(limit)
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
    const t = (translations as { locale: string; title: string | null }[]).find((x) => x.locale === 'en')
      ?? (translations[0] as { title: string | null } | undefined)
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
    }
  })
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
  price: number | null
  currency: string | null
  listingStatus: string
  contentStatus: string
  isFeatured: boolean
  expiresAt: string | null
  publishedAt: string | null
  sellerName: string | null
  contactPhone: string | null
}

/**
 * Listing rows for the lifecycle manager: content item joined with its
 * listings extension row. When a listing status filter is applied the embed
 * becomes an inner join so the filter runs in SQL, not after the limit.
 */
export async function getListingsAdmin(options?: { status?: string; limit?: number }): Promise<AdminListingRow[]> {
  const status = options?.status ?? 'all'
  const limit = options?.limit ?? 100

  const select = `id, slug, status, is_featured, expires_at, published_at,
    translations:content_translations(locale, title),
    listing:listings${status !== 'all' ? '!inner' : ''}(price, currency, listing_status, seller_name, contact_phone)`

  let query = db()
    .from('content_items')
    .select(select)
    .eq('type', 'listing')
    .order('published_at', { ascending: false, nullsFirst: false })
    .limit(limit)
  if (status !== 'all') query = query.eq('listing.listing_status', status)

  const { data } = await safe(query)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const translations = Array.isArray(row.translations) ? row.translations : row.translations ? [row.translations] : []
    const t =
      (translations as { locale: string; title: string | null }[]).find((x) => x.locale === 'en')
      ?? (translations[0] as { title: string | null } | undefined)
    const listing = Array.isArray(row.listing) ? row.listing[0] : row.listing
    const l = (listing as Record<string, unknown> | null) ?? null
    return {
      contentItemId: row.id as string,
      slug: (row.slug as string | null) ?? null,
      title: t?.title ?? null,
      price: l && l.price != null ? Number(l.price) : null,
      currency: (l ? (l.currency as string | null) : null) ?? null,
      listingStatus: (l ? ((l.listing_status as string) ?? 'active') : 'active'),
      contentStatus: row.status as string,
      isFeatured: !!row.is_featured,
      expiresAt: (row.expires_at as string | null) ?? null,
      publishedAt: (row.published_at as string | null) ?? null,
      sellerName: (l ? (l.seller_name as string | null) : null) ?? null,
      contactPhone: (l ? (l.contact_phone as string | null) : null) ?? null,
    }
  })
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
  itemCount: number
}

type RawCategoryAdminRow = {
  id: string
  slug: string
  content_type: string
  sort_order: number
  is_active: boolean
  translations: { locale: string; name: string }[] | { locale: string; name: string } | null
  items: { count: number }[] | { count: number } | null
}

/** Every category with both names + live usage count (service-role read). */
export async function getCategoriesAdmin(): Promise<AdminCategoryRow[]> {
  const { data } = await safe(
    db()
      .from('categories')
      .select(
        'id, slug, content_type, sort_order, is_active, translations:category_translations(locale, name), items:content_items(count)',
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
      itemCount: items?.count ?? 0,
    }
  })
}

export type AdminLocationRow = {
  id: string
  name: string
  slug: string
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
        'id, name, slug, location_type, description, latitude, longitude, is_active, parent_id, items:content_items(count), residents:profiles(count)',
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
 * fundraisers primary key, so the join is one-to-one.
 */
export async function getFundraisersAdmin(limit = 100): Promise<AdminFundraiserRow[]> {
  const { data } = await safe(
    db()
      .from('fundraisers')
      .select(`content_item_id, goal_amount, currency, raised_amount, organizer_name,
        organizer_phone, organizer_email, donation_url, payout_method, payout_account, payout_account_name, verification_notes, closed_at,
        story:content_items(id, slug, type, status, expires_at,
          translations:content_translations(locale, title))`)
      .limit(limit),
  )

  return (data ?? []).map((row) => {
    const story = Array.isArray(row.story) ? row.story[0] : row.story
    const translations = story && Array.isArray(story.translations) ? story.translations : []
    const title =
      (translations as { locale: string; title: string | null }[]).find((t) => t.title)?.title ?? null
    return {
      contentItemId: row.content_item_id,
      slug: story?.slug ?? null,
      storyTitle: title,
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

