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
  category:categories:category_id(category_translations(locale, name)),
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
  locationName: string | null
  roles: AppRole[]
  createdAt: string | null
}

export async function getUsers(options?: { search?: string; role?: AppRole | 'all'; limit?: number }): Promise<UserRow[]> {
  const search = options?.search?.trim()
  const role = options?.role ?? 'all'
  const limit = options?.limit ?? 50

  let query = db()
    .from('profiles')
    .select(`id, display_name, full_name, email, phone, avatar_url, is_verified, is_public, created_at,
      location:locations(name),
      roles:user_roles(role)`)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (search) query = query.or(`display_name.ilike.%${search}%,full_name.ilike.%${search}%,email.ilike.%${search}%`)
  if (role !== 'all') query = query.eq('roles.role', role)

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
        organizer_phone, organizer_email, donation_url, verification_notes, closed_at,
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
      verificationNotes: row.verification_notes,
      closedAt: row.closed_at,
      deadlineAt: story?.expires_at ?? null,
    }
  })
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

