import 'server-only'

import { isRole } from '@/lib/auth/roles'
import { AppRole, db, hasDatabase, safe } from './shared'

/* ------------------------------------------------------------------ */
/* Users                                                              */
/* ------------------------------------------------------------------ */

export type UserRow = {
  id: string
  displayName: string | null
  fullName: string | null
  bio: string | null
  email: string | null
  phone: string | null
  avatarUrl: string | null
  isVerified: boolean
  isPublic: boolean
  isSuspended: boolean
  isBanned: boolean
  contributorFeatured: boolean
  contributorBioOverride: string | null
  contributorHandle: string | null
  locationId: string | null
  locationName: string | null
  preferredLocale: string
  preferredVoice: string
  roles: AppRole[]
  createdAt: string | null
  updatedAt: string | null
}

const USER_SELECT = `id, display_name, full_name, bio, email, phone, avatar_url, is_verified, is_public, is_suspended, is_banned, contributor_featured, contributor_bio_override, contributor_handle, location_id, preferred_locale, preferred_voice, created_at, updated_at,
      location:locations(name),
      roles:user_roles(role)`

function mapUserRow(row: Record<string, unknown>): UserRow {
  const roles = Array.isArray(row.roles) ? row.roles : row.roles ? [row.roles] : []
  const location = Array.isArray(row.location) ? row.location[0] : row.location
  return {
    id: row.id as string,
    displayName: row.display_name as string | null,
    fullName: row.full_name as string | null,
    bio: (row.bio as string | null) ?? null,
    email: row.email as string | null,
    phone: row.phone as string | null,
    avatarUrl: row.avatar_url as string | null,
    isVerified: !!row.is_verified,
    isPublic: !!row.is_public,
    isSuspended: !!row.is_suspended,
    isBanned: !!row.is_banned,
    contributorFeatured: !!row.contributor_featured,
    contributorBioOverride: row.contributor_bio_override as string | null,
    contributorHandle: (row.contributor_handle as string | null) ?? null,
    locationId: (row.location_id as string | null) ?? null,
    locationName: (location as { name: string } | undefined)?.name ?? null,
    preferredLocale: (row.preferred_locale as string | null) ?? 'en',
    preferredVoice: (row.preferred_voice as string | null) ?? 'formal',
    roles: (roles as { role: string }[]).map((r) => r.role).filter(isRole),
    createdAt: row.created_at as string | null,
    updatedAt: (row.updated_at as string | null) ?? null,
  }
}

/** Shared profile-completeness score (0-100) used by admin + account UIs. */
export function profileCompleteness(u: Pick<UserRow, 'displayName' | 'fullName' | 'bio' | 'avatarUrl' | 'phone' | 'locationName' | 'locationId'>): number {
  let score = 0
  if (u.displayName?.trim() || u.fullName?.trim()) score += 25
  if (u.bio?.trim()) score += 20
  if (u.avatarUrl?.trim()) score += 20
  if (u.phone?.trim()) score += 15
  if (u.locationName?.trim() || u.locationId?.trim()) score += 20
  return Math.min(100, score)
}

export async function getUsers(options?: { search?: string; role?: AppRole | 'all'; status?: 'all' | 'active' | 'suspended' | 'banned'; verified?: 'all' | 'verified' | 'unverified'; limit?: number; page?: number }): Promise<{ rows: UserRow[]; total: number }> {
  if (!hasDatabase()) return { rows: [], total: 0 }
  const search = options?.search?.trim()
  const role = options?.role ?? 'all'
  const limit = options?.limit ?? 50
  const page = options?.page ?? 1
  const offset = (page - 1) * limit

  let query = db()
    .from('profiles')
    .select(USER_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (search) query = query.or(`display_name.ilike.%${search}%,full_name.ilike.%${search}%,email.ilike.%${search}%,bio.ilike.%${search}%`)
  if (role !== 'all') query = query.eq('roles.role', role)
  if (options?.status === 'suspended') query = query.eq('is_suspended', true)
  if (options?.status === 'banned') query = query.eq('is_banned', true)
  if (options?.status === 'active') query = query.eq('is_suspended', false).eq('is_banned', false)
  if (options?.verified === 'verified') query = query.eq('is_verified', true)
  if (options?.verified === 'unverified') query = query.eq('is_verified', false)

  const { data, count } = await safe(query)
  const rows = ((data ?? []) as unknown as Record<string, unknown>[]).map(mapUserRow)
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
  if (!hasDatabase()) return null
  const profileRes = await safe(
    db()
      .from('profiles')
      .select(USER_SELECT)
      .eq('id', userId)
      .maybeSingle(),
  )
  const profile = profileRes.data as Record<string, unknown> | null
  if (!profile) return null

  const user = mapUserRow(profile)

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
  placement: string | null
  dimensions: string | null
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

export async function getAdSlots(options?: {
  search?: string
  limit?: number
  offset?: number
}): Promise<{ rows: AdSlotRow[]; total: number }> {
  if (!hasDatabase()) return { rows: [], total: 0 }
  const search = options?.search?.trim() ?? ''
  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0
  const res = await safe(
    (() => {
      let query = db()
        .from('ad_slots')
        .select(`id, slot_key, name, placement, dimensions, mobile_dimensions, allowed_formats, max_duration_seconds, capacity, base_price, currency, is_active,
        campaigns:ad_campaigns(id, name, status, destination_url, copy_text, starts_at, ends_at, agreed_price, currency, payment_status,
          creative_type, creative_status, creative_rejection_reason, creative_html, creative_width, creative_height,
          budget_limit, impression_limit, click_limit, invoice_reference,
          creative:media_assets!ad_campaigns_creative_media_id_fkey(public_url, duration_seconds),
          mobile_creative:media_assets!ad_campaigns_mobile_creative_media_id_fkey(public_url, duration_seconds),
          poster:media_assets!ad_campaigns_poster_media_id_fkey(public_url),
          advertiser:advertisers(company_name),
          events:ad_events(id, event_type))`, { count: 'exact' })
        .order('slot_key', { ascending: true })
        .range(offset, offset + limit - 1)
      if (search) query = query.or(`name.ilike.%${search}%,slot_key.ilike.%${search}%,placement.ilike.%${search}%`)
      return query
    })(),
  )
  const data = res.data
  const total = res.count ?? (data ?? []).length
  const rows = (data ?? []).map((row) => {
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
  return { rows, total }
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

export type AdvertiserRow = {
  id: string
  companyName: string | null
  contactName: string | null
  email: string | null
  phone: string | null
  totalCampaigns: number
  activeCampaigns: number
}

export async function getAdvertisers(options?: {
  search?: string
  limit?: number
  offset?: number
}): Promise<{ rows: AdvertiserRow[]; total: number }> {
  if (!hasDatabase()) return { rows: [], total: 0 }
  const search = options?.search?.trim() ?? ''
  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0
  const res = await safe(
    (() => {
      let query = db()
        .from('advertisers')
        .select(`id, company_name, contact_name, email, phone,
        campaigns:ad_campaigns(id, status)`, { count: 'exact' })
        .order('company_name', { ascending: true })
        .range(offset, offset + limit - 1)
      if (search) query = query.or(`company_name.ilike.%${search}%,contact_name.ilike.%${search}%,email.ilike.%${search}%`)
      return query
    })(),
  )
  const data = res.data
  const rows = (data ?? []).map((row) => {
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
  return { rows, total: res.count ?? rows.length }
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

export async function getPendingAdInquiries(options?: {
  search?: string
  limit?: number
  offset?: number
}): Promise<{ rows: AdInquiryRow[]; total: number }> {
  if (!hasDatabase()) return { rows: [], total: 0 }
  const search = options?.search?.trim() ?? ''
  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0
  const res = await safe(
    (() => {
      let query = db()
        .from('ad_campaigns')
        .select(`id, name, copy_text, created_at,
      advertiser:advertisers(company_name, email, phone)`, { count: 'exact' })
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
      if (search) query = query.or(`name.ilike.%${search}%,copy_text.ilike.%${search}%`)
      return query
    })(),
  )
  const rows = ((res.data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
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
  return { rows, total: res.count ?? rows.length }
}

/** Paginated page of campaigns (not only slotted/active ones) for the full campaigns list. */
export async function getCampaigns(options?: {
  search?: string
  status?: string
  limit?: number
  offset?: number
}): Promise<{ rows: AdCampaignRow[]; total: number }> {
  if (!hasDatabase()) return { rows: [], total: 0 }
  const search = options?.search?.trim() ?? ''
  const status = options?.status ?? 'all'
  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0
  const res = await safe(
    (() => {
      let query = db()
        .from('ad_campaigns')
        .select(`id, name, status, destination_url, copy_text, starts_at, ends_at, agreed_price, currency, payment_status,
        creative_type, creative_status, creative_rejection_reason, creative_html, creative_width, creative_height,
        budget_limit, impression_limit, click_limit, invoice_reference,
        creative:media_assets!ad_campaigns_creative_media_id_fkey(public_url, duration_seconds),
        mobile_creative:media_assets!ad_campaigns_mobile_creative_media_id_fkey(public_url, duration_seconds),
        poster:media_assets!ad_campaigns_poster_media_id_fkey(public_url),
        advertiser:advertisers(company_name),
        slot:ad_slots(id, name),
        events:ad_events(event_type)`, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)
      if (status !== 'all') query = query.eq('status', status)
      if (search) query = query.or(`name.ilike.%${search}%,copy_text.ilike.%${search}%,invoice_reference.ilike.%${search}%`)
      return query
    })(),
  )
  const rows = ((res.data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
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
  return { rows, total: res.count ?? rows.length }
}

