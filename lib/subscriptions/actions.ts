'use server'

import { getSessionUser } from '@/lib/auth/guards'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail, sendWhatsAppProactive } from '@/lib/notify/channels'

/**
 * Phase 5 — user location subscriptions.
 *
 * Members subscribe to places (continent, country, region, division, city,
 * town, quarter, landmark). Subscriptions are independent of content_follows
 * (which is topic-based). Subscriptions drive the followed-places digest
 * rail and personalized "near you" briefs.
 *
 * RLS: users can only manage their own rows (user_id = auth.uid()).
 */

export type LocationSubscription = {
  userId: string
  locationId: string
  locationSlug: string
  locationName: string
  locationDepth: number
  locationTypeName: string | null
  createdAt: string
}

export async function getUserLocationSubscriptions(): Promise<LocationSubscription[]> {
  const { supabase, user } = await getSessionUser()
  if (!user) return []

  const { data } = await supabase
    .from('user_location_subscriptions')
    .select(
      `user_id, location_id, created_at,
       locations!inner(id, slug, name, depth, location_type_id, location_types(name_en))`,
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)

  const rows = ((data ?? []) as Array<{
    user_id: string
    location_id: string
    created_at: string
    locations: {
      id: string
      slug: string | null
      name: string | null
      depth: number | null
      location_type_id: string | null
      location_types: { name_en: string | null } | null
    } | null
  }>)

  return rows.map((r) => {
    const loc = r.locations!
    const locType = Array.isArray(loc.location_types) ? loc.location_types[0] : loc.location_types
    return {
      userId: r.user_id,
      locationId: r.location_id,
      locationSlug: loc.slug ?? '',
      locationName: loc.name ?? '',
      locationDepth: loc.depth ?? 0,
      locationTypeName: locType?.name_en ?? null,
      createdAt: r.created_at,
    }
  })
}

export async function subscribeToLocation(
  locationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  if (!locationId || typeof locationId !== 'string') {
    return { ok: false, error: 'Invalid location.' }
  }

  const limited = await checkRateLimit('subscriptions:subscribe', {
    max: 20,
    windowMs: 60 * 60_000,
    policy: 'fail-closed',
  })
  if (!limited.ok) return { ok: false, error: 'Too many requests. Please try again later.' }

  // Verify the location exists and is active.
  const { data: loc } = await supabase
    .from('locations')
    .select('id, is_active')
    .eq('id', locationId)
    .eq('is_active', true)
    .limit(1)
  if (!loc?.length) return { ok: false, error: 'Location not found or inactive.' }

  const { error } = await supabase.from('user_location_subscriptions').insert({
    user_id: user.id,
    location_id: locationId,
  })
  if (error) return { ok: false, error: error.message }

  return { ok: true }
}

export async function unsubscribeFromLocation(
  locationId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  if (!locationId || typeof locationId !== 'string') {
    return { ok: false, error: 'Invalid location.' }
  }

  const { error } = await supabase
    .from('user_location_subscriptions')
    .delete()
    .eq('user_id', user.id)
    .eq('location_id', locationId)
  if (error) return { ok: false, error: error.message }

  return { ok: true }
}

/** Digest query: published content from all subscribed places (and descendants),
 * newest first. Used by the followed-places digest rail. */
export type SubscribedPlaceContent = {
  id: string
  type: string
  title: string
  href: string
  imageUrl: string | null
  publishedAt: string | null
  locationSlug: string
  locationName: string
}

export async function getSubscribedPlaceContent(
  locale: 'en' | 'fr' = 'en',
  limit = 40,
): Promise<SubscribedPlaceContent[]> {
  const { supabase, user } = await getSessionUser()
  if (!user) return []

  // Resolve subscribed location ids (self + descendants via path containment)
  const { data: subs } = await supabase
    .from('user_location_subscriptions')
    .select('location_id')
    .eq('user_id', user.id)
  const locationIds = ((subs ?? []) as { location_id: string }[]).map((r) => r.location_id)
  if (locationIds.length === 0) return []

  // For each subscribed location, find all descendants (path contains the location id)
  // then fetch content for those locations. We do this in two queries to stay
  // within PostgREST capabilities.
  const { data: allLocs } = await supabase
    .from('locations')
    .select('id, parent_id, path')
  const allLocations = (allLocs ?? []) as { id: string; parent_id: string | null; path: string[] | null }[]

  // Build the set of relevant location ids: subscribed + all descendants
  const relevantIds = new Set<string>(locationIds)
  for (const loc of allLocations) {
    const path = loc.path ?? []
    for (const pid of path) {
      if (locationIds.includes(pid)) {
        relevantIds.add(loc.id)
        break
      }
    }
  }

  const idArray = [...relevantIds]

  const { data } = await supabase
    .from('content_items')
    .select(
      `id, type, slug, published_at,
       location:locations!inner(slug, name),
       category:categories(category_translations(locale, name)),
       translations:content_translations(locale, title),
       media:media_assets(public_url, is_cover, kind, mime_type)`,
    )
    .in('location_id', idArray)
    .eq('status', 'published')
    .eq('is_archived', false)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(limit)

  const rows = (data ?? []) as Array<{
    id: string
    type: string
    slug: string | null
    published_at: string | null
    location: { slug: string | null; name: string | null } | null
    category: { category_translations: { locale: string; name: string }[] } | null
    translations: { locale: string; title: string }[] | null
    media: { public_url: string | null; is_cover: boolean | null; kind: string | null; mime_type: string | null }[] | null
  }>

  return rows.map((row) => {
    const translation = row.translations?.find((t) => t.locale === locale)
    const loc = row.location
    return {
      id: row.id,
      type: row.type,
      title: translation?.title ?? '',
      href: `/${locale}/${row.type === 'listing' ? 'buy-sell' : row.type}/${row.slug ?? row.id}`,
      imageUrl: row.media?.[0]?.public_url ?? null,
      publishedAt: row.published_at ?? null,
      locationSlug: loc?.slug ?? '',
      locationName: loc?.name ?? '',
    }
  })
}

/* ============================================================================
   Phase 5 — Digest delivery for subscribed places
   ============================================================================ */

type SubscriptionRecipient = {
  userId: string
  email: string | null
  phone: string | null
  whatsapp: string | null
  locale: string | null
  locationIds: string[]
}

type SubscriptionContent = {
  userId: string
  storiesByLocale: Partial<Record<'en' | 'fr', import('@/lib/digest/brief').BriefStory[]>>
}

/** All users with location subscriptions, with their contact info and subscribed place ids. */
export async function getSubscriptionRecipients(): Promise<SubscriptionRecipient[]> {
  const supabase = createAdminClient()
  const { data: subs } = await supabase
    .from('user_location_subscriptions')
    .select('user_id, location_id')
  const rows = ((subs ?? []) as { user_id: string; location_id: string }[])
  if (rows.length === 0) return []

  const userIds = [...new Set(rows.map((r) => r.user_id))]
  const subsByUser = new Map<string, string[]>()
  for (const r of rows) {
    const list = subsByUser.get(r.user_id) ?? []
    list.push(r.location_id)
    subsByUser.set(r.user_id, list)
  }

  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, phone, whatsapp, preferred_locale')
    .in('id', userIds)
  const profileById = new Map(((profiles ?? []) as Array<{
    id: string
    email: string | null
    phone: string | null
    whatsapp: string | null
    preferred_locale: string | null
  }>).map((p) => [p.id, p]))

  return userIds.map((userId) => {
    const profile = profileById.get(userId)
    return {
      userId,
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      whatsapp: profile?.whatsapp ?? null,
      locale: profile?.preferred_locale ?? null,
      locationIds: subsByUser.get(userId) ?? [],
    }
  })
}

/** Published content (as BriefStory) for one user's subscribed places + descendants. */
export async function getSubscriptionContent(
  userId: string,
  locationIds: string[],
  locale: 'en' | 'fr' = 'en',
  limit = 40,
): Promise<SubscriptionContent> {
  const supabase = createAdminClient()

  // Resolve all descendant location ids for each subscribed location
  const { data: allLocs } = await supabase
    .from('locations')
    .select('id, path')
  const allLocations = (allLocs ?? []) as { id: string; path: string[] | null }[]

  const relevantIds = new Set<string>(locationIds)
  for (const loc of allLocations) {
    const path = loc.path ?? []
    for (const pid of path) {
      if (locationIds.includes(pid)) {
        relevantIds.add(loc.id)
        break
      }
    }
  }

  const idArray = [...relevantIds]
  if (idArray.length === 0) {
    return { userId, storiesByLocale: {} }
  }

  const { data } = await supabase
    .from('content_items')
    .select(
      `id, type, slug, published_at,
       location:locations!inner(slug, name),
       category:categories(category_translations(locale, name)),
       translations:content_translations(locale, title),
       media:media_assets(public_url, is_cover, kind, mime_type)`,
    )
    .in('location_id', idArray)
    .eq('status', 'published')
    .eq('is_archived', false)
    .not('published_at', 'is', null)
    .order('published_at', { ascending: false })
    .limit(limit)

  const rows = (data ?? []) as Array<{
    id: string
    type: string
    slug: string | null
    published_at: string | null
    location: { slug: string | null; name: string | null } | null
    category: { category_translations: { locale: string; name: string }[] } | null
    translations: { locale: string; title: string }[] | null
    media: { public_url: string | null; is_cover: boolean | null; kind: string | null; mime_type: string | null }[] | null
  }>

  const stories = rows.map((row) => {
    const translation = row.translations?.find((t) => t.locale === locale)
    return {
      title: translation?.title ?? '',
      type: row.type,
      path: `/${locale}/${row.type === 'listing' ? 'buy-sell' : row.type}/${row.slug ?? row.id}`,
      shareText: null,
      contentItemId: row.id,
      locationId: row.location?.slug ?? null,
    }
  })

  return {
    userId,
    storiesByLocale: { [locale]: stories },
  }
}

/**
 * Send personalized subscription digests to all subscribed members.
 * Each member gets content from their subscribed places (and descendants).
 * Never archived — personal variants belong to the recipient.
 */
export async function sendSubscriptionDigests(
  dateLabel: string,
  sentOn: string,
  cadence: 'daily' | 'weekly' = 'daily',
): Promise<{ sent: number; considered: number; skipped: number }> {
  const { deliverDigest } = await import('@/lib/digest/deliver')
  const { buildDailyBrief, groupBriefStories } = await import('@/lib/digest/brief')
  const { SITE } = await import('@/lib/constants')

  const result = { sent: 0, considered: 0, skipped: 0 }
  const recipients = await getSubscriptionRecipients()
  if (recipients.length === 0) return result

  const SUBJECT: Record<'en' | 'fr', string> = {
    en: 'Eagle Eye Africa — places you follow',
    fr: 'Eagle Eye Africa — les lieux que vous suivez',
  }

  for (const recipient of recipients) {
    const locale: 'en' | 'fr' = /^fr/i.test(recipient.locale ?? '') ? 'fr' : 'en'
    const content = await getSubscriptionContent(recipient.userId, recipient.locationIds, locale)
    const stories = content.storiesByLocale[locale] ?? []
    if (stories.length < 2) continue // one-story brief is noise the site-wide digest covers

    result.considered += 1

    const sections = groupBriefStories(stories)
    const { title, body } = buildDailyBrief(sections, {
      locale,
      dateLabel,
      siteUrl: SITE.url,
      digestPath: `/${locale}/digest`,
      framing: 'standard',
      subject: SUBJECT[locale],
    })

    const phone = recipient.whatsapp ?? recipient.phone
    if (recipient.email && /^\S+@\S+\.\S+$/.test(recipient.email)) {
      const res = await sendEmail(recipient.email, title, title, body, `${SITE.url}/${locale}/digest`)
      if (res.delivered) result.sent += 1
      else result.skipped += 1
    }
    if (phone) {
      const res = await sendWhatsAppProactive(phone, `${title}\n${body}`, recipient.locale)
      if (res.delivered) result.sent += 1
      else result.skipped += 1
    }
  }
  return result
}

