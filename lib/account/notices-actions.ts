'use server'

import { revalidatePath } from 'next/cache'
import { getSessionUser } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/observability/logger'

type Result = { ok: true } | { ok: false; error: string }

function fail(e: unknown): Result {
  return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
}

/**
 * Notice owner self-manage (parity with listings-actions): ownership verified
 * in code on the service-role client. Renewal extends BOTH expiry clocks —
 * `notices.expiry_date` (the lifecycle source of truth the public pages
 * derive status from) and `content_items.expires_at` (the sweep/RLS clock) —
 * so the two can never disagree about whether a notice is live.
 */
async function ownNotice(
  contentItemId: string,
): Promise<
  | { supabase: ReturnType<typeof createAdminClient>; userId: string; itemId: string }
  | { error: string }
> {
  const { user } = await getSessionUser()
  if (!user) return { error: 'Authentication required.' as const }
  const supabase = createAdminClient()
  const { data: item, error } = await supabase
    .from('content_items')
    .select('id, type, status, submitted_by, author_id')
    .eq('id', contentItemId)
    .maybeSingle()
  if (error || !item) return { error: 'Notice not found.' as const }
  const row = item as { id: string; type: string; status: string; submitted_by: string | null; author_id: string | null }
  if (row.type !== 'notice') return { error: 'This content item is not a notice.' as const }
  if (row.submitted_by !== user.id && row.author_id !== user.id) {
    logger.warn('notices-owner', 'ownership denied', { clientUser: user.id })
    return { error: 'This notice is not yours.' as const }
  }
  return { supabase, userId: user.id, itemId: row.id }
}

/** Owner renews an expired (or expiring) notice for 30 more days. */
export async function renewOwnNotice(contentItemId: string): Promise<Result> {
  try {
    const own = await ownNotice(contentItemId)
    if ('error' in own) return { ok: false, error: own.error }
    const nextExpiry = new Date(Date.now() + 30 * 86_400_000).toISOString()
    const now = new Date().toISOString()
    const { error: noticeErr } = await own.supabase
      .from('notices')
      .update({ expiry_date: nextExpiry })
      .eq('content_item_id', own.itemId)
    if (noticeErr) return { ok: false, error: noticeErr.message }
    const { error: itemErr } = await own.supabase
      .from('content_items')
      .update({ expires_at: nextExpiry, is_archived: false, status: 'published', published_at: now })
      .eq('id', own.itemId)
    if (itemErr) return { ok: false, error: itemErr.message }
    await own.supabase.from('moderation_log').insert({ action: 'notice:renewed:owner', content_item_id: own.itemId })
    revalidatePath('/account/notices', 'page')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
