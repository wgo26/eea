'use server'

import { getSessionUser } from '@/lib/auth/guards'

export type RatingState = { mine: number | null; average: number | null; count: number }

/**
 * Listing star ratings on the `listing_ratings` table — one 1–5 row per
 * (user, listing), aggregates publicly readable.
 */
export async function getRatingState(contentItemId: string): Promise<RatingState> {
  const { supabase, user } = await getSessionUser()
  const { data } = await supabase
    .from('listing_ratings')
    .select('user_id, stars')
    .eq('content_item_id', contentItemId)
    .limit(1000)
  const rows = (data ?? []) as { user_id: string; stars: number }[]
  const mine = user ? (rows.find((r) => r.user_id === user.id)?.stars ?? null) : null
  const count = rows.length
  const average = count > 0 ? rows.reduce((sum, r) => sum + r.stars, 0) / count : null
  return { mine, average, count }
}

export async function submitRating(
  contentItemId: string,
  stars: number,
): Promise<{ ok: true; state: RatingState } | { ok: false; error: string }> {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return { ok: false, error: 'Pick 1–5 stars.' }
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  const { error } = await supabase.from('listing_ratings').upsert(
    { user_id: user.id, content_item_id: contentItemId, stars },
    { onConflict: 'user_id,content_item_id' },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true, state: await getRatingState(contentItemId) }
}
