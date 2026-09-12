'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { assertStaff, assertAdmin, assertCapability, assertReauth, type AdminContext } from '@/lib/admin/auth'
import { CACHE_TAGS } from '@/lib/cache/tags'
import { getContentItemEditData as fetchContentEditData, queryContentForSlotAssign } from '@/lib/admin/queries'
import type { AppRole } from '@/lib/admin/queries'
import { deleteFromR2 } from '@/lib/storage/providers/r2'
import { storageConfig } from '@/lib/storage/config'
import { validateContentDraft, type ContentDraftInput } from './content-validation'
import { syncContentTags } from '@/lib/admin/tags'
import { createAdminClient } from '@/lib/supabase/admin'
import { isAdFormat, sanitizeCreativeHtml, validateCreative, type AdFormat } from '@/lib/ads/creatives'
import { enqueueUser, listingNotifyTarget, submissionNotifyTarget } from '@/lib/notify/queue'

export type { ContentDraftInput } from './content-validation'

/**
 * Server Functions for the admin section. Every mutation checks authorization
 * via assertStaff/assertAdmin (which throw plain Errors the client can catch),
 * performs the change through the service-role client, then revalidates the
 * affected paths so the UI reflects the new state.
 */

type ActionResult = { ok: true } | { ok: false; error: string }


const LOCALES = ['en', 'fr'] as const;

/** Revalidate a locale-free path in both locales (routes live under /[locale]). */
function revalidateLocalized(path: string) {
    for (const locale of LOCALES) revalidatePath('/'+locale+path);
}

/**
 * Phase 4.1 (audit §4.1) — on-demand invalidation of the public content cache.
 * The hot news reads and the homepage dataset are cached under the `news` /
 * `home` tags (lib/queries/news.ts, lib/queries/home.ts); every editorial
 * mutation that changes public content calls this so changes land without
 * waiting for the 5-minute ISR window. Uses the two-argument revalidateTag
 * form (single-arg is deprecated in Next 16); profile 'max' serves the cached
 * render while the fresh one regenerates (stale-while-revalidate).
 */
function revalidatePublicContentCache() {
    revalidateTag(CACHE_TAGS.news, 'max')
    revalidateTag(CACHE_TAGS.home, 'max')
}

/** On-demand invalidation for the ad-serving cache (lib/queries/ads.ts). */
function revalidateAdsCache() {
    revalidateTag(CACHE_TAGS.ads, 'max')
    revalidateTag(CACHE_TAGS.home, 'max')
}

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
}

type AuditEntry = {
  action: string
  contentItemId?: string | null
  entityType?: string | null
  entityId?: string | null
  submissionId?: string | null
  fromStatus?: string | null
  toStatus?: string | null
  notes?: string | null
}

/**
 * Best-effort audit trail: records who did what in moderation_log (the same
 * table the audit-log page reads). Non-content entities (polls, users, ads,
 * policies, …) have no dedicated column, so the entity id travels in `notes`.
 * Never fails the action — a logging problem must not roll back an
 * already-applied change.
 */
async function audit(
  supabase: AdminContext['supabase'],
  actorId: string,
  entry: AuditEntry,
): Promise<void> {
  try {
    await supabase.from('moderation_log').insert({
      action: entry.action,
      content_item_id: entry.contentItemId ?? null,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      submission_id: entry.submissionId ?? null,
      from_status: entry.fromStatus ?? null,
      to_status: entry.toStatus ?? null,
      notes: entry.notes ?? null,
      actor_id: actorId,
    })
  } catch {
    // Audit must never break the admin action itself.
  }
}

/* ------------------------------------------------------------------ */
/* Moderation                                                          */
/* ------------------------------------------------------------------ */

/** submission_type → content_type (buy_sell submissions become listing items). */
const SUBMISSION_TO_CONTENT: Record<string, string> = {
  photo_story: 'photo_story',
  news: 'news',
  culture: 'culture',
  notice: 'notice',
  buy_sell: 'listing',
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** Find a unique slug, appending -2, -3… when the base collides. */
async function uniqueSlug(supabase: AdminContext['supabase'], base: string): Promise<string> {
  const root = slugify(base) || 'submission'
  for (let i = 1; i <= 50; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`
    const { data } = await supabase.from('content_items').select('id').eq('slug', candidate).limit(1)
    if (!data || data.length === 0) return candidate
  }
  return `${root}-${Date.now()}`
}

/** Sync media_assets rows for a content item: delete dropped ids, insert new URLs. */
async function syncPhotos(
  supabase: AdminContext['supabase'],
  contentItemId: string,
  photos: { url: string; caption?: string; credit?: string }[],
  keepPhotoIds: string[],
  credit: string | null,
  attachments: { url: string; kind?: 'video' | 'audio' | 'document' | 'image'; caption?: string }[] = [],
): Promise<void> {
  const { data: existing } = await supabase
    .from('media_assets')
    .select('id, provider, storage_key')
    .eq('content_item_id', contentItemId)
  for (const row of existing ?? []) {
    if (!keepPhotoIds.includes(row.id)) {
      await deleteStoredMedia(supabase, row as { provider: string; storage_key: string | null })
      const { error } = await supabase.from('media_assets').delete().eq('id', row.id)
      if (error) throw new Error(`Could not remove photo metadata: ${error.message}`)
    }
  }
  const newPhotos = photos.filter((p) => p.url.trim())
  const newAttachments = attachments.filter((a) => a.url.trim())
  if (newPhotos.length === 0 && newAttachments.length === 0) return
  const { count } = await supabase
    .from('media_assets')
    .select('id', { count: 'exact', head: true })
    .eq('content_item_id', contentItemId)
  const startIndex = count ?? 0
  const rows = [
    ...newPhotos.map((photo, index) => ({
      content_item_id: contentItemId,
      kind: 'image' as const,
      provider: 'r2' as const,
      destination: 'public_photo' as const,
      public_url: photo.url.trim(),
      caption: photo.caption?.trim() || null,
      alt_text: photo.caption?.trim() || null,
      photographer_credit: photo.credit?.trim() || credit,
      sort_order: startIndex + index,
      is_cover: startIndex + index === 0,
    })),
    ...newAttachments.map((att, index) => ({
      content_item_id: contentItemId,
      kind: (att.kind ?? 'video') as 'video' | 'audio' | 'document' | 'image',
      provider: 'r2' as const,
      destination: 'public_photo' as const,
      public_url: att.url.trim(),
      caption: att.caption?.trim() || null,
      alt_text: att.caption?.trim() || null,
      photographer_credit: credit,
      sort_order: startIndex + newPhotos.length + index,
      is_cover: false,
    })),
  ]
  const { error } = await supabase.from('media_assets').insert(rows)
  if (error) throw new Error(`Could not save photos: ${error.message}`)
}

async function deleteStoredMedia(
  supabase: AdminContext['supabase'],
  media: { provider: string; storage_key: string | null },
): Promise<void> {
  if (!media.storage_key) return
  if (media.provider === 'r2') {
    await deleteFromR2(media.storage_key)
    return
  }
  if (media.provider === 'supabase') {
    const { error } = await supabase.storage.from(storageConfig.supabase.bucket).remove([media.storage_key])
    if (error) throw new Error(`Could not remove stored media: ${error.message}`)
  }
}

/**
 * Upsert the en/fr translations for a content item. SEO description and
 * byline are only written when the caller provides them (undefined = keep
 * the stored value), so an edit never silently wipes imported SEO text.
 */
async function upsertTranslations(
  supabase: AdminContext['supabase'],
  contentItemId: string,
  translations: {
    locale: 'en' | 'fr'
    title: string
    excerpt?: string
    body?: string
    seoDescription?: string | null
    byline?: string | null
  }[],
): Promise<void> {
  for (const t of translations) {
    if (!t.title?.trim() && !t.body?.trim()) continue
    const payload: Record<string, unknown> = {
      content_item_id: contentItemId,
      locale: t.locale,
      voice: 'formal',
      title: t.title?.trim() || null,
      excerpt: t.excerpt?.trim() || null,
      body: t.body?.trim() || null,
    }
    if (t.seoDescription !== undefined) payload.seo_description = t.seoDescription?.trim() || null
    if (t.byline !== undefined) payload.byline = t.byline?.trim() || null
    const { error } = await supabase.from('content_translations').upsert(
      payload,
      { onConflict: 'content_item_id,locale,voice' },
    )
    if (error) throw new Error(`Could not save the ${t.locale} translation: ${error.message}`)
  }
}

/**
 * Legacy quick-approve kept for the queue list + review-screen buttons: marks
 * the submission approved without building a content item (the Phase 3
 * approve-with-content drawer handles the full publish path). Notes are only
 * overwritten when explicitly passed, so approving never wipes a teammate's
 * saved internal notes.
 */
export async function approveSubmission(submissionId: string, notes?: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('moderate')
    const now = new Date().toISOString()

    const { data: sub } = await supabase
      .from('submissions')
      .select('id, status')
      .eq('id', submissionId)
      .single()

    if (!sub) return { ok: false, error: 'Submission not found.' }
    if (!['pending', 'in_review', 'needs_clarification'].includes(sub.status)) {
      return { ok: false, error: `Submission is ${sub.status} and cannot be approved.` }
    }

    const patch: Record<string, unknown> = { status: 'approved', reviewed_at: now, reviewed_by: user.id }
    if (notes !== undefined) patch.internal_notes = notes
    const { error } = await supabase.from('submissions').update(patch).eq('id', submissionId)
    if (error) return { ok: false, error: error.message }

    await supabase.from('moderation_log').insert({
      action: 'approve', to_status: 'approved', notes: notes ?? null,
      submission_id: submissionId, actor_id: user.id,
    })

    revalidateLocalized('/admin/moderation')
    revalidateLocalized('/admin/moderation/[id]')
    void submissionNotifyTarget(supabase, submissionId).then((t) =>
      enqueueUser('submission.approved', t.userId, { title: t.title }, '/account/submissions'),
    )
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Approve a submission AND create the real content item in one step (Phase 3
 * core loop): bilingual translations, photos as media_assets, location /
 * category / verification, the listing/notice extension row, and the publish
 * mode (now / scheduled / draft). Replaces the old bare-row approve that
 * left approved submissions unpublishable.
 */
export async function approveSubmissionWithContent(input: {
  submissionId: string
  draft: ContentDraftInput
  publish: 'now' | 'schedule' | 'draft'
  scheduledFor?: string
  expiresAt?: string | null
  notes?: string
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('moderate')
    const now = new Date().toISOString()

    const { data: sub } = await supabase
      .from('submissions')
      .select('id, submission_type, status, content_item_id, submitted_by')
      .eq('id', input.submissionId)
      .single()
    if (!sub) return { ok: false, error: 'Submission not found.' }
    if (sub.content_item_id) {
      return { ok: false, error: 'This submission already has a content item — use the edit drawer on it instead.' }
    }
    if (!['pending', 'in_review', 'needs_clarification'].includes(sub.status)) {
      return { ok: false, error: `Submission is ${sub.status} and cannot be approved.` }
    }

    const contentType = SUBMISSION_TO_CONTENT[sub.submission_type]
    if (!contentType) return { ok: false, error: `Unknown submission type ${sub.submission_type}.` }

    const validationError = validateContentDraft(input.draft, input.publish !== 'draft')
    if (validationError) return { ok: false, error: validationError }
    if (input.publish === 'schedule' && !input.scheduledFor) {
      return { ok: false, error: 'A schedule date is required when scheduling.' }
    }

    const statusPatch =
      input.publish === 'now' ? { status: 'published', published_at: now } :
      input.publish === 'schedule' ? { status: 'scheduled', scheduled_for: input.scheduledFor } :
      { status: 'draft' }
    const expiresAt = input.expiresAt || null

    const slug = await uniqueSlug(supabase, input.draft.slugBase || 'submission')
    const { data: created, error: createErr } = await supabase
      .from('content_items')
      .insert({
        type: contentType,
        slug,
        status: 'draft', // flipped to the target status once child rows exist
        verification: input.draft.verification ?? null,
        location_id: input.draft.locationId || null,
        category_id: input.draft.categoryId || null,
        submitted_by: sub.submitted_by ?? null,
        expires_at: expiresAt,
      })
      .select('id')
      .single()
    if (createErr || !created) return { ok: false, error: createErr?.message ?? 'Could not create the content item.' }

    try {
      await upsertTranslations(supabase, created.id, input.draft.translations)
      if ((input.draft.photos ?? []).length > 0 || (input.draft.attachments ?? []).length > 0) {
        await syncPhotos(supabase, created.id, input.draft.photos ?? [], [], input.draft.photographerCredit ?? null, input.draft.attachments ?? [])
      }
      if (contentType === 'listing') {
        const { error: lErr } = await supabase.from('listings').insert({
          content_item_id: created.id,
          price: input.draft.listing?.price ?? null,
          currency: input.draft.listing?.currency?.toUpperCase().slice(0, 3) ?? 'XAF',
          listing_status: 'active',
          contact_phone: input.draft.listing?.contactPhone ?? null,
          contact_email: input.draft.listing?.contactEmail ?? null,
          whatsapp_number: input.draft.listing?.whatsappNumber ?? null,
        })
        if (lErr) throw new Error(`Could not create the listing: ${lErr.message}`)
      }
      if (contentType === 'notice') {
        const { error: nErr } = await supabase.from('notices').insert({
          content_item_id: created.id,
          notice_type: input.draft.notice?.noticeType ?? 'other',
          organization_name: input.draft.notice?.organizationName ?? null,
          contact_phone: input.draft.notice?.contactPhone ?? null,
          notice_date: input.draft.notice?.noticeDate ?? null,
          expiry_date: input.draft.notice?.expiryDate ?? expiresAt,
          is_official: input.draft.verification === 'official_source' || input.draft.notice?.isOfficial === true,
        })
        if (nErr) throw new Error(`Could not create the notice: ${nErr.message}`)
      }
    } catch (e) {
      // Roll the half-built item back so a retry doesn't collide on the slug.
      await supabase.from('content_items').delete().eq('id', created.id)
      return fail(e)
    }

    const { error: flipErr } = await supabase.from('content_items').update(statusPatch).eq('id', created.id)
    if (flipErr) return { ok: false, error: flipErr.message }

    const approvePatch: Record<string, unknown> = {
      status: 'approved', reviewed_at: now, reviewed_by: user.id, content_item_id: created.id,
    }
    if (input.notes !== undefined) approvePatch.internal_notes = input.notes
    await supabase.from('submissions').update(approvePatch).eq('id', input.submissionId)

    await supabase.from('moderation_log').insert({
      action: input.publish === 'now' ? 'approve_publish' : input.publish === 'schedule' ? 'approve_schedule' : 'approve_draft',
      to_status: input.publish === 'draft' ? 'draft' : input.publish === 'schedule' ? 'scheduled' : 'published',
      notes: input.notes ?? null,
      submission_id: input.submissionId,
      content_item_id: created.id,
      actor_id: user.id,
    })

    if (input.publish !== 'draft') revalidatePublicContentCache()
    revalidateLocalized('/admin/moderation')
    revalidateLocalized('/admin/moderation/[id]')
    revalidateLocalized('/admin/content')
    revalidateLocalized('/admin/dashboard')
    if (input.publish !== 'draft') {
      const enTitle = input.draft.translations.find((t) => t.locale === 'en')?.title?.trim() || 'your submission'
      void enqueueUser('submission.approved', sub.submitted_by, { title: enTitle.slice(0, 140) }, '/account/submissions')
    }
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

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
      .select('id, type, slug')
      .eq('id', contentItemId)
      .single()
    if (!item) return { ok: false, error: 'Content item not found.' }

    const changed: string[] = []
    const patch: Record<string, unknown> = {}
    if (draft.verification !== undefined) patch.verification = draft.verification
    if (draft.locationId !== undefined) patch.location_id = draft.locationId || null
    if (draft.categoryId !== undefined) patch.category_id = draft.categoryId || null
    // Publish date: only applied when a non-empty value is sent — clearing it
    // on a published post would hide it from the public queries.
    if (draft.publishedAt !== undefined && draft.publishedAt) {
      const ts = new Date(draft.publishedAt)
      if (!Number.isNaN(ts.getTime())) {
        patch.published_at = ts.toISOString()
        changed.push('publishedAt')
      }
    }
    // Permalink: slugified + collision-suffixed only when the editor changed it.
    if (draft.slug !== undefined && draft.slug.trim() && draft.slug.trim() !== item.slug) {
      patch.slug = await uniqueSlug(supabase, draft.slug)
      changed.push('slug')
    }
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('content_items').update(patch).eq('id', contentItemId)
      if (error) return { ok: false, error: error.message }
    }

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
        const { error } = await supabase.from('listings').update(lPatch).eq('content_item_id', contentItemId)
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

const CONTENT_TYPES = ['photo_story', 'news', 'listing', 'notice', 'culture'] as const

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
        author_id: user.id,
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

/** Client-callable content search for homepage-slot assignment (capability-gated). */
export async function searchContentForSlot(query: string, limit = 10) {
  await assertCapability('manageContent')
  return queryContentForSlotAssign(query, limit)
}

export async function rejectSubmission(submissionId: string, reason: string): Promise<ActionResult> {
  try {
    if (!reason.trim()) return { ok: false, error: 'A reason is required when rejecting.' }
    const { supabase, user } = await assertStaff()
    const now = new Date().toISOString()

    const { data: sub } = await supabase.from('submissions').select('id, status').eq('id', submissionId).single()
    if (!sub) return { ok: false, error: 'Submission not found.' }
    if (!['pending', 'in_review', 'needs_clarification'].includes(sub.status)) {
      return { ok: false, error: `Submission is ${sub.status} and cannot be rejected.` }
    }

    await supabase.from('submissions').update({ status: 'rejected', reviewed_at: now, rejection_reason: reason }).eq('id', submissionId)
    await supabase.from('moderation_log').insert({
      action: 'reject', to_status: 'rejected', notes: reason,
      submission_id: submissionId, actor_id: user.id,
    })

    revalidateLocalized('/admin/moderation')
    revalidateLocalized('/admin/moderation/[id]')
    void submissionNotifyTarget(supabase, submissionId).then((t) =>
      enqueueUser('submission.rejected', t.userId, { title: t.title, reason: reason.trim().slice(0, 280) }, '/account/submissions'),
    )
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function updateSubmissionNotes(submissionId: string, notes: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertStaff()
    const { error } = await supabase.from('submissions').update({ internal_notes: notes }).eq('id', submissionId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'submission:notes', submissionId })
    revalidateLocalized('/admin/moderation')
    revalidateLocalized('/admin/moderation/[id]')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Bulk moderation: run the same capability- and status-checked single
 * operations over a selection. Sequential on purpose — one HTTP round trip
 * for the whole selection, with a per-item failure count surfaced to the UI.
 */
export async function bulkApproveSubmissions(ids: string[]): Promise<ActionResult> {
  let failed = 0
  for (const id of ids) {
    const result = await approveSubmission(id)
    if (!result.ok) failed += 1
  }
  return failed > 0 ? { ok: false, error: `${failed} of ${ids.length} submission(s) failed.` } : { ok: true }
}

export async function bulkRejectSubmissions(ids: string[], reason: string): Promise<ActionResult> {
  if (!reason.trim()) return { ok: false, error: 'A reason is required when rejecting.' }
  let failed = 0
  for (const id of ids) {
    const result = await rejectSubmission(id, reason)
    if (!result.ok) failed += 1
  }
  return failed > 0 ? { ok: false, error: `${failed} of ${ids.length} submission(s) failed.` } : { ok: true }
}

/* ------------------------------------------------------------------ */
/* Clarification & reopen (Phase 3 moderation loop)                    */
/* ------------------------------------------------------------------ */

/**
 * Phase 3 clarification loop: send a submission back with a question instead
 * of rejecting it. The question is appended to the internal notes (visible on
 * the review screen) and the status moves to needs_clarification so it leaves
 * the pending queue without a final decision.
 */
export async function requestClarification(submissionId: string, question: string): Promise<ActionResult> {
  try {
    if (!question.trim()) return { ok: false, error: 'A question is required when requesting clarification.' }
    const { supabase, user } = await assertCapability('moderate')
    const now = new Date().toISOString()

    const { data: sub } = await supabase
      .from('submissions')
      .select('id, status, internal_notes')
      .eq('id', submissionId)
      .single()
    if (!sub) return { ok: false, error: 'Submission not found.' }
    if (!['pending', 'in_review'].includes(sub.status)) {
      return { ok: false, error: `Submission is ${sub.status} and cannot be sent back for clarification.` }
    }

    const notes = `${(sub.internal_notes ?? '').trim()}${sub.internal_notes ? '\n\n' : ''}[needs clarification] ${question.trim()}`
    await supabase
      .from('submissions')
      .update({ status: 'needs_clarification', internal_notes: notes, reviewed_at: now })
      .eq('id', submissionId)
    await supabase.from('moderation_log').insert({
      action: 'request_clarification',
      to_status: 'needs_clarification',
      notes: question,
      submission_id: submissionId,
      actor_id: user.id,
    })

    revalidateLocalized('/admin/moderation')
    revalidateLocalized('/admin/moderation/[id]')
    void submissionNotifyTarget(supabase, submissionId).then((t) =>
      enqueueUser('submission.clarification', t.userId, { title: t.title, question: question.trim().slice(0, 280) }, '/account/submissions'),
    )
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Reopen a rejected / withdrawn / needs-clarification submission for review.
 * It goes back to in_review — visible in the clarification tab and approvable
 * from the review drawer.
 */
export async function reopenSubmission(submissionId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('moderate')
    const { data: sub } = await supabase.from('submissions').select('id, status').eq('id', submissionId).single()
    if (!sub) return { ok: false, error: 'Submission not found.' }
    if (!['rejected', 'needs_clarification', 'withdrawn'].includes(sub.status)) {
      return { ok: false, error: `Submission is ${sub.status} and cannot be reopened.` }
    }

    await supabase
      .from('submissions')
      .update({ status: 'in_review', reviewed_at: new Date().toISOString() })
      .eq('id', submissionId)
    await supabase.from('moderation_log').insert({
      action: 'reopen',
      from_status: sub.status,
      to_status: 'in_review',
      submission_id: submissionId,
      actor_id: user.id,
    })

    revalidateLocalized('/admin/moderation')
    revalidateLocalized('/admin/moderation/[id]')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Permanent submission delete (admin only, Phase 2 cleanup). Removes the
 * submission row + its moderation_log history; approved submissions keep
 * their already-published content item.
 */
export async function deleteSubmission(submissionId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertAdmin()
    const { data: row } = await supabase.from('submissions').select('id, status, submission_type').eq('id', submissionId).limit(1)
    const found = (row ?? [])[0] as { id: string; status: string; submission_type: string } | undefined
    if (!found) return { ok: false, error: 'Submission not found.' }

    const { error } = await supabase.from('submissions').delete().eq('id', submissionId)
    if (error) return { ok: false, error: error.message }

    await audit(supabase, user.id, {
      action: 'moderation:delete',
      submissionId,
      notes: `${found.submission_type}/${found.status}`,
    })
    revalidateLocalized('/admin/moderation')
    revalidateLocalized('/admin/moderation/[id]')
    revalidateLocalized('/admin/dashboard')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Content status transitions                                          */
/* ------------------------------------------------------------------ */

export async function updateContentStatus(contentId: string, status: string, scheduledFor?: string): Promise<ActionResult> {
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

    const { error } = await supabase.from('content_items').update(patch).eq('id', contentId)
    if (error) return { ok: false, error: error.message }

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

export async function setContentFeatured(contentId: string, isFeatured: boolean): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertStaff()
    const { error } = await supabase.from('content_items').update({ is_featured: isFeatured }).eq('id', contentId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'content:featured',
      contentItemId: contentId,
      toStatus: isFeatured ? 'featured' : 'unfeatured',
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

/* ------------------------------------------------------------------ */
/* Homepage curation                                                  */
/* ------------------------------------------------------------------ */

export async function assignHomepageSlot(slotId: string, contentItemId: string | null): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertStaff()
    const { error } = await supabase.from('homepage_slots').update({ content_item_id: contentItemId }).eq('id', slotId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'slot:assign',
      notes: `slot=${slotId} content=${contentItemId ?? 'none'}`,
    })
    revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    revalidateLocalized('/admin/dashboard')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function toggleSlotActive(slotId: string, isActive: boolean): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertStaff()
    const { error } = await supabase.from('homepage_slots').update({ is_active: isActive }).eq('id', slotId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'slot:status',
      toStatus: isActive ? 'active' : 'inactive',
      notes: `slot=${slotId}`,
    })
    revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function createHomepageSlot(input: { slotKey: string; sortOrder?: number; startsAt?: string | null; endsAt?: string | null }): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const slotKey = input.slotKey.trim()
    if (!slotKey) return { ok: false, error: 'A slot key is required.' }
    if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) return { ok: false, error: 'Slot end must be after its start.' }
    const { error } = await supabase.from('homepage_slots').insert({ slot_key: slotKey, sort_order: input.sortOrder ?? 0, starts_at: input.startsAt || null, ends_at: input.endsAt || null, created_by: user.id })
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'slot:create', entityType: 'homepage_slot', notes: slotKey })
    revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    revalidateLocalized('/')
    return { ok: true }
  } catch (e) { return fail(e) }
}

/** Delete a homepage slot (staff). Content keeps its own status — only the slot goes away. */
export async function deleteHomepageSlot(slotId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const { data: row } = await supabase.from('homepage_slots').select('id, slot_key').eq('id', slotId).limit(1)
    const found = (row ?? [])[0] as { id: string; slot_key: string } | undefined
    if (!found) return { ok: false, error: 'Slot not found.' }

    const { error } = await supabase.from('homepage_slots').delete().eq('id', slotId)
    if (error) return { ok: false, error: error.message }

    await audit(supabase, user.id, { action: 'slot:delete', entityType: 'homepage_slot', notes: found.slot_key })
    revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    revalidateLocalized('/')
    return { ok: true }
  } catch (e) { return fail(e) }
}

/** Swap a homepage slot's sort_order with its up/down neighbour. */
export async function reorderHomepageSlot(slotId: string, direction: 'up' | 'down'): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const { data: rows } = await supabase
      .from('homepage_slots')
      .select('id, sort_order')
      .order('sort_order', { ascending: true })
    const ordered = (rows ?? []) as { id: string; sort_order: number }[]
    const idx = ordered.findIndex((r) => r.id === slotId)
    if (idx === -1) return { ok: false, error: 'Slot not found.' }
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= ordered.length) return { ok: false, error: 'Already at the edge.' }

    const a = ordered[idx]
    const b = ordered[swapIdx]
    await supabase.from('homepage_slots').update({ sort_order: b.sort_order }).eq('id', a.id)
    await supabase.from('homepage_slots').update({ sort_order: a.sort_order }).eq('id', b.id)

    await audit(supabase, user.id, { action: 'slot:reorder', entityType: 'homepage_slot', notes: `${a.id} ${direction}` })
    revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    revalidateLocalized('/')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function queueStorageVerification(mediaId?: string): Promise<ActionResult & { count?: number }> {
  try {
    const { supabase, user } = await assertAdmin()
    let query = supabase.from('media_assets').select('id').eq('verification_status', 'pending')
    if (mediaId) query = query.eq('id', mediaId)
    const { data, error } = await query
    if (error) return { ok: false, error: error.message }
    if (!data?.length) return { ok: false, error: 'Nothing to verify — no pending assets found.' }
    if (data?.length) {
      const { error: taskError } = await supabase.from('storage_tasks').insert(data.map((row) => ({ media_id: row.id, task_type: 'verify' })))
      if (taskError) return { ok: false, error: taskError.message }
    }
    await audit(supabase, user.id, { action: 'storage:verify:queue', notes: `count=${data?.length ?? 0}` })
    revalidateLocalized('/admin/storage-backup')
    return { ok: true, count: data?.length ?? 0 }
  } catch (e) { return fail(e) }
}

/**
 * Permanently delete one media asset from the Storage tab (admin-only): the
 * stored object is removed from its provider first, then the metadata row
 * (cascades media_text_variants + pending storage_tasks; ad creatives fall
 * back to null via their SET NULL FK). Mirrors deleteContentItem's hardened
 * pattern — authorize (assertAdmin) → destructive work on the service-role
 * client so RLS can never veto an admin cleanup → surfaced per-step errors →
 * audit. The B2 backup copy is intentionally left in place: it is the
 * disaster-recovery mirror, and no B2 delete path is wired.
 */
export async function deleteMediaAsset(mediaId: string): Promise<ActionResult> {
  try {
    const { user } = await assertAdmin()
    const admin = createAdminClient()
    const { data: rows, error: lookupErr } = await admin
      .from('media_assets')
      .select('id, provider, storage_key, content_item_id')
      .eq('id', mediaId)
      .limit(1)
    if (lookupErr) return { ok: false, error: lookupErr.message }
    const row = (rows ?? [])[0] as
      | { id: string; provider: string; storage_key: string | null; content_item_id: string | null }
      | undefined
    if (!row) return { ok: false, error: 'Asset not found.' }

    await deleteStoredMedia(admin, row)

    const { error } = await admin.from('media_assets').delete().eq('id', mediaId)
    if (error) return { ok: false, error: error.message }

    await audit(admin, user.id, {
      action: 'storage:asset:delete',
      entityType: 'media_asset',
      notes: row.storage_key ?? row.id,
    })
    revalidateLocalized('/admin/storage-backup')
    return { ok: true }
  } catch (e) { return fail(e) }
}

/* ------------------------------------------------------------------ */
/* User roles (admin only)                                             */
/* ------------------------------------------------------------------ */

export async function setUserRole(
  userId: string,
  role: AppRole,
  assign: boolean,
  confirmPassword?: string,
): Promise<ActionResult> {
  try {
    // Granting or revoking admin is privilege escalation in both directions —
    // require password re-confirmation (Phase 5: reauth for role changes).
    const { supabase, user } = role === 'admin'
      ? await assertReauth(confirmPassword)
      : await assertAdmin()
    if (!assign && userId === user.id && role === 'admin') return { ok: false, error: 'You cannot remove your own admin role.' }
    if (!assign && role === 'admin') {
      const { count } = await supabase.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'admin')
      if ((count ?? 0) <= 1) return { ok: false, error: 'The last administrator cannot be removed.' }
    }
    if (assign) {
      const { error } = await supabase.from('user_roles').upsert({ user_id: userId, role })
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', role)
      if (error) return { ok: false, error: error.message }
    }
    await audit(supabase, user.id, {
      action: assign ? 'user:role:assign' : 'user:role:remove',
      notes: `user=${userId} role=${role}`,
    })
    revalidateLocalized('/admin/users')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function setUserStatus(
  userId: string,
  status: 'active' | 'suspended' | 'banned',
  confirmPassword?: string,
): Promise<ActionResult> {
  try {
    // Suspending or banning someone cuts their access — reconfirm the acting
    // admin's password first (Phase 5: reauth for suspension/ban).
    const { supabase, user } = status === 'active'
      ? await assertAdmin()
      : await assertReauth(confirmPassword)
    if (userId === user.id) return { ok: false, error: 'You cannot change your own account status.' }
    const { data: targetRoles } = await supabase.from('user_roles').select('role').eq('user_id', userId)
    if ((status !== 'active') && (targetRoles ?? []).some((row) => row.role === 'admin')) {
      const { count } = await supabase.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'admin')
      if ((count ?? 0) <= 1) return { ok: false, error: 'The last administrator cannot be disabled.' }
    }
    const { error } = await supabase.from('profiles').update({ is_suspended: status === 'suspended', is_banned: status === 'banned' }).eq('id', userId)
    if (error) return { ok: false, error: error.message }
    // Mirror the status into Supabase Auth (Phase 5: session/token revocation):
    // banning revokes all of the user's refresh tokens, so a banned user's
    // live session dies when their short-lived access token expires instead of
    // surviving indefinitely. Restoring lifts any auth-level ban. Suspension
    // stays a soft profile flag by design (blocks the next login only).
    const { error: authError } = await createAdminClient().auth.admin.updateUserById(userId, {
      ban_duration: status === 'banned' ? '876000h' : 'none',
    })
    if (authError) return { ok: false, error: authError.message }
    await audit(supabase, user.id, { action: `user:${status}`, entityType: 'profile', entityId: userId })
    revalidateLocalized('/admin/users')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function deleteUser(userId: string, confirmPassword?: string): Promise<ActionResult> {
  try {
    // Account deletion is irreversible (GDPR erasure path) — reconfirm first.
    const { supabase, user } = await assertReauth(confirmPassword)
    if (userId === user.id) return { ok: false, error: 'You cannot delete your own account.' }
    const { data: adminRole } = await supabase.from('user_roles').select('user_id').eq('user_id', userId).eq('role', 'admin').limit(1)
    if (adminRole?.length) {
      const { count } = await supabase.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'admin')
      if ((count ?? 0) <= 1) return { ok: false, error: 'The last administrator cannot be deleted.' }
    }
    await supabase.from('content_items').update({ author_id: null, submitted_by: null }).eq('author_id', userId)
    const { error: profileError } = await supabase.from('profiles').delete().eq('id', userId)
    if (profileError) return { ok: false, error: profileError.message }
    const { error } = await createAdminClient().auth.admin.deleteUser(userId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'user:delete', entityType: 'profile', entityId: userId })
    revalidateLocalized('/admin/users')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function updateContributorCuration(userId: string, input: { featured: boolean; bioOverride?: string | null }): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertAdmin()
    const { error } = await supabase.from('profiles').update({ contributor_featured: input.featured, contributor_bio_override: input.bioOverride?.trim() || null }).eq('id', userId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'user:contributor:update', entityType: 'profile', entityId: userId })
    revalidateLocalized('/admin/users')
    revalidateLocalized('/contributors')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function updateUserProfile(
  userId: string,
  input: { displayName?: string | null; fullName?: string | null; phone?: string | null },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageUsers')
    const patch: Record<string, string | null> = {}
    if (input.displayName !== undefined) patch.display_name = input.displayName?.trim() || null
    if (input.fullName !== undefined) patch.full_name = input.fullName?.trim() || null
    if (input.phone !== undefined) {
      const phone = input.phone?.trim() || null
      if (phone && !/^[+\d][\d\s\-().]{5,29}$/.test(phone)) return { ok: false, error: 'Enter a valid phone number.' }
      patch.phone = phone
    }
    if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to update.' }
    const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'user:profile:update', entityType: 'profile', entityId: userId })
    revalidateLocalized('/admin/users')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function inviteUser(email: string, role: AppRole = 'contributor', confirmPassword?: string): Promise<ActionResult> {
  try {
    // Inviting an admin is privilege escalation — require step-up reauth,
    // mirroring setUserRole's admin gate.
    const { supabase, user } = role === 'admin'
      ? await assertReauth(confirmPassword)
      : await assertAdmin()
    const normalized = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(normalized)) return { ok: false, error: 'Enter a valid email address.' }
    const { data, error } = await createAdminClient().auth.admin.inviteUserByEmail(normalized)
    if (error || !data.user) return { ok: false, error: error?.message ?? 'Could not send invite.' }
    const { error: roleError } = await supabase.from('user_roles').upsert({ user_id: data.user.id, role })
    if (roleError) return { ok: false, error: roleError.message }
    await audit(supabase, user.id, { action: 'user:invite', entityType: 'profile', entityId: data.user.id, notes: normalized })
    revalidateLocalized('/admin/users')
    return { ok: true }
  } catch (e) { return fail(e) }
}

/* ------------------------------------------------------------------ */
/* Ads                                                                */
/* ------------------------------------------------------------------ */

export async function createAdvertiser(input: { companyName: string; contactName?: string; email?: string; phone?: string }): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { error } = await supabase.from('advertisers').insert({
      company_name: input.companyName,
      contact_name: input.contactName ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
    })
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'advertiser:create', notes: input.companyName })
    revalidateLocalized('/admin/ads')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function createAdCampaign(input: {
  slotId: string
  advertiserId: string
  name: string
  destinationUrl?: string
  copyText?: string
  startsAt?: string
  endsAt?: string
  agreedPrice?: number
  currency?: string
  creativeType?: string
  creativeMediaId?: string | null
  mobileCreativeMediaId?: string | null
  posterMediaId?: string | null
  creativeHtml?: string | null
  creativeWidth?: number | null
  creativeHeight?: number | null
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    if (input.destinationUrl && !/^https:\/\//i.test(input.destinationUrl.trim())) return { ok: false, error: 'Ad destination must use https://.' }
    if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) return { ok: false, error: 'Campaign end must be after its start.' }
    const creativeType: AdFormat = isAdFormat(input.creativeType) ? input.creativeType : 'sponsored'
    const creative = await resolveCreativeMedia(supabase, {
      creativeMediaId: input.creativeMediaId,
      mobileCreativeMediaId: input.mobileCreativeMediaId,
      posterMediaId: input.posterMediaId,
      kind: creativeType,
    })
    if (typeof creative === 'string') return { ok: false, error: creative }
    const slot = await getSlotConstraints(supabase, input.slotId)
    const html = creativeType === 'html' ? sanitizeCreativeHtml(input.creativeHtml) : null
    const creativeError = validateCreative({
      format: creativeType,
      allowedFormats: slot?.allowedFormats ?? null,
      maxDurationSeconds: slot?.maxDurationSeconds ?? null,
      desktopUrl: creative.desktopUrl,
      mobileUrl: creative.mobileUrl,
      posterUrl: creative.posterUrl,
      html: creativeType === 'html' ? (html ?? input.creativeHtml ?? null) : null,
      durationSeconds: creative.durationSeconds,
      destinationUrl: input.destinationUrl,
    })
    if (creativeError) return { ok: false, error: creativeError }
    const { error } = await supabase.from('ad_campaigns').insert({
      ad_slot_id: input.slotId,
      advertiser_id: input.advertiserId,
      name: input.name,
      destination_url: input.destinationUrl ?? null,
      copy_text: input.copyText ?? null,
      starts_at: input.startsAt ?? null,
      ends_at: input.endsAt ?? null,
      agreed_price: input.agreedPrice ?? null,
      currency: input.currency ?? null,
      status: 'active',
      creative_type: creativeType,
      creative_media_id: creative.desktopId,
      mobile_creative_media_id: creative.mobileId,
      poster_media_id: creative.posterId,
      creative_html: html,
      creative_width: input.creativeWidth ?? null,
      creative_height: input.creativeHeight ?? null,
      creative_status: creativeType === 'sponsored' ? 'approved' : 'pending',
    })
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'ad:campaign:create',
      notes: `${input.name} slot=${input.slotId} advertiser=${input.advertiserId} format=${creativeType}`,
    })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Resolve creative media references (media_assets id OR https URL) to public
 * https URLs (+ duration) for validation, creating lightweight media_assets
 * rows for pasted URLs so the FK columns stay the single source of truth
 * (same pattern as content syncPhotos). Returns the urls or an error string.
 */
async function resolveCreativeMedia(
  supabase: AdminContext['supabase'],
  input: { creativeMediaId?: string | null; mobileCreativeMediaId?: string | null; posterMediaId?: string | null; kind?: AdFormat },
): Promise<{ desktopId: string | null; mobileId: string | null; posterId: string | null; desktopUrl: string | null; mobileUrl: string | null; posterUrl: string | null; durationSeconds: number | null } | string> {
  const pick = async (ref: string | null | undefined, kind: AdFormat): Promise<{ id: string; url: string | null; duration: number | null } | string> => {
    if (!ref) return { id: '', url: null, duration: null } as unknown as { id: string; url: string | null; duration: number | null }
    const value = ref.trim()
    if (/^https?:\/\//i.test(value)) {
      if (!/^https:\/\//i.test(value)) return 'Creative links must use https://.'
      const { data: existing } = await supabase.from('media_assets').select('id, public_url, duration_seconds').eq('public_url', value).limit(1).maybeSingle()
      if (existing) {
        const row = existing as { id: string; public_url: string | null; duration_seconds: number | null }
        return { id: row.id, url: row.public_url, duration: row.duration_seconds }
      }
      const { data: inserted, error } = await supabase
        .from('media_assets')
        .insert({ kind, provider: 'r2', destination: 'public_photo', public_url: value })
        .select('id, public_url, duration_seconds')
        .single()
      if (error || !inserted) return 'Could not save the creative link.'
      const row = inserted as { id: string; public_url: string | null; duration_seconds: number | null }
      return { id: row.id, url: row.public_url, duration: row.duration_seconds }
    }
    const { data, error } = await supabase.from('media_assets').select('id, public_url, duration_seconds').eq('id', value).maybeSingle()
    if (error) return 'Could not verify creative media.'
    if (!data) return 'A selected creative file no longer exists.'
    const row = data as { id: string; public_url: string | null; duration_seconds: number | null }
    return { id: row.id, url: row.public_url, duration: row.duration_seconds }
  }
  const kind = input.kind ?? 'image'
  const desktop = await pick(input.creativeMediaId, kind === 'sponsored' || kind === 'html' ? 'image' : kind)
  if (typeof desktop === 'string') return desktop
  const mobile = await pick(input.mobileCreativeMediaId, kind === 'video' ? 'video' : 'image')
  if (typeof mobile === 'string') return mobile
  const poster = await pick(input.posterMediaId, 'image')
  if (typeof poster === 'string') return poster
  const durations = [desktop.duration, mobile.duration].filter((d): d is number => typeof d === 'number')
  return {
    desktopId: input.creativeMediaId ? desktop.id || null : null,
    mobileId: input.mobileCreativeMediaId ? mobile.id || null : null,
    posterId: input.posterMediaId ? poster.id || null : null,
    desktopUrl: desktop.url,
    mobileUrl: mobile.url,
    posterUrl: poster.url,
    durationSeconds: durations.length > 0 ? Math.max(...durations) : null,
  }
}

async function getSlotConstraints(
  supabase: AdminContext['supabase'],
  slotId: string,
): Promise<{ allowedFormats: string[]; maxDurationSeconds: number | null } | null> {
  const { data } = await supabase.from('ad_slots').select('allowed_formats, max_duration_seconds').eq('id', slotId).maybeSingle()
  if (!data) return null
  return {
    allowedFormats: Array.isArray((data as { allowed_formats: unknown }).allowed_formats)
      ? ((data as { allowed_formats: string[] }).allowed_formats)
      : [],
    maxDurationSeconds: (data as { max_duration_seconds: number | null }).max_duration_seconds ?? null,
  }
}

/** Approve a campaign's custom creative — only approved creative renders publicly. */
export async function approveCreative(campaignId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { error } = await supabase
      .from('ad_campaigns')
      .update({ creative_status: 'approved', creative_rejection_reason: null })
      .eq('id', campaignId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'ad:creative:approve', entityType: 'ad_campaign', entityId: campaignId })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Reject a campaign's custom creative with a reason — falls back to the text card. */
export async function rejectCreative(campaignId: string, reason: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    if (!reason.trim()) return { ok: false, error: 'A rejection reason is required.' }
    const { error } = await supabase
      .from('ad_campaigns')
      .update({ creative_status: 'rejected', creative_rejection_reason: reason.trim() })
      .eq('id', campaignId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'ad:creative:reject', entityType: 'ad_campaign', entityId: campaignId, notes: reason.trim() })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function updateCampaignStatus(campaignId: string, status: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { error } = await supabase.from('ad_campaigns').update({ status }).eq('id', campaignId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'ad:campaign:status',
      toStatus: status,
      notes: `campaign=${campaignId}`,
    })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function approveAdInquiry(campaignId: string, input: { slotId: string; startsAt?: string; endsAt?: string; agreedPrice?: number; currency?: string }): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) return { ok: false, error: 'Campaign end must be after its start.' }
    // Overlap check only makes sense with a real date window — dateless
    // approvals (run indefinitely) must not be blocked by dated campaigns.
    if (input.startsAt && input.endsAt) {
      const { data: overlap } = await supabase.from('ad_campaigns').select('id').eq('ad_slot_id', input.slotId).eq('status', 'active').lt('starts_at', input.endsAt).gt('ends_at', input.startsAt)
      if ((overlap ?? []).some((row) => row.id !== campaignId)) return { ok: false, error: 'This slot is already booked for the selected dates.' }
    }
    const { error } = await supabase.from('ad_campaigns').update({ ad_slot_id: input.slotId, starts_at: input.startsAt ?? null, ends_at: input.endsAt ?? null, agreed_price: input.agreedPrice ?? null, currency: input.currency?.toUpperCase() ?? null, status: 'active', approved_at: new Date().toISOString(), approved_by: user.id }).eq('id', campaignId).eq('status', 'pending')
    if (error) return { ok: false, error: error.message }
    await supabase.from('ad_inquiry_events').insert({ campaign_id: campaignId, actor_id: user.id, event_type: 'approved' })
    await audit(supabase, user.id, { action: 'ad:inquiry:approve', notes: `campaign=${campaignId}` })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    // Close the loop with the advertiser when the inquiry maps to an account.
    void supabase
      .from('ad_campaigns')
      .select('name, advertiser:advertisers(user_id)')
      .eq('id', campaignId)
      .maybeSingle()
      .then((res) => {
        const row = res.data as { name?: string; advertiser?: { user_id?: string | null } | { user_id?: string | null }[] | null } | null
        const adv = Array.isArray(row?.advertiser) ? row.advertiser[0] : row?.advertiser
        if (adv?.user_id) {
          void enqueueUser('advertise.approved', adv.user_id, { company: (row?.name ?? 'your campaign').slice(0, 120) }, '/account/dashboard')
        }
      })
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function rejectAdInquiry(campaignId: string, reason: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    if (!reason.trim()) return { ok: false, error: 'A rejection reason is required.' }
    const { error } = await supabase.from('ad_campaigns').update({ status: 'rejected', rejection_reason: reason.trim() }).eq('id', campaignId).eq('status', 'pending')
    if (error) return { ok: false, error: error.message }
    await supabase.from('ad_inquiry_events').insert({ campaign_id: campaignId, actor_id: user.id, event_type: 'rejected', reason: reason.trim() })
    await audit(supabase, user.id, { action: 'ad:inquiry:reject', notes: `campaign=${campaignId}: ${reason.trim()}` })
    revalidateLocalized('/admin/ads')
    return { ok: true }
  } catch (e) { return fail(e) }
}

/** Delete a pending ad inquiry (spam / stale cleanup). Non-pending rows stay protected. */
export async function deleteAdInquiry(campaignId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { data: row } = await supabase.from('ad_campaigns').select('id, status').eq('id', campaignId).limit(1)
    const found = (row ?? [])[0] as { id: string; status: string } | undefined
    if (!found) return { ok: false, error: 'Campaign not found.' }
    if (found.status !== 'pending') return { ok: false, error: 'Only pending inquiries can be deleted.' }

    const { error } = await supabase.from('ad_campaigns').delete().eq('id', campaignId)
    if (error) return { ok: false, error: error.message }

    await audit(supabase, user.id, { action: 'ad:inquiry:delete', notes: `campaign=${campaignId}` })
    revalidateLocalized('/admin/ads')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function updateAdSlot(slotId: string, input: { name?: string; placement?: string | null; dimensions?: string | null; mobileDimensions?: string | null; allowedFormats?: string[]; maxDurationSeconds?: number | null; capacity?: number; basePrice?: number | null; currency?: string | null; isActive?: boolean }): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    if (input.capacity != null && (!Number.isInteger(input.capacity) || input.capacity < 1)) return { ok: false, error: 'Capacity must be a positive whole number.' }
    if (input.allowedFormats !== undefined) {
      const valid = input.allowedFormats.filter((f) => isAdFormat(f))
      if (valid.length === 0) return { ok: false, error: 'A slot must accept at least one format.' }
      input = { ...input, allowedFormats: valid }
    }
    if (input.maxDurationSeconds != null && (!Number.isInteger(input.maxDurationSeconds) || input.maxDurationSeconds < 1)) return { ok: false, error: 'Max duration must be a positive whole number of seconds.' }
    const patch = { name: input.name?.trim(), placement: input.placement?.trim() || null, dimensions: input.dimensions?.trim() || null, mobile_dimensions: input.mobileDimensions?.trim() || null, allowed_formats: input.allowedFormats, max_duration_seconds: input.maxDurationSeconds ?? null, capacity: input.capacity, base_price: input.basePrice ?? null, currency: input.currency?.toUpperCase() || null, is_active: input.isActive }
    if (patch.name === '') return { ok: false, error: 'Slot name is required.' }
    const { error } = await supabase.from('ad_slots').update(patch).eq('id', slotId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'ad:slot:update', notes: `slot=${slotId}` })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function updateAdvertiser(advertiserId: string, input: { companyName: string; contactName?: string; email?: string; phone?: string }): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const companyName = input.companyName.trim()
    if (!companyName) return { ok: false, error: 'Company name is required.' }
    if (input.email && !/^\S+@\S+\.\S+$/.test(input.email.trim())) return { ok: false, error: 'Enter a valid advertiser email.' }
    const { error } = await supabase.from('advertisers').update({
      company_name: companyName,
      contact_name: input.contactName?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      phone: input.phone?.trim() || null,
    }).eq('id', advertiserId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'advertiser:update', entityType: 'advertiser', entityId: advertiserId })
    revalidateLocalized('/admin/ads')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function deleteAdvertiser(advertiserId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { count } = await supabase.from('ad_campaigns').select('id', { count: 'exact', head: true }).eq('advertiser_id', advertiserId)
    if ((count ?? 0) > 0) return { ok: false, error: 'Delete or reassign this advertiser\'s campaigns first.' }
    const { error } = await supabase.from('advertisers').delete().eq('id', advertiserId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'advertiser:delete', entityType: 'advertiser', entityId: advertiserId })
    revalidateLocalized('/admin/ads')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function updateAdCampaign(campaignId: string, input: { name?: string; slotId?: string | null; destinationUrl?: string | null; copyText?: string | null; startsAt?: string | null; endsAt?: string | null; agreedPrice?: number | null; currency?: string | null; budgetLimit?: number | null; impressionLimit?: number | null; clickLimit?: number | null; creativeType?: string; creativeMediaId?: string | null; mobileCreativeMediaId?: string | null; posterMediaId?: string | null; creativeHtml?: string | null; creativeWidth?: number | null; creativeHeight?: number | null }): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    if (input.destinationUrl && !/^https:\/\//i.test(input.destinationUrl.trim())) return { ok: false, error: 'Ad destination must use https://.' }
    if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) return { ok: false, error: 'Campaign end must be after its start.' }
    if (input.agreedPrice != null && input.agreedPrice < 0) return { ok: false, error: 'Price cannot be negative.' }
    const patch: Record<string, unknown> = {
      name: input.name?.trim(), ad_slot_id: input.slotId, destination_url: input.destinationUrl?.trim() || null,
      copy_text: input.copyText?.trim() || null, starts_at: input.startsAt || null, ends_at: input.endsAt || null,
      agreed_price: input.agreedPrice ?? null, currency: input.currency?.toUpperCase() || null,
      budget_limit: input.budgetLimit ?? null, impression_limit: input.impressionLimit ?? null, click_limit: input.clickLimit ?? null,
    }
    const touchesCreative =
      input.creativeType !== undefined || input.creativeMediaId !== undefined ||
      input.mobileCreativeMediaId !== undefined || input.posterMediaId !== undefined ||
      input.creativeHtml !== undefined || input.creativeWidth !== undefined || input.creativeHeight !== undefined
    if (touchesCreative) {
      // Load current creative so partial edits validate against the whole.
      const { data: current } = await supabase
        .from('ad_campaigns')
        .select('creative_type, creative_media_id, mobile_creative_media_id, poster_media_id, creative_html, ad_slot_id')
        .eq('id', campaignId)
        .maybeSingle()
      const cur = (current ?? {}) as { creative_type?: string; creative_media_id?: string | null; mobile_creative_media_id?: string | null; poster_media_id?: string | null; creative_html?: string | null; ad_slot_id?: string | null }
      const creativeType: AdFormat = isAdFormat(input.creativeType) ? input.creativeType : isAdFormat(cur.creative_type) ? cur.creative_type : 'sponsored'
      const creative = await resolveCreativeMedia(supabase, {
        creativeMediaId: input.creativeMediaId !== undefined ? input.creativeMediaId : (cur.creative_media_id ?? null),
        mobileCreativeMediaId: input.mobileCreativeMediaId !== undefined ? input.mobileCreativeMediaId : (cur.mobile_creative_media_id ?? null),
        posterMediaId: input.posterMediaId !== undefined ? input.posterMediaId : (cur.poster_media_id ?? null),
        kind: creativeType,
      })
      if (typeof creative === 'string') return { ok: false, error: creative }
      const slot = await getSlotConstraints(supabase, input.slotId ?? cur.ad_slot_id ?? '')
      const html = creativeType === 'html' ? sanitizeCreativeHtml(input.creativeHtml !== undefined ? input.creativeHtml : (cur.creative_html ?? null)) : null
      const creativeError = validateCreative({
        format: creativeType,
        allowedFormats: slot?.allowedFormats ?? null,
        maxDurationSeconds: slot?.maxDurationSeconds ?? null,
        desktopUrl: creative.desktopUrl,
        mobileUrl: creative.mobileUrl,
        posterUrl: creative.posterUrl,
        html: creativeType === 'html' ? (html ?? input.creativeHtml ?? null) : null,
        durationSeconds: creative.durationSeconds,
        destinationUrl: input.destinationUrl ?? undefined,
      })
      if (creativeError) return { ok: false, error: creativeError }
      patch.creative_type = creativeType
      if (input.creativeMediaId !== undefined) patch.creative_media_id = creative.desktopId
      if (input.mobileCreativeMediaId !== undefined) patch.mobile_creative_media_id = creative.mobileId
      if (input.posterMediaId !== undefined) patch.poster_media_id = creative.posterId
      if (creativeType === 'html') patch.creative_html = html
      else if (input.creativeHtml !== undefined) patch.creative_html = null
      if (input.creativeWidth !== undefined) patch.creative_width = input.creativeWidth
      if (input.creativeHeight !== undefined) patch.creative_height = input.creativeHeight
      // Swapping the creative re-arms moderation — the new asset renders
      // only after approval (sponsored text stays live throughout).
      if (creativeType !== 'sponsored') patch.creative_status = 'pending'
    }
    const { error } = await supabase.from('ad_campaigns').update(patch).eq('id', campaignId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'ad:campaign:update', entityType: 'ad_campaign', entityId: campaignId })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function deleteAdCampaign(campaignId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { error } = await supabase.from('ad_campaigns').delete().eq('id', campaignId).in('status', ['pending', 'rejected', 'ended', 'paused'])
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'ad:campaign:delete', entityType: 'ad_campaign', entityId: campaignId })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function createAdSlot(input: { slotKey: string; name: string; placement?: string; dimensions?: string; mobileDimensions?: string; allowedFormats?: string[]; maxDurationSeconds?: number | null; capacity?: number; basePrice?: number; currency?: string }): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const slotKey = input.slotKey.trim().toLowerCase()
    if (!/^[a-z0-9_-]+$/.test(slotKey) || !input.name.trim()) return { ok: false, error: 'Slot key and name are required.' }
    const allowedFormats = (input.allowedFormats ?? ['image', 'sponsored']).filter((f) => isAdFormat(f))
    if (allowedFormats.length === 0) return { ok: false, error: 'A slot must accept at least one format.' }
    if (input.maxDurationSeconds != null && (!Number.isInteger(input.maxDurationSeconds) || input.maxDurationSeconds < 1)) return { ok: false, error: 'Max duration must be a positive whole number of seconds.' }
    const { error } = await supabase.from('ad_slots').insert({ slot_key: slotKey, name: input.name.trim(), placement: input.placement?.trim() || null, dimensions: input.dimensions?.trim() || null, mobile_dimensions: input.mobileDimensions?.trim() || null, allowed_formats: allowedFormats, max_duration_seconds: input.maxDurationSeconds ?? null, capacity: input.capacity ?? 1, base_price: input.basePrice ?? null, currency: input.currency?.toUpperCase() || null })
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'ad:slot:create', entityType: 'ad_slot', notes: slotKey })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function deleteAdSlot(slotId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageAds')
    const { count } = await supabase.from('ad_campaigns').select('id', { count: 'exact', head: true }).eq('ad_slot_id', slotId).eq('status', 'active')
    if ((count ?? 0) > 0) return { ok: false, error: 'An active campaign still uses this slot.' }
    const { error } = await supabase.from('ad_slots').delete().eq('id', slotId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'ad:slot:delete', entityType: 'ad_slot', entityId: slotId })
    revalidateLocalized('/admin/ads')
    revalidateAdsCache()
    return { ok: true }
  } catch (e) { return fail(e) }
}

/* ------------------------------------------------------------------ */
/* Community polls                                                     */
/* ------------------------------------------------------------------ */

export async function createPoll(input: {
  question: string
  options: string[]
  locale?: string
  closesInDays?: number | null
}): Promise<ActionResult> {
  try {
    const question = input.question.trim()
    const options = input.options.map((o) => o.trim()).filter(Boolean)
    if (!question || options.length < 2 || options.length > 10) {
      return { ok: false, error: 'A question and between 2 and 10 options are required.' }
    }
    const lowerOptions = options.map((o) => o.toLowerCase())
    if (new Set(lowerOptions).size !== lowerOptions.length) {
      return { ok: false, error: 'Poll options must be unique.' }
    }

    const { supabase, user } = await assertCapability('managePolls')

    const closesAt =
      input.closesInDays && input.closesInDays > 0
        ? new Date(Date.now() + input.closesInDays * 86_400_000).toISOString()
        : null

    const { data: created, error: createErr } = await supabase
      .from('polls')
      .insert({ question, locale: input.locale ?? 'en', is_active: true, closes_at: closesAt })
      .select('id')
      .single()
    if (createErr || !created) return { ok: false, error: createErr?.message ?? 'Could not create the poll.' }

    const { error: optionsErr } = await supabase
      .from('poll_options')
      .insert(options.map((label, index) => ({ poll_id: created.id, label, sort_order: index + 1 })))
    if (optionsErr) return { ok: false, error: optionsErr.message }

    await audit(supabase, user.id, { action: 'poll:create', notes: `poll=${created.id} ${question}` })
    revalidateLocalized('/admin/polls')
    revalidateLocalized('/')
    revalidateLocalized('/polls')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function updatePoll(
  pollId: string,
  input: {
    question?: string
    options?: string[]
    closesInDays?: number | null
  },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('managePolls')
    const { data: poll } = await supabase.from('polls').select('id, is_active').eq('id', pollId).single()
    if (!poll) return { ok: false, error: 'Poll not found.' }
    if (poll.is_active) return { ok: false, error: 'Active polls must be closed before editing.' }
    const { count } = await supabase.from('poll_votes').select('id', { count: 'exact', head: true }).eq('poll_id', pollId)
    const voteCount = count ?? 0

    if (input.options !== undefined && voteCount > 0) {
      return { ok: false, error: 'Options cannot be modified once votes have been cast.' }
    }

    const patch: Record<string, unknown> = {}
    if (input.question !== undefined) {
      const q = input.question.trim()
      if (!q) return { ok: false, error: 'A question is required.' }
      patch.question = q
    }
    if (input.closesInDays !== undefined) {
      patch.closes_at =
        input.closesInDays && input.closesInDays > 0
          ? new Date(Date.now() + input.closesInDays * 86_400_000).toISOString()
          : null
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('polls').update(patch).eq('id', pollId)
      if (error) return { ok: false, error: error.message }
    }

    if (input.options !== undefined && voteCount === 0) {
      const cleaned = input.options.map((o) => o.trim()).filter(Boolean)
      if (cleaned.length < 2 || cleaned.length > 10) {
        return { ok: false, error: 'Polls must have between 2 and 10 options.' }
      }
      const lower = cleaned.map((o) => o.toLowerCase())
      if (new Set(lower).size !== lower.length) {
        return { ok: false, error: 'Poll options must be unique.' }
      }
      const { data: existingOptions } = await supabase.from('poll_options').select('id, label').eq('poll_id', pollId)
      const unused = [...(existingOptions ?? [])]
      const nextOptions = cleaned.map((label, index) => {
        const matchingIndex = unused.findIndex((option) => option.label.trim().toLowerCase() === label.toLowerCase())
        const match = matchingIndex >= 0 ? unused.splice(matchingIndex, 1)[0] : unused.shift()
        return { id: match?.id, poll_id: pollId, label, sort_order: index + 1 }
      })
      const { error: optErr } = await supabase.from('poll_options').upsert(nextOptions, { onConflict: 'id' })
      if (optErr) return { ok: false, error: optErr.message }
      const retainedIds = nextOptions.flatMap((option) => option.id ? [option.id] : [])
      const { error: removeErr } = await supabase.from('poll_options').delete().eq('poll_id', pollId).not('id', 'in', `(${retainedIds.join(',') || '00000000-0000-0000-0000-000000000000'})`)
      if (removeErr) return { ok: false, error: removeErr.message }
    }

    await audit(supabase, user.id, { action: 'poll:update', notes: `poll=${pollId}` })
    revalidateLocalized('/admin/polls')
    revalidateLocalized('/')
    revalidateLocalized('/polls')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function deletePoll(pollId: string, override = false): Promise<ActionResult> {
  try {
    const { user } = await assertCapability('managePolls')
    // Service-role for the destructive work (after the capability check):
    // `poll_votes` has no staff-readable SELECT policy, so a session-client
    // count always undercounted to 0 (hiding the override checkbox) and the
    // session-client vote delete was RLS-blocked — polls with ballots could
    // never be removed from the command center.
    const admin = createAdminClient()
    const { count, error: countErr } = await admin.from('poll_votes').select('id', { count: 'exact', head: true }).eq('poll_id', pollId)
    if (countErr) return { ok: false, error: countErr.message }
    const voteCount = count ?? 0

    if (voteCount > 0 && !override) {
      return {
        ok: false,
        error: `Cannot delete: poll has ${voteCount} vote${voteCount === 1 ? '' : 's'}. Admin override required.`,
      }
    }

    if (voteCount > 0 && override) {
      await assertAdmin()
    }

    const { error: votesErr } = await admin.from('poll_votes').delete().eq('poll_id', pollId)
    if (votesErr) return { ok: false, error: votesErr.message }
    const { error: optionsErr } = await admin.from('poll_options').delete().eq('poll_id', pollId)
    if (optionsErr) return { ok: false, error: optionsErr.message }
    const { error } = await admin.from('polls').delete().eq('id', pollId)
    if (error) return { ok: false, error: error.message }

    await audit(admin, user.id, {
      action: override ? 'poll:delete:override' : 'poll:delete',
      notes: `poll=${pollId} votes=${voteCount}`,
    })
    revalidateLocalized('/admin/polls')
    revalidateLocalized('/')
    revalidateLocalized('/polls')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function exportPollResults(pollId: string): Promise<{
  ok: boolean
  error?: string
  question?: string
  data?: Array<{ label: string; count: number; percentage: number }>
}> {
  try {
    const { supabase } = await assertCapability('managePolls')
    const { data: poll } = await supabase.from('polls').select('id, question').eq('id', pollId).single()
    if (!poll) return { ok: false, error: 'Poll not found.' }

    const { data: options } = await supabase
      .from('poll_options')
      .select('id, label, sort_order')
      .eq('poll_id', pollId)
      .order('sort_order', { ascending: true })

    const { data: votes } = await supabase.from('poll_votes').select('option_id').eq('poll_id', pollId)
    const totalVotes = (votes ?? []).length
    const counts: Record<string, number> = {}
    for (const v of votes ?? []) {
      counts[v.option_id] = (counts[v.option_id] ?? 0) + 1
    }

    const data = (options ?? []).map((o) => {
      const count = counts[o.id] ?? 0
      const percentage = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0
      return { label: o.label, count, percentage }
    })

    return { ok: true, question: poll.question, data }
  } catch (e) {
    return fail(e)
  }
}

export async function activatePoll(pollId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('managePolls')
    const { error } = await supabase.from('polls').update({ is_active: true, closes_at: null }).eq('id', pollId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'poll:activate', notes: `poll=${pollId}` })
    revalidateLocalized('/admin/polls')
    revalidateLocalized('/')
    revalidateLocalized('/polls')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function closePoll(pollId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('managePolls')
    const { error } = await supabase
      .from('polls')
      .update({ is_active: false, closes_at: new Date().toISOString() })
      .eq('id', pollId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'poll:close', notes: `poll=${pollId}` })
    revalidateLocalized('/admin/polls')
    revalidateLocalized('/')
    revalidateLocalized('/polls')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Fundraising campaigns                                               */
/* ------------------------------------------------------------------ */

export async function createFundraiser(input: {
  titleEn: string
  titleFr?: string
  descriptionEn: string
  descriptionFr?: string
  goalAmount: number
  currency?: string
  organizerName?: string
  donationUrl?: string
  payoutMethod?: 'momo' | 'bank'
  payoutAccount?: string
  payoutAccountName?: string
}): Promise<ActionResult> {
  try {
    const titleEn = input.titleEn.trim()
    const descEn = input.descriptionEn.trim()
    if (!titleEn || !descEn) return { ok: false, error: 'English title and description are required.' }
    if (input.goalAmount <= 0) return { ok: false, error: 'Goal amount must be greater than zero.' }
    const currency = (input.currency || 'XAF').toUpperCase()
    if (!(FUNDRAISER_CURRENCIES as readonly string[]).includes(currency)) return { ok: false, error: 'Unsupported fundraiser currency.' }
    if (input.donationUrl && !/^https?:\/\//i.test(input.donationUrl.trim())) {
      return { ok: false, error: 'The donation link must start with http:// or https://.' }
    }

    const { supabase, user } = await assertCapability('manageFundraisers')
    const slug = `fundraiser-${Date.now()}`

    const { data: created, error: cErr } = await supabase
      .from('content_items')
      .insert({ type: 'culture', slug, status: 'published', author_id: user.id })
      .select('id')
      .single()
    if (cErr || !created) return { ok: false, error: cErr?.message ?? 'Could not create fundraiser item.' }

    // Insert the FR translation only when FR copy was actually provided.
    // The old `|| titleEn` fallback persisted English text as the French
    // translation, so French pages showed English content stored as "fr".
    const rows: { content_item_id: string; locale: string; title: string | null; body: string | null }[] = [
      { content_item_id: created.id, locale: 'en', title: titleEn, body: descEn },
    ]
    const titleFr = input.titleFr?.trim()
    const descFr = input.descriptionFr?.trim()
    if (titleFr || descFr) {
      rows.push({
        content_item_id: created.id,
        locale: 'fr',
        title: titleFr || null,
        body: descFr || null,
      })
    }
    const { error: translationError } = await supabase.from('content_translations').insert(rows)
    if (translationError) {
      await supabase.from('content_items').delete().eq('id', created.id)
      return { ok: false, error: translationError.message }
    }

    const { error: fErr } = await supabase.from('fundraisers').insert({
      content_item_id: created.id,
      goal_amount: input.goalAmount,
      currency,
      organizer_name: input.organizerName?.trim() || null,
      donation_url: input.donationUrl?.trim() || null,
      payout_method: input.payoutMethod ?? null,
      payout_account: input.payoutAccount?.trim() || null,
      payout_account_name: input.payoutAccountName?.trim() || null,
      current_amount: 0,
    })
    if (fErr) {
      await supabase.from('content_items').delete().eq('id', created.id)
      return { ok: false, error: fErr.message }
    }

    await audit(supabase, user.id, { action: 'fundraiser:create', contentItemId: created.id, notes: titleEn })
    revalidateLocalized('/admin/fundraisers')
    revalidateLocalized('/')
    revalidateLocalized('/fundraisers')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function updateFundraiser(
  contentItemId: string,
  input: {
    goalAmount?: number | null
    currency?: string
    organizerName?: string | null
    donationUrl?: string | null
    payoutMethod?: 'momo' | 'bank' | null
    payoutAccount?: string | null
    payoutAccountName?: string | null
    verificationNotes?: string | null
    titleEn?: string | null
    titleFr?: string | null
    descriptionEn?: string | null
    descriptionFr?: string | null
  },
): Promise<ActionResult> {
  try {
    if (input.goalAmount !== undefined && input.goalAmount !== null && input.goalAmount < 0) {
      return { ok: false, error: 'The goal cannot be negative.' }
    }
    if (input.donationUrl && !/^https?:\/\//i.test(input.donationUrl.trim())) {
      return { ok: false, error: 'The donation link must start with http:// or https://.' }
    }
    if (input.payoutMethod && !['momo', 'bank'].includes(input.payoutMethod)) {
      return { ok: false, error: 'Unsupported payout method.' }
    }
    if (input.payoutMethod && !input.payoutAccount?.trim()) {
      return { ok: false, error: 'A payout account is required.' }
    }
    if (input.currency && !(FUNDRAISER_CURRENCIES as readonly string[]).includes(input.currency.toUpperCase())) {
      return { ok: false, error: 'Unsupported fundraiser currency.' }
    }

    const { supabase, user } = await assertCapability('manageFundraisers')
    const { data: current } = await supabase.from('fundraisers').select('raised_amount').eq('content_item_id', contentItemId).single()
    const currentAmount = current?.raised_amount ?? 0

    if ((input.goalAmount !== undefined || input.currency) && currentAmount > 0) {
      await assertAdmin()
    }

    const patch: Record<string, unknown> = {}
    if (input.goalAmount !== undefined) patch.goal_amount = input.goalAmount
    if (input.currency) patch.currency = input.currency.toUpperCase()
    if (input.organizerName !== undefined) patch.organizer_name = input.organizerName || null
    if (input.donationUrl !== undefined) patch.donation_url = input.donationUrl?.trim() || null
    if (input.payoutMethod !== undefined) patch.payout_method = input.payoutMethod
    if (input.payoutAccount !== undefined) patch.payout_account = input.payoutAccount?.trim() || null
    if (input.payoutAccountName !== undefined) patch.payout_account_name = input.payoutAccountName?.trim() || null
    if (input.verificationNotes !== undefined) patch.verification_notes = input.verificationNotes || null
    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('fundraisers').update(patch).eq('content_item_id', contentItemId)
      if (error) return { ok: false, error: error.message }
    }

    // Bilingual story fields live on content_translations (same model as
    // content create/edit). Upsert EN when provided; FR upserts when
    // non-empty and deletes when cleared so "FR missing" stays visible
    // instead of persisting stale copy.
    const storyTouched =
      input.titleEn !== undefined ||
      input.descriptionEn !== undefined ||
      input.titleFr !== undefined ||
      input.descriptionFr !== undefined
    if (storyTouched) {
      const { data: existing } = await supabase
        .from('content_translations')
        .select('locale, title, body')
        .eq('content_item_id', contentItemId)
      const rows = (existing ?? []) as { locale: string; title: string | null; body: string | null }[]
      const enRow = rows.find((r) => r.locale === 'en')
      const frRow = rows.find((r) => r.locale === 'fr')
      const nextEnTitle = input.titleEn !== undefined ? input.titleEn?.trim() || '' : (enRow?.title ?? '')
      const nextEnBody = input.descriptionEn !== undefined ? input.descriptionEn?.trim() || '' : (enRow?.body ?? '')
      if (!nextEnTitle) return { ok: false, error: 'English title is required.' }
      const { error: enErr } = await supabase.from('content_translations').upsert(
        { content_item_id: contentItemId, locale: 'en', voice: 'formal', title: nextEnTitle, body: nextEnBody || null },
        { onConflict: 'content_item_id,locale,voice' },
      )
      if (enErr) return { ok: false, error: enErr.message }
      const nextFrTitle = input.titleFr !== undefined ? input.titleFr?.trim() || '' : (frRow?.title ?? '')
      const nextFrBody = input.descriptionFr !== undefined ? input.descriptionFr?.trim() || '' : (frRow?.body ?? '')
      if (nextFrTitle || nextFrBody) {
        const { error: frErr } = await supabase.from('content_translations').upsert(
          { content_item_id: contentItemId, locale: 'fr', voice: 'formal', title: nextFrTitle || null, body: nextFrBody || null },
          { onConflict: 'content_item_id,locale,voice' },
        )
        if (frErr) return { ok: false, error: frErr.message }
      } else if (input.titleFr !== undefined || input.descriptionFr !== undefined) {
        await supabase.from('content_translations').delete().eq('content_item_id', contentItemId).eq('locale', 'fr')
      }
    }
    if (Object.keys(patch).length === 0 && !storyTouched) return { ok: true }
    await audit(supabase, user.id, {
      action: 'fundraiser:update',
      contentItemId,
      notes: Object.keys(patch).join(','),
    })
    revalidateLocalized('/admin/fundraisers')
    revalidateLocalized('/')
    revalidateLocalized('/fundraisers')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function closeFundraiser(contentItemId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageFundraisers')
    const { error } = await supabase
      .from('fundraisers')
      .update({ closed_at: new Date().toISOString() })
      .eq('content_item_id', contentItemId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'fundraiser:close', contentItemId })
    revalidateLocalized('/admin/fundraisers')
    revalidateLocalized('/')
    revalidateLocalized('/fundraisers')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function reopenFundraiser(contentItemId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageFundraisers')
    const { error } = await supabase.from('fundraisers').update({ closed_at: null }).eq('content_item_id', contentItemId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'fundraiser:reopen', contentItemId })
    revalidateLocalized('/admin/fundraisers')
    revalidateLocalized('/')
    revalidateLocalized('/fundraisers')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function deleteFundraiser(contentItemId: string): Promise<ActionResult> {
  try {
    await assertAdmin()
    // Service-role lookup (after the admin check): the session client has no
    // DELETE-adjacent guarantees on fundraisers and previously surfaced RLS
    // errors instead of deleting seeded "dummy" campaigns.
    const admin = createAdminClient()
    const { data: fundraiser, error: lookupErr } = await admin
      .from('fundraisers')
      .select('content_item_id')
      .eq('content_item_id', contentItemId)
      .single()
    if (lookupErr || !fundraiser) return { ok: false, error: 'Fundraiser not found.' }
    const result = await deleteContentItem(contentItemId)
    if (result.ok) {
      revalidateLocalized('/admin/fundraisers')
      revalidateLocalized('/')
      revalidateLocalized('/fundraisers')
    }
    return result
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Storage / backup                                                    */
/* ------------------------------------------------------------------ */

export async function triggerBackup(): Promise<ActionResult & { count?: number }> {
  try {
    const { supabase, user } = await assertAdmin()
    // Scope today: R2-hosted originals only (Supabase-hosted + B2 mirror are
    // out of scope for the delta backup). Count first so the UI can report
    // honestly instead of toasting success on zero rows.
    const { data: pending, error: lookupError } = await supabase
      .from('media_assets')
      .select('id')
      .eq('provider', 'r2')
      .is('backed_up_at', null)
    if (lookupError) return { ok: false, error: lookupError.message }
    if (!pending?.length) return { ok: false, error: 'Nothing to queue — all R2 assets are already backed up.' }
    const { error } = await supabase
      .from('media_assets')
      .update({ backup_requested_at: new Date().toISOString() })
      .eq('provider', 'r2')
      .is('backed_up_at', null)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'backup:trigger', notes: `count=${pending.length} scope=r2` })
    revalidateLocalized('/admin/storage-backup')
    return { ok: true, count: pending.length }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Trust & safety (reports + corrections)                              */
/* ------------------------------------------------------------------ */

/**
 * Move a community report through the trust & safety pipeline
 * (investigating -> resolved / dismissed). The note is recorded on the row
 * and in the moderation log so the audit trail shows who decided what.
 */
/** Permanently delete a junk/spam report (admin only — irreversible). */
export async function deleteReport(reportId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertAdmin()
    const { error } = await supabase.from('reports').delete().eq('id', reportId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'report:delete', entityType: 'report', entityId: reportId })
    revalidateLocalized('/admin/trust-safety')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function resolveReport(
  reportId: string,
  status: 'investigating' | 'resolved' | 'dismissed',
  notes?: string,
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('moderate')
    const now = new Date().toISOString()

    const { data: report } = await supabase
      .from('reports')
      .select('id, status, content_item_id')
      .eq('id', reportId)
      .single()
    if (!report) return { ok: false, error: 'Report not found.' }
    if (report.status === status) return { ok: true }

    const { error } = await supabase
      .from('reports')
      .update({
        status,
        resolution: notes?.trim() || null,
        updated_at: now,
        resolved_at: status === 'resolved' || status === 'dismissed' ? now : null,
      })
      .eq('id', reportId)
    if (error) return { ok: false, error: error.message }

    await supabase.from('moderation_log').insert({
      action: `report:${status}`,
      content_item_id: report.content_item_id ?? null,
      to_status: status,
      notes: notes?.trim() || null,
      actor_id: user.id,
    })

    revalidateLocalized('/admin/trust-safety')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Same pipeline for content corrections (with the reviewer recorded). */
export async function resolveCorrection(
  correctionId: string,
  status: 'investigating' | 'resolved' | 'dismissed',
  notes?: string,
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('moderate')
    const now = new Date().toISOString()

    const { data: correction } = await supabase
      .from('corrections')
      .select('id, status, content_item_id')
      .eq('id', correctionId)
      .single()
    if (!correction) return { ok: false, error: 'Correction not found.' }
    if (correction.status === status) return { ok: true }

    const { error } = await supabase
      .from('corrections')
      .update({
        status,
        resolution: notes?.trim() || null,
        reviewed_by: user.id,
        resolved_at: status === 'resolved' || status === 'dismissed' ? now : null,
      })
      .eq('id', correctionId)
    if (error) return { ok: false, error: error.message }

    await supabase.from('moderation_log').insert({
      action: `correction:${status}`,
      content_item_id: correction.content_item_id ?? null,
      to_status: status,
      notes: notes?.trim() || null,
      actor_id: user.id,
    })

    revalidateLocalized('/admin/trust-safety')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Legal policies                                                      */
/* ------------------------------------------------------------------ */

const POLICY_TYPES = ['terms', 'privacy', 'guidelines', 'copyright', 'contact'] as const

/** Publish a new policy version and mark it current (one current per type+locale). */
export async function createPolicyVersion(input: {
  policyType: string
  locale: 'en' | 'fr'
  version: string
  content: string
}): Promise<ActionResult> {
  try {
    const policyType = input.policyType.trim()
    const version = input.version.trim()
    const content = input.content.trim()
    if (!POLICY_TYPES.includes(policyType as (typeof POLICY_TYPES)[number])) {
      return { ok: false, error: 'Unknown policy type.' }
    }
    if (!version || !content) return { ok: false, error: 'Version and content are required.' }

    const { supabase, user } = await assertCapability('managePolicies')

    const { error: clearErr } = await supabase
      .from('policy_versions')
      .update({ is_current: false })
      .eq('policy_type', policyType)
      .eq('locale', input.locale)
    if (clearErr) return { ok: false, error: clearErr.message }

    const { error } = await supabase.from('policy_versions').insert({
      policy_type: policyType,
      locale: input.locale,
      version,
      content,
      is_current: true,
    })
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'policy:version:create',
      notes: `${policyType} ${input.locale} v${version}`,
    })
    revalidateLocalized('/admin/policies')
    revalidateLocalized('/about')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Point a type+locale at an older version (history rollback). */
export async function setCurrentPolicy(policyId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('managePolicies')
    const { data, error: readErr } = await supabase
      .from('policy_versions')
      .select('id, policy_type, locale')
      .eq('id', policyId)
      .limit(1)
    const target = (data ?? [])[0] as
      | { id: string; policy_type: string; locale: string }
      | undefined
    if (readErr || !target) return { ok: false, error: 'Policy version not found.' }

    const { error: clearErr } = await supabase
      .from('policy_versions')
      .update({ is_current: false })
      .eq('policy_type', target.policy_type)
      .eq('locale', target.locale)
    if (clearErr) return { ok: false, error: clearErr.message }

    const { error } = await supabase
      .from('policy_versions')
      .update({ is_current: true })
      .eq('id', policyId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'policy:version:current',
      notes: `policy=${policyId} ${target.policy_type} ${target.locale}`,
    })
    revalidateLocalized('/admin/policies')
    revalidateLocalized('/about')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Edit a version's body in place (typo fixes without a new version). */
export async function updatePolicyContent(
  policyId: string,
  content: string,
): Promise<ActionResult> {
  try {
    if (!content.trim()) return { ok: false, error: 'Content is required.' }
    const { supabase, user } = await assertCapability('managePolicies')
    const { error } = await supabase
      .from('policy_versions')
      .update({ content: content.trim() })
      .eq('id', policyId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'policy:version:edit', notes: `policy=${policyId}` })
    revalidateLocalized('/admin/policies')
    revalidateLocalized('/about')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Delete a version. Current versions are protected — roll back first. */
export async function deletePolicyVersion(policyId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('managePolicies')
    const { data } = await supabase
      .from('policy_versions')
      .select('id, is_current')
      .eq('id', policyId)
      .limit(1)
    const target = (data ?? [])[0] as { id: string; is_current: boolean } | undefined
    if (!target) return { ok: false, error: 'Policy version not found.' }
    if (target.is_current) {
      return { ok: false, error: 'This version is current — set another version current first.' }
    }
    const { error } = await supabase.from('policy_versions').delete().eq('id', policyId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'policy:version:delete', notes: `policy=${policyId}` })
    revalidateLocalized('/admin/policies')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* About index overrides                                               */
/* ------------------------------------------------------------------ */

const ABOUT_SECTION_KEYS = [
  'hero',
  'loop',
  'stats',
  'pipeline',
  'values',
  'charter',
  'closing',
] as const

/** Upsert one locale's override for an /about index section. Empty fields
 *  fall back to the dictionary at render; clearing all fields removes the
 *  override row so the dictionary shines through untouched. */
export async function saveAboutSection(input: {
  sectionKey: string
  locale: 'en' | 'fr'
  heading?: string | null
  body?: string | null
  ctaLabel?: string | null
  ctaHref?: string | null
  isActive?: boolean
}): Promise<ActionResult> {
  try {
    if (!ABOUT_SECTION_KEYS.includes(input.sectionKey as (typeof ABOUT_SECTION_KEYS)[number])) {
      return { ok: false, error: 'Unknown section.' }
    }
    const { supabase, user } = await assertCapability('managePolicies')
    const patch = {
      heading: input.heading?.trim() || null,
      body: input.body?.trim() || null,
      cta_label: input.ctaLabel?.trim() || null,
      cta_href: input.ctaHref?.trim() || null,
      is_active: input.isActive ?? true,
      updated_at: new Date().toISOString(),
    }
    if (!patch.heading && !patch.body && !patch.cta_label) {
      const { error } = await supabase
        .from('about_sections')
        .delete()
        .eq('section_key', input.sectionKey)
        .eq('locale', input.locale)
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase.from('about_sections').upsert(
        {
          section_key: input.sectionKey,
          locale: input.locale,
          ...patch,
        },
        { onConflict: 'section_key,locale' },
      )
      if (error) return { ok: false, error: error.message }
    }
    await audit(supabase, user.id, {
      action: 'about:section:save',
      notes: `${input.sectionKey} ${input.locale}`,
    })
    revalidateLocalized('/admin/policies')
    revalidateLocalized('/about')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Advertise page overrides + site settings (footer social links)     */
/* ------------------------------------------------------------------ */

const ADVERTISE_SECTION_KEYS = [
  'title',
  'tagline',
  'intro',
  'placements',
  'audience',
  'pricing',
] as const

/** Upsert one locale's override for an /advertise section. Empty fields
 *  fall back to the dictionary at render; clearing all fields removes the
 *  override row so the dictionary shines through untouched. */
export async function saveAdvertiseSection(input: {
  sectionKey: string
  locale: 'en' | 'fr'
  heading?: string | null
  body?: string | null
}): Promise<ActionResult> {
  try {
    if (!ADVERTISE_SECTION_KEYS.includes(input.sectionKey as (typeof ADVERTISE_SECTION_KEYS)[number])) {
      return { ok: false, error: 'Unknown section.' }
    }
    const { supabase, user } = await assertCapability('manageSiteContent')
    const patch = {
      heading: input.heading?.trim() || null,
      body: input.body?.trim() || null,
      is_active: true,
      updated_at: new Date().toISOString(),
    }
    if (!patch.heading && !patch.body) {
      const { error } = await supabase
        .from('advertise_sections')
        .delete()
        .eq('section_key', input.sectionKey)
        .eq('locale', input.locale)
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase.from('advertise_sections').upsert(
        {
          section_key: input.sectionKey,
          locale: input.locale,
          ...patch,
        },
        { onConflict: 'section_key,locale' },
      )
      if (error) return { ok: false, error: error.message }
    }
    await audit(supabase, user.id, {
      action: 'advertise:section:save',
      notes: `${input.sectionKey} ${input.locale}`,
    })
    revalidateLocalized('/admin/site-content')
    revalidateLocalized('/advertise')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

const SITE_SETTING_KEYS = [
  'social_facebook_url',
  'social_youtube_url',
  'site_logo_url',
  'site_name',
  'site_tagline',
  'site_name_fr',
  'site_tagline_fr',
] as const

const SITE_SETTING_MAX_LENGTH = 500

/** Branding text keys (site name / tagline, both locales) are plain text, not URLs. */
const SITE_TEXT_KEYS = ['site_name', 'site_tagline', 'site_name_fr', 'site_tagline_fr'] as const

function validateSiteText(value: string): string | null {
  if (value.length > 120) return null
  // Reject markup/URLs smuggled into the name — header renders this as text.
  if (/[<>]/.test(value)) return null
  return value
}

/** Validate a user-supplied public URL: absolute http(s) only — the footer
 *  renders this in an <a href>, so anything else (javascript:, data:, …) is
 *  rejected before it can reach the DOM. */
function validatePublicUrl(value: string): string | null {
  if (value.length > SITE_SETTING_MAX_LENGTH) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Validate a logo/image URL: absolute http(s) (CDN, Supabase public URL) or
 * a site-relative path (e.g. /uploads/… or an admin-asset public path).
 * Anything else (javascript:, data:, …) is rejected — the header renders
 * this in an <img>.
 */
function validateImageUrl(value: string): string | null {
  if (value.length > SITE_SETTING_MAX_LENGTH) return null
  if (value.startsWith('/')) {
    if (value.includes('..') || /[\s<>"]/.test(value)) return null
    return value
  }
  return validatePublicUrl(value)
}

/** Upsert one site setting (footer social links + site branding). An empty
 *  value deletes the row — the footer hides that icon, the header falls back
 *  to the built-in wordmark, and the defaults return. */
export async function saveSiteSetting(input: {
  key: string
  value: string | null
}): Promise<ActionResult> {
  try {
    if (!SITE_SETTING_KEYS.includes(input.key as (typeof SITE_SETTING_KEYS)[number])) {
      return { ok: false, error: 'Unknown setting.' }
    }
    const { supabase, user } = await assertCapability('manageSiteContent')
    const value = input.value?.trim() || null
    if (value) {
      let valid: string | null = null
      if ((SITE_TEXT_KEYS as readonly string[]).includes(input.key)) {
        valid = validateSiteText(value)
        if (!valid) return { ok: false, error: 'Enter plain text (max 120 characters, no markup).' }
      } else if (input.key === 'site_logo_url') {
        valid = validateImageUrl(value)
        if (!valid) return { ok: false, error: 'Enter a full https:// URL or a site path starting with /.' }
      } else {
        valid = validatePublicUrl(value)
        if (!valid) return { ok: false, error: 'Enter a full URL starting with https://.' }
      }
      const { error } = await supabase
        .from('site_settings')
        .upsert(
          { key: input.key, value: valid, updated_at: new Date().toISOString() },
          { onConflict: 'key' },
        )
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase.from('site_settings').delete().eq('key', input.key)
      if (error) return { ok: false, error: error.message }
    }
    await audit(supabase, user.id, {
      action: 'site:setting:save',
      notes: input.key,
    })
    revalidateTag(CACHE_TAGS.site, 'max')
    revalidateLocalized('/admin/site-content')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Legal inbox (takedown reports + data/contact requests)              */
/* ------------------------------------------------------------------ */

/** Resolve or dismiss a copyright report from the legal inbox. Separate from
 *  the trust & safety pipeline's `resolveReport` (status-flow + audit log):
 *  this is the simple legal-triage path with an optional resolution note. */
export async function resolveLegalReport(
  reportId: string,
  input: { resolution?: string; dismiss?: boolean },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('managePolicies')
    const { error } = await supabase
      .from('reports')
      .update({
        status: input.dismiss ? 'dismissed' : 'resolved',
        resolution: input.resolution?.trim() || null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', reportId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: input.dismiss ? 'legal:report:dismiss' : 'legal:report:resolve',
      notes: `report=${reportId}`,
    })
    revalidateLocalized('/admin/policies')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Resolve or dismiss a data/contact request from the legal inbox. */
export async function resolveDataRequest(
  requestId: string,
  input: { resolution?: string; dismiss?: boolean },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('managePolicies')
    const { error } = await supabase
      .from('data_requests')
      .update({
        status: input.dismiss ? 'dismissed' : 'resolved',
        resolution: input.resolution?.trim() || null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', requestId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: input.dismiss ? 'legal:request:dismiss' : 'legal:request:resolve',
      notes: `data_request=${requestId}`,
    })
    revalidateLocalized('/admin/policies')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

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
    const { error } = await supabase.from('listings').update(patch).eq('content_item_id', contentItemId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'listing:update', entityType: 'listing', entityId: contentItemId })
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
      .select('id, type, status, published_at')
      .eq('id', contentItemId)
      .single()
    if (!item) return { ok: false, error: 'Listing not found.' }
    if (item.type !== 'listing') return { ok: false, error: 'This content item is not a listing.' }

    const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString()
    const { error } = await supabase
      .from('listings')
      .update({ listing_status: 'active', renewed_at: now })
      .eq('content_item_id', contentItemId)
    if (error) return { ok: false, error: error.message }

    const patch: Record<string, unknown> = { expires_at: expiresAt, is_archived: false }
    if (item.status !== 'published') {
      patch.status = 'published'
      patch.published_at = item.published_at ?? now
    }
    await supabase.from('content_items').update(patch).eq('id', contentItemId)

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

/* ------------------------------------------------------------------ */
/* Taxonomy & places (Phase 1 command center)                          */
/* ------------------------------------------------------------------ */

const TAXONOMY_CONTENT_TYPES = ['photo_story', 'news', 'listing', 'notice', 'culture'] as const
const FUNDRAISER_CURRENCIES = ['XAF', 'EUR', 'USD', 'GBP'] as const

/** Slugs are URL-safe lowercase: everything else is rejected, not mangled. */
function validSlug(value: string): boolean {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80
}

function revalidateTaxonomy() {
  revalidateLocalized('/admin/taxonomy')
  revalidateLocalized('/admin/moderation/[id]')
  // Category/location renames surface on cached public news cards and facets.
  revalidatePublicContentCache()
}

/** Create a category with its English (+ optional French) name. */
export async function createCategory(input: {
  contentType: string
  slug?: string
  nameEn: string
  nameFr?: string
  descriptionEn?: string
  descriptionFr?: string
  sortOrder?: number
  isActive?: boolean
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const contentType = input.contentType.trim()
    if (!(TAXONOMY_CONTENT_TYPES as readonly string[]).includes(contentType)) {
      return { ok: false, error: 'Unknown content type.' }
    }
    const nameEn = input.nameEn.trim()
    if (!nameEn) return { ok: false, error: 'An English name is required.' }
    const slug = (input.slug?.trim() ? slugify(input.slug) : slugify(nameEn)) || ''
    if (!slug || !validSlug(slug)) return { ok: false, error: 'Enter a valid slug (lowercase letters, numbers, hyphens).' }
    const nameFr = input.nameFr?.trim() || null

    const { data: clash } = await supabase
      .from('categories')
      .select('id')
      .eq('content_type', contentType)
      .eq('slug', slug)
      .limit(1)
    if (clash?.length) return { ok: false, error: 'This type already has a category with that slug.' }

    const { data: created, error } = await supabase
      .from('categories')
      .insert({
        content_type: contentType,
        slug,
        sort_order: input.sortOrder ?? 0,
        is_active: input.isActive ?? true,
      })
      .select('id')
      .single()
    if (error || !created) return { ok: false, error: error?.message ?? 'Could not create the category.' }

    const rows = [
      { category_id: created.id, locale: 'en', name: nameEn, description: input.descriptionEn?.trim() || null },
      ...(nameFr ? [{ category_id: created.id, locale: 'fr', name: nameFr, description: input.descriptionFr?.trim() || null }] : []),
    ]
    const { error: transErr } = await supabase.from('category_translations').insert(rows)
    if (transErr) return { ok: false, error: transErr.message }

    await audit(supabase, user.id, { action: 'taxonomy:category:create', notes: `${contentType}/${slug}` })
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Rename / reorder / toggle a category. Slugs stay editable — category links
 *  are filter params, never canonical URLs, so renames break nothing indexed. */
export async function updateCategory(
  categoryId: string,
  input: {
    slug?: string
    contentType?: string
    nameEn?: string
    nameFr?: string | null
    descriptionEn?: string | null
    descriptionFr?: string | null
    sortOrder?: number
    isActive?: boolean
  },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const { data: current } = await supabase
      .from('categories')
      .select('id, slug, content_type')
      .eq('id', categoryId)
      .limit(1)
    const row = (current ?? [])[0] as { id: string; slug: string; content_type: string } | undefined
    if (!row) return { ok: false, error: 'Category not found.' }

    const patch: Record<string, unknown> = {}
    if (input.slug !== undefined) {
      const slug = slugify(input.slug.trim())
      if (!slug || !validSlug(slug)) return { ok: false, error: 'Enter a valid slug (lowercase letters, numbers, hyphens).' }
      patch.slug = slug
    }
    if (input.contentType !== undefined) {
      const ct = input.contentType.trim()
      if (!(TAXONOMY_CONTENT_TYPES as readonly string[]).includes(ct)) return { ok: false, error: 'Unknown content type.' }
      patch.content_type = ct
    }
    if (input.sortOrder !== undefined) patch.sort_order = input.sortOrder
    if (input.isActive !== undefined) patch.is_active = input.isActive

    const targetType = (patch.content_type as string | undefined) ?? row.content_type
    const targetSlug = (patch.slug as string | undefined) ?? row.slug
    if (patch.slug !== undefined || patch.content_type !== undefined) {
      const { data: clash } = await supabase
        .from('categories')
        .select('id')
        .eq('content_type', targetType)
        .eq('slug', targetSlug)
        .neq('id', categoryId)
        .limit(1)
      if (clash?.length) return { ok: false, error: 'This type already has a category with that slug.' }
    }

    if (Object.keys(patch).length > 0) {
      const { error } = await supabase.from('categories').update(patch).eq('id', categoryId)
      if (error) return { ok: false, error: error.message }
    }

    if (input.nameEn !== undefined || input.descriptionEn !== undefined) {
      const nameEn = input.nameEn?.trim()
      if (input.nameEn !== undefined && !nameEn) return { ok: false, error: 'An English name is required.' }
      const { error } = await supabase.from('category_translations').upsert(
        {
          category_id: categoryId,
          locale: 'en',
          name: nameEn ?? targetSlug,
          description: input.descriptionEn?.trim() || null,
        },
        { onConflict: 'category_id,locale' },
      )
      if (error) return { ok: false, error: error.message }
    }
    if (input.nameFr !== undefined || input.descriptionFr !== undefined) {
      const nameFr = input.nameFr?.trim() || null
      if (nameFr) {
        const { error } = await supabase.from('category_translations').upsert(
          {
            category_id: categoryId,
            locale: 'fr',
            name: nameFr,
            description: input.descriptionFr?.trim() || null,
          },
          { onConflict: 'category_id,locale' },
        )
        if (error) return { ok: false, error: error.message }
      } else {
        await supabase.from('category_translations').delete().eq('category_id', categoryId).eq('locale', 'fr')
      }
    }

    await audit(supabase, user.id, {
      action: 'taxonomy:category:update',
      notes: `${row.content_type}/${row.slug} → ${targetType}/${targetSlug}`,
    })
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Delete a category (admin only). Items must be reassigned first — pass
 *  reassignToId to move them in the same step, otherwise the delete is
 *  blocked with the live usage count. */
export async function deleteCategory(categoryId: string, reassignToId?: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertAdmin()
    const { data: current } = await supabase
      .from('categories')
      .select('id, slug, content_type')
      .eq('id', categoryId)
      .limit(1)
    const row = (current ?? [])[0] as { id: string; slug: string; content_type: string } | undefined
    if (!row) return { ok: false, error: 'Category not found.' }

    const { count } = await supabase
      .from('content_items')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', categoryId)
    const usage = count ?? 0

    if (usage > 0) {
      if (!reassignToId) {
        return { ok: false, error: `Cannot delete: ${usage} content item${usage === 1 ? '' : 's'} still use${usage === 1 ? 's' : ''} this category. Reassign them first.` }
      }
      if (reassignToId === categoryId) return { ok: false, error: 'Reassign to a different category.' }
      const { data: target } = await supabase
        .from('categories')
        .select('id, content_type')
        .eq('id', reassignToId)
        .limit(1)
      const targetRow = (target ?? [])[0] as { id: string; content_type: string } | undefined
      if (!targetRow) return { ok: false, error: 'Reassignment target not found.' }
      if (targetRow.content_type !== row.content_type) {
        return { ok: false, error: 'Reassign to a category of the same content type.' }
      }
    }

    const { error } = await supabase.rpc('admin_delete_category', {
      p_category_id: categoryId,
      p_reassign_to: reassignToId ?? null,
      p_actor_id: user.id,
    })
    if (error) return { ok: false, error: error.message }
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Create a location (place hub + content geography). Slug auto-derives. */
export async function createLocation(input: {
  name: string
  slug?: string
  locale?: string
  locationType?: string
  description?: string
  latitude?: number | null
  longitude?: number | null
  parentId?: string | null
  isActive?: boolean
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const name = input.name.trim()
    if (!name) return { ok: false, error: 'A name is required.' }
    const slug = (input.slug?.trim() ? slugify(input.slug) : slugify(name)) || ''
    if (!slug || !validSlug(slug)) return { ok: false, error: 'Enter a valid slug (lowercase letters, numbers, hyphens).' }

    const { data: clash } = await supabase.from('locations').select('id').eq('slug', slug).limit(1)
    if (clash?.length) return { ok: false, error: 'A location with that slug already exists.' }

    const parentId: string | null = input.parentId ?? null
    if (parentId) {
      const { data: parent } = await supabase.from('locations').select('id').eq('id', parentId).limit(1)
      if (!parent?.length) return { ok: false, error: 'Parent location not found.' }
    }

    const { error } = await supabase.from('locations').insert({
      name,
      slug,
      locale: input.locale === 'fr' ? 'fr' : 'en',
      location_type: input.locationType?.trim() || null,
      description: input.description?.trim() || null,
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      parent_id: parentId,
      is_active: input.isActive ?? true,
    })
    if (error) return { ok: false, error: error.message }

    await audit(supabase, user.id, { action: 'taxonomy:location:create', notes: slug })
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Walk up the parent chain to reject hierarchy cycles. */
async function locationCreatesCycle(
  supabase: AdminContext['supabase'],
  locationId: string,
  newParentId: string,
): Promise<boolean> {
  let cursor: string | null = newParentId
  for (let i = 0; i < 10; i++) {
    if (cursor === locationId) return true
    if (!cursor) return false
    const { data } = await supabase.from('locations').select('parent_id').eq('id', cursor).limit(1)
    const row = (data ?? [])[0] as { parent_id: string | null } | undefined
    if (!row) return false
    cursor = row.parent_id
  }
  return true
}

/** Edit a location. Slug renames preserve the old public URL as a redirect. */
export async function updateLocation(
  locationId: string,
  input: {
    name?: string
    slug?: string
    locale?: string
    locationType?: string | null
    description?: string | null
    latitude?: number | null
    longitude?: number | null
    parentId?: string | null
    isActive?: boolean
  },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const { data: current } = await supabase
      .from('locations')
      .select('id, name, slug')
      .eq('id', locationId)
      .limit(1)
    const row = (current ?? [])[0] as { id: string; name: string; slug: string } | undefined
    if (!row) return { ok: false, error: 'Location not found.' }

    const patch: Record<string, unknown> = {}
    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name) return { ok: false, error: 'A name is required.' }
      patch.name = name
    }
    if (input.slug !== undefined) {
      const slug = slugify(input.slug.trim())
      if (!slug || !validSlug(slug)) return { ok: false, error: 'Enter a valid slug (lowercase letters, numbers, hyphens).' }
      patch.slug = slug
    }
    if (patch.slug !== undefined && patch.slug !== row.slug) {
      const { data: clash } = await supabase
        .from('locations')
        .select('id')
        .eq('slug', patch.slug as string)
        .neq('id', locationId)
        .limit(1)
      if (clash?.length) return { ok: false, error: 'A location with that slug already exists.' }
    }
    if (input.locationType !== undefined) patch.location_type = input.locationType?.trim() || null
    if (input.description !== undefined) patch.description = input.description?.trim() || null
    if (input.locale !== undefined) patch.locale = input.locale === 'fr' ? 'fr' : 'en'
    if (input.latitude !== undefined) patch.latitude = input.latitude
    if (input.longitude !== undefined) patch.longitude = input.longitude
    if (input.isActive !== undefined) patch.is_active = input.isActive
    if (input.parentId !== undefined) {
      if (input.parentId === locationId) return { ok: false, error: 'A location cannot be its own parent.' }
      if (input.parentId && (await locationCreatesCycle(supabase, locationId, input.parentId))) {
        return { ok: false, error: 'That parent would create a cycle.' }
      }
      if (input.parentId) {
        const { data: parent } = await supabase.from('locations').select('id').eq('id', input.parentId).limit(1)
        if (!parent?.length) return { ok: false, error: 'Parent location not found.' }
      }
      patch.parent_id = input.parentId
    }

    if (Object.keys(patch).length === 0) return { ok: true }
    const { error } = await supabase.from('locations').update(patch).eq('id', locationId)
    if (error) return { ok: false, error: error.message }

    const newSlug = (patch.slug as string | undefined) ?? row.slug
    if (newSlug !== row.slug) {
      const { error: redirectError } = await supabase.from('location_slug_redirects').upsert({
        location_id: locationId,
        old_slug: row.slug,
        created_by: user.id,
      }, { onConflict: 'old_slug' })
      if (redirectError) return { ok: false, error: redirectError.message }
    }
    await audit(supabase, user.id, {
      action: 'taxonomy:location:update',
      entityType: 'location',
      entityId: locationId,
      notes: newSlug === row.slug ? row.slug : `slug: ${row.slug} → ${newSlug} (redirect created)`,
    })
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Delete a location (admin only). Content + profiles must be reassigned first
 *  (pass reassignToId to move both in one step); businesses are unlinked and
 *  child locations become top-level. */
export async function deleteLocation(locationId: string, reassignToId?: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertAdmin()
    const { data: current } = await supabase
      .from('locations')
      .select('id, name, slug')
      .eq('id', locationId)
      .limit(1)
    const row = (current ?? [])[0] as { id: string; name: string; slug: string } | undefined
    if (!row) return { ok: false, error: 'Location not found.' }

    const [{ count: contentCount }, { count: profileCount }] = await Promise.all([
      supabase.from('content_items').select('id', { count: 'exact', head: true }).eq('location_id', locationId),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('location_id', locationId),
    ])
    const usage = (contentCount ?? 0) + (profileCount ?? 0)

    if (usage > 0) {
      if (!reassignToId) {
        return {
          ok: false,
          error: `Cannot delete: ${contentCount ?? 0} content item${(contentCount ?? 0) === 1 ? '' : 's'} and ${profileCount ?? 0} profile${(profileCount ?? 0) === 1 ? '' : 's'} still use this location. Reassign them first.`,
        }
      }
      if (reassignToId === locationId) return { ok: false, error: 'Reassign to a different location.' }
      const { data: target } = await supabase.from('locations').select('id').eq('id', reassignToId).limit(1)
      if (!target?.length) return { ok: false, error: 'Reassignment target not found.' }
    }

    const { error } = await supabase.rpc('admin_delete_location', {
      p_location_id: locationId,
      p_reassign_to: reassignToId ?? null,
      p_actor_id: user.id,
    })
    if (error) return { ok: false, error: error.message }
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Fetch all location slug redirects for administrative review. */
export async function getLocationRedirects(): Promise<{
  ok: boolean
  error?: string
  redirects?: Array<{
    id: string
    old_slug: string
    created_at: string
    location_id: string
    location_name: string
    location_slug: string
  }>
}> {
  try {
    const { supabase } = await assertCapability('manageContent')
    const { data, error } = await supabase
      .from('location_slug_redirects')
      .select('id, old_slug, created_at, location_id, locations(name, slug)')
      .order('created_at', { ascending: false })
    if (error) return { ok: false, error: error.message }
    const redirects = ((data ?? []) as unknown as Array<{
      id: string
      old_slug: string
      created_at: string
      location_id: string
      locations: { name: string; slug: string } | null
    }>).map((row) => ({
      id: row.id,
      old_slug: row.old_slug,
      created_at: row.created_at,
      location_id: row.location_id,
      location_name: row.locations?.name ?? 'Unknown',
      location_slug: row.locations?.slug ?? '',
    }))
    return { ok: true, redirects }
  } catch (e) {
    return fail(e)
  }
}

/** Delete a location slug redirect (admin/staff). */
export async function deleteLocationRedirect(redirectId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const { data: current } = await supabase
      .from('location_slug_redirects')
      .select('id, old_slug, location_id')
      .eq('id', redirectId)
      .limit(1)
    const row = (current ?? [])[0] as { id: string; old_slug: string; location_id: string } | undefined
    if (!row) return { ok: false, error: 'Redirect not found.' }

    const { error } = await supabase.from('location_slug_redirects').delete().eq('id', redirectId)
    if (error) return { ok: false, error: error.message }

    await audit(supabase, user.id, {
      action: 'taxonomy:location_redirect:delete',
      notes: `old_slug=${row.old_slug}`,
    })
    revalidateTaxonomy()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

