'use server'

import { assertStaff, assertAdmin, assertCapability } from '@/lib/admin/auth'
import { getContentItemEditData as fetchContentEditData, queryContentForSlotAssign, searchAuthorProfiles, getContentHistory, getContentItems, getUsers } from '@/lib/admin/queries'
import { validateContentDraft, type ContentDraftInput } from '../content-validation'
import { syncContentTags } from '@/lib/admin/tags'
import { createAdminClient } from '@/lib/supabase/admin'
import { type UpdateOf } from '@/lib/supabase/admin'
import { translateTexts } from '@/lib/translate/deepl'
import { type ActionResult, audit, fail, revalidateLocalized, revalidatePublicContentCache, uniqueSlug, syncPhotos, deleteStoredMedia, upsertTranslations } from './_shared'

export type { ContentDraftInput } from '../content-validation'

/**
 * Save edits to an existing content item from the drawer: translations,
 * meta, photos, listing/notice extension fields. Does not change status.
 */
export async function saveContentItem(contentItemId: string, draft: ContentDraftInput): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const validationError = validateContentDraft(draft, false)
    if (validationError) return { ok: false, error: validationError }

    const { data: item } = await supabase
      .from('content_items')
      .select('id, type, slug, author_id')
      .eq('id', contentItemId)
      .single()
    if (!item) return { ok: false, error: 'Content item not found.' }

    const changed: string[] = []
    const patch: Record<string, unknown> = {}
    if (draft.verification !== undefined) patch.verification = draft.verification
    if (draft.locationId !== undefined) patch.location_id = draft.locationId || null
    if (draft.categoryId !== undefined) patch.category_id = draft.categoryId || null
    // Profile author: previously accepted by the type + sent by the edit
    // drawer but silently never written — the toast said "Saved" while the
    // author stayed unchanged. Undefined = keep stored; null = clear.
    if (draft.authorId !== undefined && (draft.authorId || null) !== ((item as { author_id: string | null }).author_id ?? null)) {
      patch.author_id = draft.authorId || null
      changed.push('author')
    }
    // Publish date: only applied when a non-empty value is sent — clearing it
    // on a published post would hide it from the public queries.
    if (draft.publishedAt !== undefined && draft.publishedAt) {
      const ts = new Date(draft.publishedAt)
      if (!Number.isNaN(ts.getTime())) {
        patch.published_at = ts.toISOString()
        changed.push('publishedAt')
      }
    }
    // Expiry date: null/empty clears a previously set expiry, a valid date
    // sets it. Undefined leaves the stored value untouched.
    if (draft.expiresAt !== undefined) {
      if (draft.expiresAt) {
        const ts = new Date(draft.expiresAt)
        if (!Number.isNaN(ts.getTime())) {
          patch.expires_at = ts.toISOString()
          changed.push('expiresAt')
        }
      } else {
        patch.expires_at = null
        changed.push('expiresAt')
      }
    }
    // Permalink: slugified + collision-suffixed only when the editor changed it.
    if (draft.slug !== undefined && draft.slug.trim() && draft.slug.trim() !== item.slug) {
      patch.slug = await uniqueSlug(supabase, draft.slug)
      changed.push('slug')
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('content_items').update(patch as UpdateOf<'content_items'>).eq('id', contentItemId)
      if (error) return { ok: false, error: error.message }
    }
    // Translation rows unchanged if none of the patch keys hit them.

    await upsertTranslations(supabase, contentItemId, draft.translations)
    if (draft.tags !== undefined) {
      await syncContentTags(supabase, contentItemId, draft.tags)
      changed.push('tags')
    }
    if (draft.photos || draft.keepPhotoIds || draft.attachments) {
      await syncPhotos(supabase, contentItemId, draft.photos ?? [], draft.keepPhotoIds ?? [], draft.photographerCredit ?? null, draft.attachments ?? [])
    }

    if (item.type === 'listing' && draft.listing) {
      const lPatch: Record<string, unknown> = {}
      if (draft.listing.price !== undefined) lPatch.price = draft.listing.price
      if (draft.listing.currency) lPatch.currency = draft.listing.currency.toUpperCase().slice(0, 3)
      if (draft.listing.contactPhone !== undefined) lPatch.contact_phone = draft.listing.contactPhone || null
      if (draft.listing.contactEmail !== undefined) lPatch.contact_email = draft.listing.contactEmail || null
      if (draft.listing.whatsappNumber !== undefined) lPatch.whatsapp_number = draft.listing.whatsappNumber || null
      if (draft.listing.sellerName !== undefined) lPatch.seller_name = draft.listing.sellerName || null
      if (Object.keys(lPatch).length > 0) {
        const { error } = await supabase.from('listings').update(lPatch as UpdateOf<'listings'>).eq('content_item_id', contentItemId)
        if (error) return { ok: false, error: error.message }
      }
    }
    if (item.type === 'notice' && draft.notice) {
      const { error } = await supabase.from('notices').upsert(
        {
          content_item_id: contentItemId,
          notice_type: draft.notice.noticeType,
          organization_name: draft.notice.organizationName ?? null,
          contact_phone: draft.notice.contactPhone ?? null,
          notice_date: draft.notice.noticeDate ?? null,
          expiry_date: draft.notice.expiryDate ?? null,
          is_official: draft.verification === 'official_source' || draft.notice.isOfficial === true,
        },
        { onConflict: 'content_item_id' },
      )
      if (error) return { ok: false, error: error.message }
    }
    if (draft.event) {
      const existing = await supabase.from('events').select('content_item_id').eq('content_item_id', contentItemId).limit(1)
      const hasEvent = (existing.data?.length ?? 0) > 0
      const eventPatch: Record<string, unknown> = {
        starts_at: draft.event.startsAt ?? null,
        ends_at: draft.event.endsAt ?? null,
        venue_name: draft.event.venueName ?? null,
        ticket_url: draft.event.ticketUrl?.trim() || null,
        organizer_name: draft.event.organizerName ?? null,
        organizer_phone: draft.event.organizerPhone ?? null,
        organizer_email: draft.event.organizerEmail ?? null,
      }
      // No event row yet and nothing to save → skip; otherwise upsert so the caller
      // can clear fields by sending null.
      const hasValue = Object.values(eventPatch).some((v) => v !== null)
      if (hasEvent || hasValue) {
        const { error } = await supabase.from('events').upsert(
          { content_item_id: contentItemId, ...eventPatch },
          { onConflict: 'content_item_id' },
        )
        if (error) return { ok: false, error: error.message }
      }
    }

    await supabase.from('moderation_log').insert({
      action: 'edit_content',
      content_item_id: contentItemId,
      actor_id: user.id,
      notes: changed.length > 0 ? `changed: ${changed.join(', ')}` : null,
    })

    revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    revalidateLocalized('/admin/moderation/[id]')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

const CONTENT_TYPES = ['photo_story', 'news', 'listing', 'notice', 'culture', 'micro_story'] as const

/**
 * Admin direct-publish (Phase 2): create a content item without a submission.
 * Handles every content_type, bilingual translations, photos, and the per-type
 * extension rows (listings/notices/events). Editors can create; publishes
 * require both locales, drafts don't.
 */
export async function createContentItem(input: {
  type: string
  draft: ContentDraftInput
  publish: 'now' | 'schedule' | 'draft'
  scheduledFor?: string
  expiresAt?: string | null
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const now = new Date().toISOString()
    const type = input.type.trim()
    if (!(CONTENT_TYPES as readonly string[]).includes(type)) return { ok: false, error: 'Unknown content type.' }
    const validationError = validateContentDraft(input.draft, input.publish !== 'draft')
    if (validationError) return { ok: false, error: validationError }
    if (input.publish === 'schedule' && !input.scheduledFor) return { ok: false, error: 'A schedule date is required when scheduling.' }

    const statusPatch =
      input.publish === 'now' ? { status: 'published', published_at: now } :
      input.publish === 'schedule' ? { status: 'scheduled', scheduled_for: input.scheduledFor } :
      ({ status: 'draft' } as const)
    const slug = await uniqueSlug(supabase, input.draft.slugBase || type)

    const { data: created, error: createErr } = await supabase
      .from('content_items')
      .insert({
        type,
        slug,
        status: 'draft',
        verification: input.draft.verification ?? null,
        location_id: input.draft.locationId || null,
        category_id: input.draft.categoryId || null,
        author_id: input.draft.authorId || user.id, // dialog pick, else creator
        expires_at: input.expiresAt || null,
      })
      .select('id')
      .single()
    if (createErr || !created) return { ok: false, error: createErr?.message ?? 'Could not create the content item.' }

    try {
      await upsertTranslations(supabase, created.id, input.draft.translations)
      if ((input.draft.photos ?? []).length > 0 || (input.draft.attachments ?? []).length > 0) {
        await syncPhotos(supabase, created.id, input.draft.photos ?? [], [], input.draft.photographerCredit ?? null, input.draft.attachments ?? [])
      }
      if (type === 'listing') {
        const { error: lErr } = await supabase.from('listings').insert({
          content_item_id: created.id,
          price: input.draft.listing?.price ?? null,
          currency: input.draft.listing?.currency?.toUpperCase().slice(0, 3) ?? 'XAF',
          listing_status: 'active',
          contact_phone: input.draft.listing?.contactPhone ?? null,
          contact_email: input.draft.listing?.contactEmail ?? null,
          whatsapp_number: input.draft.listing?.whatsappNumber ?? null,
          seller_name: input.draft.listing?.sellerName?.trim() || null,
        })
        if (lErr) throw new Error(`Could not create the listing: ${lErr.message}`)
      }
      if (type === 'notice') {
        const { error: nErr } = await supabase.from('notices').insert({
          content_item_id: created.id,
          notice_type: input.draft.notice?.noticeType ?? 'other',
          organization_name: input.draft.notice?.organizationName ?? null,
          contact_phone: input.draft.notice?.contactPhone ?? null,
          notice_date: input.draft.notice?.noticeDate ?? null,
          expiry_date: input.draft.notice?.expiryDate ?? input.expiresAt ?? null,
          is_official: input.draft.verification === 'official_source' || input.draft.notice?.isOfficial === true,
        })
        if (nErr) throw new Error(`Could not create the notice: ${nErr.message}`)
      }
      if (type === 'culture' && input.draft.event) {
        const e = input.draft.event
        if (e.startsAt || e.endsAt || e.venueName || e.ticketUrl || e.organizerName || e.organizerPhone || e.organizerEmail) {
          const { error: eErr } = await supabase.from('events').insert({
            content_item_id: created.id,
            starts_at: e.startsAt ?? null,
            ends_at: e.endsAt ?? null,
            venue_name: e.venueName ?? null,
            ticket_url: e.ticketUrl?.trim() || null,
            organizer_name: e.organizerName ?? null,
            organizer_phone: e.organizerPhone ?? null,
            organizer_email: e.organizerEmail ?? null,
          })
          if (eErr) throw new Error(`Could not create the event: ${eErr.message}`)
        }
      }
    } catch (e) {
      const { data: mediaRows } = await supabase
        .from('media_assets')
        .select('id, provider, storage_key')
        .eq('content_item_id', created.id)
      for (const media of mediaRows ?? []) {
        await deleteStoredMedia(supabase, media as { provider: string; storage_key: string | null })
      }
      await supabase.from('media_assets').delete().eq('content_item_id', created.id)
      await supabase.from('content_items').delete().eq('id', created.id)
      return fail(e)
    }

    if (input.publish !== 'draft') {
      const { error: flipErr } = await supabase.from('content_items').update(statusPatch).eq('id', created.id)
      if (flipErr) return { ok: false, error: flipErr.message }
    }

    await audit(supabase, user.id, {
      action: `content:create:${input.publish === 'now' ? 'publish' : input.publish === 'schedule' ? 'schedule' : 'draft'}`,
      contentItemId: created.id,
      toStatus: input.publish === 'now' ? 'published' : input.publish === 'schedule' ? 'scheduled' : 'draft',
      notes: `${type}/${slug}`,
    })

    if (input.publish !== 'draft') revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    revalidateLocalized('/admin/dashboard')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Hard-delete a content item (admin only, Phase 2). Clears homepage slot
 * refs first, then removes translations, media, type-specific rows, and the
 * item itself. Cascades handle content_tags, saved_content, etc. but we
 * explicitly clear the SET NULL ref (homepage_slots) and audit the deletion.
 *
 * The destructive work runs on the service-role client (bypassing RLS) after
 * the `assertAdmin` authorization check, so an admin delete can never be
 * blocked by a missing RLS grant/policy on a child table (the exact failure
 * that made seeded "dummy" content undeletable). Defense in depth is kept:
 * page guard → `assertAdmin` here → the RPC's own `is_admin()` check.
 */
export async function deleteContentItem(contentItemId: string): Promise<ActionResult> {
  try {
    const { user } = await assertAdmin()
    // Service-role: authorization already happened above; RLS must not be
    // able to veto an admin hard-delete (missing grants on child tables
    // previously surfaced as "new row violates row-level security policy").
    const admin = createAdminClient()
    const { data: item, error: lookupErr } = await admin.from('content_items').select('id, slug, type').eq('id', contentItemId).limit(1)
    if (lookupErr) return { ok: false, error: lookupErr.message }
    const row = (item ?? [])[0] as { id: string; slug: string; type: string } | undefined
    if (!row) return { ok: false, error: 'Content item not found.' }

    const { data: mediaRows } = await admin
      .from('media_assets')
      .select('id, provider, storage_key')
      .eq('content_item_id', contentItemId)
    for (const media of mediaRows ?? []) {
      await deleteStoredMedia(admin, media as { provider: string; storage_key: string | null })
    }

    const { error } = await admin.rpc('admin_delete_content_item', {
      p_content_item_id: contentItemId,
      p_actor_id: user.id,
      p_note: `${row.type}/${row.slug}`,
    })
    if (error) return { ok: false, error: error.message }

    revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    revalidateLocalized('/admin/dashboard')
    revalidateLocalized('/admin/listings')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Client-callable fetch for the edit drawer (capability-gated, reuses the service-role query). */
export async function getContentItemEditData(contentItemId: string) {
  await assertCapability('manageContent')
  return fetchContentEditData(contentItemId)
}

/** Client-callable per-item change history for the edit drawer (capability-gated). */
export async function getContentHistoryData(contentItemId: string) {
  await assertCapability('manageContent')
  return getContentHistory(contentItemId)
}

export type AdminSearchResults = {
  content: { id: string; title: string; type: string; status: string }[]
  users: { id: string; name: string; email: string }[]
}

/**
 * Admin global search (staff command palette): top content matches by
 * title/slug plus top user matches by name/email. Staff-only; empty query
 * returns empty groups.
 */
export async function adminGlobalSearch(query: string): Promise<AdminSearchResults> {
  await assertStaff()
  const q = query.trim().slice(0, 80)
  if (q.length < 2) return { content: [], users: [] }
  const [content, users] = await Promise.all([
    getContentItems({ search: q, limit: 6, offset: 0 }),
    getUsers({ search: q, limit: 6, page: 1 }),
  ])
  return {
    content: content.rows.map((r) => ({ id: r.id, title: r.title ?? 'Untitled', type: r.type, status: r.status })),
    users: users.rows.map((u) => ({ id: u.id, name: u.displayName ?? u.fullName ?? u.email ?? 'User', email: u.email ?? '' })),
  }
}

/** Client-callable content search for homepage-slot assignment (capability-gated). */
export async function searchContentForSlot(query: string, limit = 10) {
  await assertCapability('manageContent')
  return queryContentForSlotAssign(query, limit)
}

/** Client-callable profile search for the author picker (capability-gated). */
export async function searchAuthors(term: string) {
  await assertCapability('manageContent')
  return searchAuthorProfiles(term)
}

export type TranslateContentInput = {
  sourceLocale: 'en' | 'fr'
  title?: string
  excerpt?: string
  body?: string
  seoDescription?: string
}

export type TranslateContentResult =
  | { ok: true; fields: { title: string; excerpt: string; body: string; seoDescription: string } }
  | { ok: false; error: string }

/**
 * Auto-translate content fields into the other locale via DeepL
 * (capability-gated, no DB write — the editor reviews before saving).
 * Plain fields translate in one request; the body goes as HTML so markup
 * and embedded media survive. Mirrors scripts/fill-fr.mjs (batch backfill).
 */
export async function translateContentFields(input: TranslateContentInput): Promise<TranslateContentResult> {
  try {
    await assertCapability('manageContent')
    const sourceLang = input.sourceLocale === 'en' ? 'EN' as const : 'FR' as const
    const targetLang = input.sourceLocale === 'en' ? 'FR' as const : 'EN' as const
    const title = (input.title ?? '').slice(0, 2000)
    const excerpt = (input.excerpt ?? '').slice(0, 8000)
    const seoDescription = (input.seoDescription ?? '').slice(0, 2000)
    const body = (input.body ?? '').slice(0, 100000)
    if (!title.trim() && !excerpt.trim() && !body.trim() && !seoDescription.trim()) {
      return { ok: false, error: 'Enter source text first.' }
    }
    const [plain, htmlBody] = await Promise.all([
      translateTexts([title, excerpt, seoDescription], { sourceLang, targetLang }),
      translateTexts([body], { sourceLang, targetLang, html: true }),
    ])
    return {
      ok: true,
      fields: {
        // Keep the 300-char column budget the batch backfill uses.
        title: (plain[0] ?? '').slice(0, 300),
        excerpt: plain[1] ?? '',
        body: htmlBody[0] ?? '',
        seoDescription: (plain[2] ?? '').slice(0, 300),
      },
    }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Content status transitions                                          */
/* ------------------------------------------------------------------ */

export async function updateContentStatus(contentId: string, status: string, scheduledFor?: string): Promise<ActionResult> {
  const allowed = new Set(['draft', 'published', 'scheduled'])
  if (!allowed.has(status)) return { ok: false, error: 'Invalid status.' }
  try {
    const { supabase, user } = await assertStaff()
    const patch: Record<string, unknown> = { status }
    // Publish stamps published_at only when the row doesn't already carry one
    // (imported posts keep their original source date; native drafts have
    // published_at null, so they get "now" exactly as before).
    if (status === 'published') {
      const { data: current } = await supabase
        .from('content_items')
        .select('published_at')
        .eq('id', contentId)
        .limit(1)
      const existing = (current ?? [])[0] as { published_at: string | null } | undefined
      patch.published_at = existing?.published_at ?? new Date().toISOString()
    }
    if (status === 'scheduled' && scheduledFor) patch.scheduled_for = scheduledFor
    // Unpublish (published/scheduled → draft): fully hide from the public
    // site — clear any pending schedule, drop the featured flag, and
    // deactivate homepage slots pointing at this item.
    if (status === 'draft') {
      patch.scheduled_for = null
      patch.is_featured = false
    }

    const { error } = await supabase.from('content_items').update(patch as UpdateOf<'content_items'>).eq('id', contentId)
    if (error) return { ok: false, error: error.message }

    if (status === 'draft') {
      await supabase.from('homepage_slots').update({ is_active: false }).eq('content_item_id', contentId)
    }

    await supabase.from('moderation_log').insert({
      action: `status:${status}`, to_status: status, content_item_id: contentId, actor_id: user.id,
    })

    revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    revalidateLocalized('/admin/dashboard')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Feature (or unfeature) a content item, with an optional display window.
 * Featuring does two things so the two previously-disconnected mechanisms
 * stay in sync: it flips `content_items.is_featured` AND ensures an active
 * `homepage_slots` row (slot_key `secondary`) carrying the same
 * starts_at/ends_at window — the homepage reads slots, not the flag.
 * Unfeaturing clears the flag and deactivates that item's slot rows so the
 * story drops off the homepage rotation immediately.
 */
export async function setContentFeatured(contentId: string, isFeatured: boolean, endsAtIso?: string | null): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertStaff()

    const { data: item, error: itemError } = await supabase
      .from('content_items')
      .select('id, status')
      .eq('id', contentId)
      .single()
    if (itemError || !item) return { ok: false, error: 'Content item not found.' }
    if (isFeatured && item.status !== 'published') {
      return { ok: false, error: 'Publish this item first — drafts and scheduled items never appear on the homepage.' }
    }
    const nowIso = new Date().toISOString()
    let endsAt: string | null = null
    if (isFeatured && endsAtIso) {
      const parsed = new Date(endsAtIso)
      if (Number.isNaN(parsed.getTime())) return { ok: false, error: 'Invalid end date.' }
      if (parsed.getTime() <= Date.now()) return { ok: false, error: 'The feature window must end in the future.' }
      endsAt = parsed.toISOString()
    }
    const { error } = await supabase.from('content_items').update({ is_featured: isFeatured }).eq('id', contentId)
    if (error) return { ok: false, error: error.message }
    if (isFeatured) {
      const { data: existing } = await supabase
        .from('homepage_slots')
        .select('id')
        .eq('content_item_id', contentId)
        .limit(1)
      if (existing?.length) {
        const { error: slotError } = await supabase
          .from('homepage_slots')
          .update({ starts_at: nowIso, ends_at: endsAt, is_active: true })
          .eq('content_item_id', contentId)
        if (slotError) return { ok: false, error: slotError.message }
      } else {
        const { data: last } = await supabase
          .from('homepage_slots')
          .select('sort_order')
          .eq('slot_key', 'secondary')
          .order('sort_order', { ascending: false })
          .limit(1)
        const rows = (last ?? []) as { sort_order: number }[]
        const { error: slotError } = await supabase.from('homepage_slots').insert({
          slot_key: 'secondary',
          content_item_id: contentId,
          sort_order: (rows[0]?.sort_order ?? -1) + 1,
          starts_at: nowIso,
          ends_at: endsAt,
          is_active: true,
          created_by: user.id,
        })
        if (slotError) {
          // Drift guard: if the database still carries a UNIQUE constraint on
          // slot_key (migration 20261002000001 drops it), the second featured
          // story fails here. Surface an actionable message instead of the
          // raw Postgres error.
          if ((slotError as { code?: string }).code === '23505') {
            return { ok: false, error: 'Could not feature this story: the database allows only one "secondary" homepage slot. Apply the pending homepage_slots migration so multiple stories can be featured.' }
          }
          return { ok: false, error: slotError.message }
        }
      }
    } else {
      const { error: slotError } = await supabase
        .from('homepage_slots')
        .update({ is_active: false })
        .eq('content_item_id', contentId)
      if (slotError) return { ok: false, error: slotError.message }
    }
    await audit(supabase, user.id, {
      action: 'content:featured',
      contentItemId: contentId,
      toStatus: isFeatured ? 'featured' : 'unfeatured',
      notes: isFeatured ? `until=${endsAt ?? 'indefinite'}` : null,
    })
    revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function archiveContent(contentId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertStaff()
    const { error } = await supabase.from('content_items').update({ is_archived: true, is_featured: false }).eq('id', contentId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'content:archive', contentItemId: contentId })
    revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Undo for archiveContent: restores an archived item to the drafts. Powers
 * the Undo action on the "Content archived" toast. Status is left untouched
 * (an archived published item returns as-is, unhidden from queries that
 * filter is_archived).
 */
export async function unarchiveContent(contentId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertStaff()
    const { error } = await supabase.from('content_items').update({ is_archived: false }).eq('id', contentId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'content:unarchive', contentItemId: contentId })
    revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    revalidateLocalized('/admin/dashboard')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
