'use server'

import { assertCapability } from '@/lib/admin/auth'
import { type UpdateOf } from '@/lib/supabase/admin'
import { enqueueUser, listingNotifyTarget } from '@/lib/notify/queue'
import { type ActionResult, audit, fail, revalidateLocalized, revalidatePublicContentCache } from './_shared'

/* ------------------------------------------------------------------ */
/* Listing lifecycle (Phase 3 buy & sell loop)                         */
/* ------------------------------------------------------------------ */

/** Quick edit of listing commerce fields (price/currency) from the listings manager. */
export async function updateListing(
  contentItemId: string,
  input: { price?: number | null; currency?: string | null; sellerName?: string | null; contactPhone?: string | null; contactEmail?: string | null; whatsappNumber?: string | null },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const patch: Record<string, unknown> = {}
    if (input.price !== undefined) patch.price = input.price
    if (input.currency !== undefined) patch.currency = input.currency?.trim().toUpperCase() || null
    if (input.sellerName !== undefined) patch.seller_name = input.sellerName?.trim() || null
    if (input.contactPhone !== undefined) patch.contact_phone = input.contactPhone?.trim() || null
    if (input.contactEmail !== undefined) patch.contact_email = input.contactEmail?.trim() || null
    if (input.whatsappNumber !== undefined) patch.whatsapp_number = input.whatsappNumber?.trim() || null
    if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to update.' }
    // Phase 3 — price-drop detection: read the current price first so a drop
    // notifies price_watches watchers via the existing listing.update event.
    let oldPrice: number | null = null
    if (input.price !== undefined) {
      const { data: before } = await supabase.from('listings').select('price').eq('content_item_id', contentItemId).maybeSingle()
      const p = (before as { price?: number | string | null } | null)?.price
      oldPrice = typeof p === 'string' ? Number(p) : (p ?? null)
    }
    const { error } = await supabase.from('listings').update(patch as UpdateOf<'listings'>).eq('content_item_id', contentItemId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'listing:update', entityType: 'listing', entityId: contentItemId })
    if (input.price !== undefined && input.price != null && oldPrice != null && input.price < oldPrice) {
      try {
        const { data: watchers } = await supabase.from('price_watches').select('user_id').eq('content_item_id', contentItemId).limit(500)
        const { enqueueUser, listingNotifyTarget } = await import('@/lib/notify/queue')
        const target = await listingNotifyTarget(supabase, contentItemId)
        const ids = ((watchers ?? []) as { user_id: string }[]).map((w) => w.user_id)
        for (const uid of ids) {
          await enqueueUser('listing.update', uid, { title: target.title, status: `price dropped to ${input.price} ${input.currency ?? ''}`.trim() }, '/buy-sell')
        }
      } catch { /* best-effort: the price edit itself already succeeded */ }
    }
    revalidatePublicContentCache()
    revalidateLocalized('/admin/listings')
    revalidateLocalized('/admin/content')
    return { ok: true }
  } catch (e) { return fail(e) }
}

/** Bulk expire/relist over a selection — one round trip, per-item failures counted. */
export async function bulkExpireListings(contentItemIds: string[]): Promise<ActionResult> {
  let failed = 0
  for (const id of contentItemIds) {
    const result = await expireListing(id)
    if (!result.ok) failed += 1
  }
  return failed > 0 ? { ok: false, error: `${failed} of ${contentItemIds.length} listing(s) failed.` } : { ok: true }
}

export async function bulkRelistListings(contentItemIds: string[]): Promise<ActionResult> {
  let failed = 0
  for (const id of contentItemIds) {
    const result = await relistListing(id)
    if (!result.ok) failed += 1
  }
  return failed > 0 ? { ok: false, error: `${failed} of ${contentItemIds.length} listing(s) failed.` } : { ok: true }
}

/** Manually expire an active listing (hidden from the public site at once). */
export async function expireListing(contentItemId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const now = new Date().toISOString()

    const { data: item } = await supabase
      .from('content_items')
      .select('id, type, expires_at')
      .eq('id', contentItemId)
      .single()
    if (!item) return { ok: false, error: 'Listing not found.' }
    if (item.type !== 'listing') return { ok: false, error: 'This content item is not a listing.' }

    const { error } = await supabase.from('listings').update({ listing_status: 'expired' }).eq('content_item_id', contentItemId)
    if (error) return { ok: false, error: error.message }
    // keep expires_at in sync so public queries (which filter on it) hide the
    // listing immediately even when it had no expiry date
    if (!item.expires_at) {
      await supabase.from('content_items').update({ expires_at: now }).eq('id', contentItemId)
    }

    await supabase.from('moderation_log').insert({
      action: 'listing:expired',
      content_item_id: contentItemId,
      actor_id: user.id,
    })

    revalidatePublicContentCache()
    revalidateLocalized('/admin/listings')
    revalidateLocalized('/admin/content')
    revalidateLocalized('/account/listings')
    void listingNotifyTarget(supabase, contentItemId).then((t) =>
      enqueueUser('listing.update', t.userId, { title: t.title, status: 'expired' }, '/account/listings'),
    )
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Relist an expired / sold / removed listing for a fresh window (default 30 days). */
export async function relistListing(contentItemId: string, days = 30): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const now = new Date().toISOString()
    if (days <= 0 || days > 365) return { ok: false, error: 'The relist window must be between 1 and 365 days.' }

    const { data: item } = await supabase
      .from('content_items')
      .select('id, type, status, published_at, location_id')
      .eq('id', contentItemId)
      .single()
    if (!item) return { ok: false, error: 'Listing not found.' }
    if (item.type !== 'listing') return { ok: false, error: 'This content item is not a listing.' }

    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString()
    const patch: Record<string, unknown> = { expires_at: expiresAt, is_archived: false }
    if (item.status !== 'published') {
      // Relisting re-publishes, and the location-publish trigger
      // (20261112000000) requires a location — check before flipping the
      // listing row so a legacy locationless item cannot go half-active.
      if (!(item as { location_id: string | null }).location_id) {
        return { ok: false, error: 'Add a location to this listing before relisting it.' }
      }
      patch.status = 'published'
      patch.published_at = item.published_at ?? now
    }
    const { error: cErr } = await supabase
      .from('content_items')
      .update(patch as UpdateOf<'content_items'>)
      .eq('id', contentItemId)
    if (cErr) return { ok: false, error: cErr.message }

    const { error } = await supabase
      .from('listings')
      .update({ listing_status: 'active', renewed_at: now })
      .eq('content_item_id', contentItemId)
    if (error) return { ok: false, error: error.message }

    await supabase.from('moderation_log').insert({
      action: 'listing:relisted',
      content_item_id: contentItemId,
      actor_id: user.id,
    })

    revalidatePublicContentCache()
    revalidateLocalized('/admin/listings')
    revalidateLocalized('/admin/content')
    revalidateLocalized('/account/listings')
    void listingNotifyTarget(supabase, contentItemId).then((t) =>
      enqueueUser('listing.update', t.userId, { title: t.title, status: 'relisted and live again' }, '/account/listings'),
    )
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Listing moderation: mark sold (the item stays visible with a sold badge) or
 * remove it (hidden from the site immediately and the content item archived).
 */
export async function moderateListing(contentItemId: string, action: 'sold' | 'remove'): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const now = new Date().toISOString()

    const { data: item } = await supabase.from('content_items').select('id, type').eq('id', contentItemId).single()
    if (!item) return { ok: false, error: 'Listing not found.' }
    if (item.type !== 'listing') return { ok: false, error: 'This content item is not a listing.' }

    if (action === 'sold') {
      const { error } = await supabase
        .from('listings')
        .update({ listing_status: 'sold', sold_at: now })
        .eq('content_item_id', contentItemId)
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase
        .from('listings')
        .update({ listing_status: 'removed' })
        .eq('content_item_id', contentItemId)
      if (error) return { ok: false, error: error.message }
      await supabase.from('content_items').update({ is_archived: true, is_featured: false }).eq('id', contentItemId)
    }

    await supabase.from('moderation_log').insert({
      action: `listing:${action}`,
      content_item_id: contentItemId,
      actor_id: user.id,
    })

    revalidatePublicContentCache()
    revalidateLocalized('/admin/listings')
    revalidateLocalized('/admin/content')
    revalidateLocalized('/account/listings')
    void listingNotifyTarget(supabase, contentItemId).then((t) =>
      enqueueUser('listing.update', t.userId, { title: t.title, status: action === 'sold' ? 'marked as sold' : 'removed by moderation' }, '/account/listings'),
    )
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
