import 'server-only'

import type { Locale } from '@/lib/i18n'
import type { ContentType } from '@/lib/auth/roles'
import { db, safe } from './shared'

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
export async function getListingsAdmin(options?: { status?: string; limit?: number; offset?: number; locale?: Locale; search?: string; order?: 'newest' | 'expires' }): Promise<{ rows: AdminListingRow[]; total: number }> {
  const status = options?.status ?? 'all'
  const limit = options?.limit ?? 100
  const offset = options?.offset ?? 0
  const locale = options?.locale ?? 'en'
  const search = options?.search?.trim() ?? ''
  const order = options?.order ?? 'newest'

  const select = `id, slug, status, is_featured, expires_at, published_at,
    translations:content_translations(locale, title),
    listing:listings${status !== 'all' ? '!inner' : ''}(price, currency, listing_status, seller_name, seller_is_verified, contact_phone, contact_email, whatsapp_number)`

  let query = db()
    .from('content_items')
    .select(select, { count: 'exact' })
    .eq('type', 'listing')
    .order(order === 'expires' ? 'expires_at' : 'published_at', { ascending: order === 'expires', nullsFirst: false })
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
export async function getCategoriesAdmin(search?: string): Promise<AdminCategoryRow[]> {
  const term = search?.trim() ?? ''
  const { data } = await safe(
    (() => {
      let query = db()
        .from('categories')
        .select(
          'id, slug, content_type, sort_order, is_active, translations:category_translations(locale, name, description), items:content_items(count)',
        )
        .order('content_type', { ascending: true })
        .order('sort_order', { ascending: true })
      if (term) query = query.or(`slug.ilike.%${term}%,name.ilike.%${term}%`)
      return query
    })(),
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
  locationTypeId: string | null
  locationTypeName: string | null
  description: string | null
  latitude: number | null
  longitude: number | null
  isActive: boolean
  parentId: string | null
  parentName: string | null
  depth: number
  altNames: string[] | null
  isFeatured: boolean
  contentCount: number
  profileCount: number
}

type RawLocationAdminRow = {
  id: string
  name: string
  slug: string
  locale: string | null
  location_type: string | null
  location_type_id: string | null
  location_type_name: string | null
  description: string | null
  latitude: number | string | null
  longitude: number | string | null
  is_active: boolean
  parent_id: string | null
  depth: number
  alt_names: string[] | null
  is_featured: boolean
  items: { count: number }[] | { count: number } | null
  residents: { count: number }[] | { count: number } | null
}

/** Every location with parent + live usage counts (service-role read). */
export async function getLocationsAdmin(search?: string): Promise<AdminLocationRow[]> {
  const term = search?.trim() ?? ''
  const { data } = await safe(
    (() => {
      let query = db()
        .from('locations')
        .select(
          'id, name, slug, locale, location_type, location_type_id, description, latitude, longitude, is_active, parent_id, depth, alt_names, is_featured, location_types(name_en), items:content_items(count), residents:profiles(count)',
        )
        .order('name', { ascending: true })
      if (term) query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%,description.ilike.%${term}%`)
      return query
    })(),
  )
  const rows = (data ?? []) as RawLocationAdminRow[]
  // Parent names via a second id→name pass (no self-join FK-hint dependence).
  const nameById = new Map(rows.map((r) => [r.id, r.name] as const))
  return rows.map((row) => {
    const items = Array.isArray(row.items) ? row.items[0] : row.items
    const residents = Array.isArray(row.residents) ? row.residents[0] : row.residents
    const locType = Array.isArray(row.location_types) ? row.location_types[0] : row.location_types
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      locale: row.locale ?? null,
      locationType: row.location_type,
      locationTypeId: row.location_type_id ?? null,
      locationTypeName: locType?.name_en ?? null,
      description: row.description,
      latitude: row.latitude === null ? null : Number(row.latitude),
      longitude: row.longitude === null ? null : Number(row.longitude),
      isActive: row.is_active,
      parentId: row.parent_id,
      parentName: row.parent_id ? (nameById.get(row.parent_id) ?? null) : null,
      depth: row.depth ?? 0,
      altNames: row.alt_names ?? null,
      isFeatured: row.is_featured ?? false,
      contentCount: items?.count ?? 0,
      profileCount: residents?.count ?? 0,
    }
  })
}

/** Location types (tier registry) for admin dropdowns. */
export type AdminLocationType = {
  id: string
  slug: string
  nameEn: string
  nameFr: string
  icon: string | null
  color: string | null
  sortOrder: number
}

export async function getLocationTypesAdmin(): Promise<AdminLocationType[]> {
  const { data } = await safe(
    db()
      .from('location_types')
      .select('id, slug, name_en, name_fr, icon, color, sort_order')
      .order('sort_order', { ascending: true })
      .order('name_en', { ascending: true }),
  )
  return ((data ?? []) as Array<{
    id: string
    slug: string
    name_en: string
    name_fr: string
    icon: string | null
    color: string | null
    sort_order: number
  }>).map((r) => ({
    id: r.id,
    slug: r.slug,
    nameEn: r.name_en,
    nameFr: r.name_fr,
    icon: r.icon,
    color: r.color,
    sortOrder: r.sort_order,
  }))
}

/** Location tags for admin tag manager. */
export type AdminLocationTag = {
  id: string
  slug: string
  nameEn: string
  nameFr: string
  color: string | null
}

export async function getLocationTagsAdmin(): Promise<AdminLocationTag[]> {
  const { data } = await safe(
    db()
      .from('location_tags')
      .select('id, slug, name_en, name_fr, color')
      .order('name_en', { ascending: true }),
  )
  return ((data ?? []) as Array<{
    id: string
    slug: string
    name_en: string
    name_fr: string
    color: string | null
  }>).map((r) => ({
    id: r.id,
    slug: r.slug,
    nameEn: r.name_en,
    nameFr: r.name_fr,
    color: r.color,
  }))
}

/** Tags currently assigned to a location (ids). */
export async function getLocationTagIds(locationId: string): Promise<string[]> {
  const { data } = await safe(
    db()
      .from('location_taggings')
      .select('tag_id')
      .eq('location_id', locationId),
  )
  return ((data ?? []) as Array<{ tag_id: string }>).map((r) => r.tag_id)
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

/** Paginated page of polls (active and closed) with per-option tallies, newest first. */
export async function getPollsAdmin(options?: {
  search?: string
  limit?: number
  offset?: number
}): Promise<{ rows: AdminPollRow[]; total: number }> {
  const search = options?.search?.trim() ?? ''
  const limit = options?.limit ?? 20
  const offset = options?.offset ?? 0
  // poll_results is a view with no FK metadata, so PostgREST cannot embed it
  // through poll_options — read the tallies separately and merge, mirroring
  // getActivePolls in lib/queries/polls.ts.
  const [pollsRes, talliesRes] = await Promise.all([
    safe(
      (() => {
        let query = db()
          .from('polls')
          .select('id, slug, question, locale, is_active, closes_at, created_at, content_item_id, poll_options(id, label, sort_order)', { count: 'exact' })
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1)
        if (search) query = query.ilike('question', `%${search}%`)
        return query
      })(),
    ),
    safe(db().from('poll_results').select('option_id, votes')),
  ])

  const tallies = new Map<string, number>()
  for (const r of (talliesRes.data ?? []) as { option_id: string; votes: number | null }[]) {
    tallies.set(r.option_id, Number(r.votes ?? 0))
  }

  const rows = ((pollsRes.data ?? []) as {
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
  return { rows, total: pollsRes.count ?? rows.length }
}

