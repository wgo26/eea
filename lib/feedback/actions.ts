'use server'

import { getSessionUser } from '@/lib/auth/guards'

export type FeedbackState = {
  mine: boolean | null
  helpful: number
  notHelpful: number
}

/**
 * "Was this helpful?" votes on the `content_feedback` table — one row per
 * (user, content item), counts publicly readable. Guests get the counts
 * with `mine: null` (voting needs an account, enforced by RLS + here).
 */
export async function getFeedbackState(contentItemId: string): Promise<FeedbackState> {
  const { supabase, user } = await getSessionUser()
  const { data } = await supabase
    .from('content_feedback')
    .select('user_id, helpful')
    .eq('content_item_id', contentItemId)
    .limit(1000)
  const rows = (data ?? []) as { user_id: string; helpful: boolean }[]
  return {
    mine: user ? (rows.find((r) => r.user_id === user.id)?.helpful ?? null) : null,
    helpful: rows.filter((r) => r.helpful).length,
    notHelpful: rows.filter((r) => !r.helpful).length,
  }
}

export async function submitFeedback(
  contentItemId: string,
  helpful: boolean,
): Promise<{ ok: true; state: FeedbackState } | { ok: false; error: string }> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  const { error } = await supabase.from('content_feedback').upsert(
    { user_id: user.id, content_item_id: contentItemId, helpful },
    { onConflict: 'user_id,content_item_id' },
  )
  if (error) return { ok: false, error: error.message }
  return { ok: true, state: await getFeedbackState(contentItemId) }
}
