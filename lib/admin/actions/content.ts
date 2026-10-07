'use server'

import { assertStaff, assertAdmin, assertAnyCapability, assertCapability } from '@/lib/admin/auth'
import { getContentItemEditData as fetchContentEditData, queryContentForSlotAssign, searchAuthorProfiles, getContentHistory, getContentItems, getUsers } from '@/lib/admin/queries'
import { validateContentDraft, type ContentDraftInput } from '../content-validation'
import { syncContentTags } from '@/lib/admin/tags'
import { createAdminClient } from '@/lib/supabase/admin'
import { type UpdateOf } from '@/lib/supabase/admin'
import { translateTexts } from '@/lib/translate/deepl'
import { localizeContent, draftShareText, isShareVoice } from '@/lib/translate/localize'
import { llmLocalizeFields, llmDraftShareLine } from '@/lib/translate/prompts'
import { llmReadyAsync } from '@/lib/translate/llm'
import { lookupSegment } from '@/lib/translate/tm'
import { type ActionResult, audit, fail, revalidateLocalized, revalidatePublicContentCache, uniqueSlug, syncPhotos, applyStoryCredit, deleteStoredMedia, upsertTranslations } from './_shared'
import { createContentRow, revalidateCreatedContent } from './content-create'

export type { ContentDraftInput } from '../content-validation'

/**
 * Save edits to an existing content item from the drawer: translations,
 * meta, photos, listing/notice extension fields. Does not change status.
 */
export async function saveContentItem(
  contentItemId: string,
  draft: ContentDraftInput,
  /** Editor-facing locale for validation prose (defaults to English). */
  locale: 'en' | 'fr' = 'en',
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const validationError = validateContentDraft(draft, false, locale)
    if (validationError) return { ok: false, error: validationError }

    const { data: item } = await supabase
      .from('content_items')
      .select('id, type, slug, author_id, status, location_id')
      .eq('id', contentItemId)
      .single()
    if (!item) return { ok: false, error: 'Content item not found.' }
    // An edit must not strip the location off a live item — published content
    // without a place row is invisible to (or wrong on) hubs, facets and the
    // Near You rail. Mirrors the DB trigger (20261112000000): transitioning
    // INTO published requires a location (validateContentDraft on the publish
    // path), stripping one from a live item is blocked here, but legacy
    // locationless rows stay editable (typo fixes) until they are republished.
    if (
      (item as { status: string; location_id: string | null }).status === 'published' &&
      draft.locationId !== undefined &&
      !draft.locationId &&
      (item as { location_id: string | null }).location_id
    ) {
      return { ok: false, error: 'Add a location before publishing — place pages and filters depend on it.' }
    }

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
      // The story-level credit must also reach photo rows that this save did
      // not create or link, or editing it would appear to do nothing.
      await applyStoryCredit(supabase, contentItemId, draft.photographerCredit ?? null)
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
        // Phase A dual-write: mirror contact fields into `seller_contacts`.
        const scPatch: Record<string, unknown> = {}
        if (draft.listing.contactPhone !== undefined) scPatch.contact_phone = draft.listing.contactPhone || null
        if (draft.listing.contactEmail !== undefined) scPatch.contact_email = draft.listing.contactEmail || null
        if (draft.listing.whatsappNumber !== undefined) scPatch.whatsapp_number = draft.listing.whatsappNumber || null
        if (Object.keys(scPatch).length > 0) {
          try {
            await supabase.from('seller_contacts').upsert(
              { content_item_id: contentItemId, ...scPatch },
              { onConflict: 'content_item_id' },
            )
          } catch {
            /* best-effort: legacy columns already updated */
          }
        }
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
  /** Editor-facing locale for validation prose (defaults to English). */
  locale?: 'en' | 'fr'
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const type = input.type.trim()
    if (!(CONTENT_TYPES as readonly string[]).includes(type)) return { ok: false, error: 'Unknown content type.' }
    const validationError = validateContentDraft(input.draft, input.publish !== 'draft', input.locale ?? 'en')
    if (validationError) return { ok: false, error: validationError }
    if (input.publish === 'schedule' && !input.scheduledFor) return { ok: false, error: 'A schedule date is required when scheduling.' }

    const created = await createContentRow({
      type,
      draft: input.draft,
      publish: input.publish,
      scheduledFor: input.scheduledFor,
      expiresAt: input.expiresAt,
      slug: input.draft.slug,
      publishedAt: input.draft.publishedAt,
      // An item created by staff with no picked author belongs to the creator.
      authorFallbackId: user.id,
      supabase,
    })
    const { slug } = created

    await audit(supabase, user.id, {
      action: `content:create:${input.publish === 'now' ? 'publish' : input.publish === 'schedule' ? 'schedule' : 'draft'}`,
      contentItemId: created.id,
      toStatus: input.publish === 'now' ? 'published' : input.publish === 'schedule' ? 'scheduled' : 'draft',
      notes: `${type}/${slug}`,
    })

    revalidateCreatedContent(input.publish)
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
 * The destructive work runs through the `admin_delete_content_item` RPC
 * (SECURITY DEFINER, so RLS can never veto an admin hard-delete — the exact
 * failure that made seeded "dummy" content undeletable). Defense in depth is
 * kept: page guard → `assertAdmin` here → the RPC's own admin check.
 *
 * RPC client choice matters: the pre-20261023 RPC guards on `auth.uid()`,
 * which is NULL under the service-role client, while the fixed RPC guards on
 * `p_actor_id`. Calling first as the session user satisfies the old guard;
 * on 'Admin permission required' we retry via the service-role client, which
 * satisfies the new guard. One of the two always matches the live database.
 */
export async function deleteContentItem(contentItemId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertAdmin()
    // Service-role: storage cleanup + lookup must not be vetoed by RLS
    // (missing grants on child tables previously surfaced as "new row
    // violates row-level security policy").
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

    const args = {
      p_content_item_id: contentItemId,
      p_actor_id: user.id,
      p_note: `${row.type}/${row.slug}`,
    }
    // Session client first: carries auth.uid() for the legacy is_admin() RPC.
    const first = await supabase.rpc('admin_delete_content_item', args)
    if (!first.error) {
      revalidatePublicContentCache()
      revalidateLocalized('/admin/content')
      revalidateLocalized('/admin/dashboard')
      revalidateLocalized('/admin/listings')
      return { ok: true }
    }
    if (first.error.message !== 'Admin permission required') {
      return { ok: false, error: first.error.message }
    }
    // Retry privileged: the fixed RPC authorizes p_actor_id instead.
    const { error } = await admin.rpc('admin_delete_content_item', args)
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
  locations: { id: string; name: string; slug: string }[]
  media: { id: string; caption: string; mimeType: string }[]
  auditEvents: { id: string; action: string; resourceType: string }[]
}

/**
 * Admin global search (staff command palette): top content matches by
 * title/slug, user matches by name/email, location matches by name, media
 * matches by metadata and audit-event matches by action/resource (spec §36).
 * Staff-only; empty query returns empty groups. Results respect permissions:
 * the staff gate plus the same RLS the list pages read through.
 */
export async function adminGlobalSearch(query: string): Promise<AdminSearchResults> {
  const { supabase } = await assertStaff()
  const q = query.trim().slice(0, 80)
  if (q.length < 2) return { content: [], users: [], locations: [], media: [], auditEvents: [] }
  const like = `%${q.replace(/[%_,]/g, '')}%`
  const [content, users, locations, media, auditEvents] = await Promise.all([
    getContentItems({ search: q, limit: 6, offset: 0 }),
    getUsers({ search: q, limit: 6, page: 1 }),
    supabase.from('locations').select('id, name, slug').ilike('name', like).limit(6),
    supabase
      .from('media_assets')
      .select('id, caption, mime_type')
      .or(`caption.ilike.${like},photographer_credit.ilike.${like},creator.ilike.${like}`)
      .limit(6),
    supabase
      .from('audit_events')
      .select('id, action, resource_type')
      .or(`action.ilike.${like},resource_type.ilike.${like}`)
      .order('created_at', { ascending: false })
      .limit(6),
  ])
  return {
    content: content.rows.map((r) => ({ id: r.id, title: r.title ?? 'Untitled', type: r.type, status: r.status })),
    users: users.rows.map((u) => ({ id: u.id, name: u.displayName ?? u.fullName ?? u.email ?? 'User', email: u.email ?? '' })),
    locations: ((locations.data ?? []) as { id: string; name: string; slug: string }[]).map((l) => ({
      id: l.id,
      name: l.name,
      slug: l.slug,
    })),
    media: ((media.data ?? []) as { id: string; caption: string | null; mime_type: string | null }[]).map((m) => ({
      id: m.id,
      caption: m.caption ?? 'Untitled media',
      mimeType: m.mime_type ?? '',
    })),
    auditEvents: ((auditEvents.data ?? []) as { id: string; action: string; resource_type: string }[]).map((a) => ({
      id: a.id,
      action: a.action,
      resourceType: a.resource_type,
    })),
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
  | {
      ok: true
      fields: { title: string; excerpt: string; body: string; seoDescription: string }
      /** Editor-facing notes: which fallbacks ran, which outputs were rejected. */
      warnings: string[]
    }
  | { ok: false; error: string }

/**
 * Auto-translate content fields into the other locale (capability-gated,
 * no DB write — the editor reviews before saving). Intelligence layer:
 * translation memory → editorial LLM (natural newsroom localization, not
 * word-for-word) → DeepL, with a per-field language guard that keeps
 * untranslated English out of French fields (and vice versa). Mirrors the
 * job path in lib/admin/actions/translations.ts through the shared
 * localizeContent orchestrator.
 */
export async function translateContentFields(input: TranslateContentInput): Promise<TranslateContentResult> {
  try {
    // Form-write, not a DB write: the moderation approve form translates into
    // its own inputs, so the moderate desk is admitted alongside manageContent.
    await assertAnyCapability(['manageContent', 'moderate'])
    const from = input.sourceLocale
    const to: 'en' | 'fr' = from === 'en' ? 'fr' : 'en'
    const source = {
      title: (input.title ?? '').slice(0, 2000),
      excerpt: (input.excerpt ?? '').slice(0, 8000),
      seoDescription: (input.seoDescription ?? '').slice(0, 2000),
      body: (input.body ?? '').slice(0, 100000),
    }
    if (!source.title.trim() && !source.excerpt.trim() && !source.body.trim() && !source.seoDescription.trim()) {
      return { ok: false, error: 'Enter source text first.' }
    }
    const result = await localizeContent(source, from, to, {
      deepl: translateTexts,
      llmAvailable: await llmReadyAsync(),
      llmLocalize: llmLocalizeFields,
      tmLookup: lookupSegment,
    })
    const filled = (Object.keys(source) as (keyof typeof source)[]).filter((f) => source[f].trim())
    if (filled.length > 0 && filled.every((f) => result.engines[f] === 'source')) {
      return { ok: false, error: result.warnings.join(' ') || 'Translation produced no usable output.' }
    }
    return { ok: true, fields: result.fields, warnings: result.warnings }
  } catch (e) {
    return fail(e)
  }
}

export type DraftShareLineResult =
  | { ok: true; shareText: string; voice: 'formal' | 'pidgin' | 'camfranglais'; engine: 'llm' | 'deepl' }
  | { ok: false; error: string }

/**
 * Draft the WhatsApp share line in a voice register (formal / pidgin /
 * camfranglais) with the editorial model — register rewrites for diaspora
 * readers, not translations. Capability-gated; returns text for the form,
 * never writes to the DB.
 */
export async function draftShareLine(input: {
  title: string
  excerpt?: string
  voice: string
  locale: 'en' | 'fr'
}): Promise<DraftShareLineResult> {
  try {
    // Same form-write policy as translateContentFields above.
    await assertAnyCapability(['manageContent', 'moderate'])
    if (!isShareVoice(input.voice)) return { ok: false, error: 'Unknown voice register.' }
    const title = (input.title ?? '').trim()
    if (!title) return { ok: false, error: 'Enter a title first.' }
    const draft = await draftShareText(
      { title, excerpt: (input.excerpt ?? '').slice(0, 1500) },
      {
        voice: input.voice,
        locale: input.locale,
        llmAvailable: await llmReadyAsync(),
        llmDraft: llmDraftShareLine,
        deepl: translateTexts,
      },
    )
    if (!draft) {
      return {
        ok: false,
        error: await llmReadyAsync()
          ? 'Could not draft a line that passed review — write it yourself.'
          : 'Generation is not configured (Admin → Secrets → AI provider).',
      }
    }
    return { ok: true, shareText: draft.text, voice: input.voice, engine: draft.engine }
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
    if (status === 'published' || status === 'scheduled') {
      const { data: current } = await supabase
        .from('content_items')
        .select('published_at, location_id')
        .eq('id', contentId)
        .limit(1)
      const existing = (current ?? [])[0] as { published_at: string | null; location_id: string | null } | undefined
      if (!existing) return { ok: false, error: 'Content item not found.' }
      // The place taxonomy is what makes location facets, place hubs and the
      // Near You rail honest — an item without one must not reach the public
      // site through the status control either (the same rule the create/edit
      // publish paths enforce, and the scheduled cron flip depends on).
      // Emergency notices are the deliberate exception and live on their own
      // path (lib/admin/actions/emergency.ts).
      if (!existing.location_id) {
        return { ok: false, error: 'Add a location before publishing — place pages and filters depend on it.' }
      }
      if (status === 'published') {
        patch.published_at = existing.published_at ?? new Date().toISOString()
      }
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
