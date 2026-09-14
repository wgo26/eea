'use server'

import { getSessionUser } from '@/lib/auth/guards'

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
