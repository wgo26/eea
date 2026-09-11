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
 * Seller self-manage (P1-1c): owners act on their own listings without staff.
 * Ownership is verified in code (submitted_by/author_id = caller) on the
 * service-role client — RLS has no owner-write path for listings, and this
 * keeps the check explicit next to the anti-scraping audit trail used by
 * revealSellerContact.
 */
async function ownListing(contentItemId: string): Promise<{ supabase: ReturnType<typeof createAdminClient>; userId: string; itemId: string } | { error: string }> {
  const { user } = await getSessionUser()
  if (!user) return { error: 'Authentication required.' }
  const supabase = createAdminClient()
  const { data: item, error } = await supabase
    .from('content_items')
    .select('id, type, status, submitted_by, author_id')
    .eq('id', contentItemId)
    .maybeSingle()
  if (error || !item) return { error: 'Listing not found.' }
  const row = item as { id: string; type: string; status: string; submitted_by: string | null; author_id: string | null }
  if (row.type !== 'listing') return { error: 'This content item is not a listing.' }
  if (row.submitted_by !== user.id && row.author_id !== user.id) {
    logger.warn('listings-owner', 'ownership denied', { clientUser: user.id })
    return { error: 'This listing is not yours.' }
  }
  return { supabase, userId: user.id, itemId: row.id }
}

/** Owner marks their live listing sold (stays visible with the sold badge). */
export async function markOwnListingSold(contentItemId: string): Promise<Result> {
  try {
    const own = await ownListing(contentItemId)
    if ('error' in own) return { ok: false, error: own.error }
    const { data: listing } = await own.supabase.from('listings').select('listing_status').eq('content_item_id', own.itemId).maybeSingle()
    if ((listing as { listing_status?: string } | null)?.listing_status !== 'active') {
      return { ok: false, error: 'Only an active listing can be marked as sold.' }
    }
    const { error } = await own.supabase
      .from('listings')
      .update({ listing_status: 'sold', sold_at: new Date().toISOString() })
      .eq('content_item_id', own.itemId)
    if (error) return { ok: false, error: error.message }
    await own.supabase.from('moderation_log').insert({ action: 'listing:sold:owner', content_item_id: own.itemId })
    revalidatePath('/account/listings', 'page')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Owner renews an expired/sold listing for 30 more days. */
export async function renewOwnListing(contentItemId: string): Promise<Result> {
  try {
    const own = await ownListing(contentItemId)
    if ('error' in own) return { ok: false, error: own.error }
    const { data: listing } = await own.supabase.from('listings').select('listing_status').eq('content_item_id', own.itemId).maybeSingle()
    const status = (listing as { listing_status?: string } | null)?.listing_status
    if (status === 'active') return { ok: false, error: 'This listing is already active.' }
    if (status === 'removed') return { ok: false, error: 'Removed listings need staff review — contact us.' }
    const now = new Date().toISOString()
    const { error } = await own.supabase
      .from('listings')
      .update({ listing_status: 'active', renewed_at: now, sold_at: null })
      .eq('content_item_id', own.itemId)
    if (error) return { ok: false, error: error.message }
    await own.supabase
      .from('content_items')
      .update({ expires_at: new Date(Date.now() + 30 * 86_400_000).toISOString(), is_archived: false, status: 'published', published_at: now })
      .eq('id', own.itemId)
    await own.supabase.from('moderation_log').insert({ action: 'listing:renewed:owner', content_item_id: own.itemId })
    revalidatePath('/account/listings', 'page')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Owner removes their listing from the marketplace (archived, reversible by staff). */
export async function removeOwnListing(contentItemId: string): Promise<Result> {
  try {
    const own = await ownListing(contentItemId)
    if ('error' in own) return { ok: false, error: own.error }
    const { error } = await own.supabase.from('listings').update({ listing_status: 'removed' }).eq('content_item_id', own.itemId)
    if (error) return { ok: false, error: error.message }
    await own.supabase.from('content_items').update({ is_archived: true, is_featured: false }).eq('id', own.itemId)
    await own.supabase.from('moderation_log').insert({ action: 'listing:removed:owner', content_item_id: own.itemId })
    revalidatePath('/account/listings', 'page')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Owner withdraws their own pending/in-review submission (status → withdrawn).
 * Rejected/published rows are out of scope — rejected items can be
 * resubmitted, published items need staff takedown.
 */
export async function withdrawOwnSubmission(submissionId: string): Promise<Result> {
  try {
    const { user } = await getSessionUser()
    if (!user) return { ok: false, error: 'Authentication required.' }
    const supabase = createAdminClient()
    const { data: sub } = await supabase
      .from('submissions')
      .select('id, status, submitted_by, guest_email')
      .eq('id', submissionId)
      .maybeSingle()
    const row = sub as { id: string; status: string; submitted_by: string | null; guest_email: string | null } | null
    if (!row) return { ok: false, error: 'Submission not found.' }
    const owns = row.submitted_by === user.id || (row.guest_email != null && row.guest_email === user.email)
    if (!owns) return { ok: false, error: 'This submission is not yours.' }
    if (!['pending', 'in_review'].includes(row.status)) {
      return { ok: false, error: `This submission is ${row.status} and cannot be withdrawn.` }
    }
    const { error } = await supabase.from('submissions').update({ status: 'withdrawn' }).eq('id', submissionId)
    if (error) return { ok: false, error: error.message }
    revalidatePath('/account/submissions', 'page')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
