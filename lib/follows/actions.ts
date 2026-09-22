'use server'

import { getSessionUser } from '@/lib/auth/guards'
import { checkRateLimit } from '@/lib/security/rate-limit'

export type FollowState = { following: boolean; followers: number }

/**
 * Contributor follows on the `contributor_follows` table (one row per
 * follower→contributor pair; follower counts publicly readable).
 */
export async function getFollowState(contributorId: string): Promise<FollowState> {
  const { supabase, user } = await getSessionUser()
  const { data, count } = await supabase
    .from('contributor_follows')
    .select('follower_id', { count: 'exact' })
    .eq('contributor_id', contributorId)
    .limit(1000)
  const rows = (data ?? []) as { follower_id: string }[]
  return {
    following: user ? rows.some((r) => r.follower_id === user.id) : false,
    followers: count ?? rows.length,
  }
}

export async function toggleFollow(
  contributorId: string,
): Promise<{ ok: true; following: boolean; followers: number } | { ok: false; error: string }> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  if (user.id === contributorId) return { ok: false, error: 'You cannot follow yourself.' }
  const { data: existing } = await supabase
    .from('contributor_follows')
    .select('contributor_id')
    .eq('follower_id', user.id)
    .eq('contributor_id', contributorId)
    .limit(1)
  const isFollowing = (existing?.length ?? 0) > 0
  const { error } = isFollowing
    ? await supabase.from('contributor_follows').delete().eq('follower_id', user.id).eq('contributor_id', contributorId)
    : await supabase.from('contributor_follows').insert({ follower_id: user.id, contributor_id: contributorId })
  if (error) return { ok: false, error: error.message }
  const state = await getFollowState(contributorId)
  return { ok: true, following: state.following, followers: state.followers }
}

export type ContentFollowKind = 'place' | 'category'

export type ContentFollowState = { following: boolean; followers: number }

/**
 * Phase 3 — place & category follows on the `content_follows` table
 * (user_id + content_type + category_id + location_id; RLS "Own content
 * follows" keeps rows private to their owner + staff).
 *
 * A place follow is (content_type='notice', location_id) — notices are the
 * location-anchored heartbeat; a category follow is
 * (content_type, category_id). Digest filtering by follows is a deliberate
 * follow-up (documented, not silent): today follows drive the hub buttons
 * and the /account/follows manager.
 */
function followRow(kind: ContentFollowKind, id: string) {
  return kind === 'place'
    ? { content_type: 'notice', category_id: null as unknown as string, location_id: id }
    : { content_type: 'photo_story', category_id: id, location_id: null as unknown as string };
}

export async function getContentFollowState(
  kind: ContentFollowKind,
  id: string,
): Promise<ContentFollowState> {
  const { supabase, user } = await getSessionUser()
  const row = followRow(kind, id)
  const match = supabase.from('content_follows').select('user_id', { count: 'exact' })
  if (row.location_id) match.eq('location_id', row.location_id)
  if (row.category_id) match.eq('category_id', row.category_id)
  const { data, count } = await match.limit(1000)
  const rows = (data ?? []) as { user_id: string }[]
  return {
    following: user ? rows.some((r) => r.user_id === user.id) : false,
    followers: count ?? rows.length,
  }
}

export async function toggleContentFollow(
  kind: ContentFollowKind,
  id: string,
): Promise<{ ok: true; following: boolean; followers: number } | { ok: false; error: string }> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  if (!id || typeof id !== 'string') return { ok: false, error: 'Invalid follow target.' }
  const limited = await checkRateLimit('follows:toggle', { max: 30, windowMs: 60 * 60_000, policy: 'fail-closed' })
  if (!limited.ok) return { ok: false, error: 'Too many requests. Please try again later.' }
  const row = followRow(kind, id.trim().slice(0, 80))
  let existingQuery = supabase.from('content_follows').select('user_id').eq('user_id', user.id)
  if (row.location_id) existingQuery = existingQuery.eq('location_id', row.location_id)
  if (row.category_id) existingQuery = existingQuery.eq('category_id', row.category_id)
  const { data: existing } = await existingQuery.limit(1)
  const isFollowing = ((existing as unknown[])?.length ?? 0) > 0
  if (isFollowing) {
    let del = supabase.from('content_follows').delete().eq('user_id', user.id)
    if (row.location_id) del = del.eq('location_id', row.location_id)
    if (row.category_id) del = del.eq('category_id', row.category_id)
    const { error } = await del
    if (error) return { ok: false, error: error.message }
  } else {
    const { error } = await supabase.from('content_follows').insert({ user_id: user.id, ...row })
    if (error) return { ok: false, error: error.message }
  }
  const state = await getContentFollowState(kind, id)
  return { ok: true, following: state.following, followers: state.followers }
}

export type OwnFollow = {
  kind: ContentFollowKind;
  locationId: string | null;
  locationSlug: string | null;
  categoryId: string | null;
  locationName: string | null;
  categoryName: string | null;
  createdAt: string | null;
};

/** Own follows with resolved place/category names for /account/follows. */
export async function getOwnContentFollows(): Promise<OwnFollow[]> {
  const { supabase, user } = await getSessionUser()
  if (!user) return []
  const { data } = await supabase
    .from('content_follows')
    .select('content_type, category_id, location_id, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)
  const rows = ((data ?? []) as { content_type: string; category_id: string | null; location_id: string | null; created_at: string | null }[])
  const locationIds = [...new Set(rows.map((r) => r.location_id).filter(Boolean) as string[])]
  const categoryIds = [...new Set(rows.map((r) => r.category_id).filter(Boolean) as string[])]
  const [locRes, catRes] = await Promise.all([
    locationIds.length > 0
      ? supabase.from('locations').select('id, slug, name').in('id', locationIds)
      : Promise.resolve({ data: [] as { id: string; slug: string | null; name: string | null }[] }),
    categoryIds.length > 0
      ? supabase.from('categories').select('id, category_translations(locale, name)').in('id', categoryIds)
      : Promise.resolve({ data: [] as unknown[] }),
  ])
  const locRows = ((locRes.data ?? []) as { id: string; slug: string | null; name: string | null }[])
  const locNames = new Map(locRows.map((l) => [l.id, l.name]))
  const locSlugs = new Map(locRows.map((l) => [l.id, l.slug]))
  const catNames = new Map(
    ((catRes.data ?? []) as { id: string; category_translations: { locale: string; name: string }[] | { locale: string; name: string } }[]).map((c) => {
      const tr = Array.isArray(c.category_translations) ? c.category_translations[0] : c.category_translations
      return [c.id, tr?.name ?? null]
    }),
  )
  return rows.map((r) => ({
    kind: r.location_id ? 'place' : 'category',
    locationId: r.location_id,
    locationSlug: r.location_id ? (locSlugs.get(r.location_id) ?? null) : null,
    categoryId: r.category_id,
    locationName: r.location_id ? (locNames.get(r.location_id) ?? null) : null,
    categoryName: r.category_id ? (catNames.get(r.category_id) ?? null) : null,
    createdAt: r.created_at,
  }))
}
