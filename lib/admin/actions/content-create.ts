import 'server-only'

import { type AdminContext } from '@/lib/admin/auth'
import { type ContentDraftInput } from '../content-validation'
import { syncContentTags } from '@/lib/admin/tags'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  uniqueSlug,
  syncPhotos,
  upsertTranslations,
  deleteStoredMedia,
  revalidatePublicContentCache,
  revalidateLocalized,
} from './_shared'

/**
 * The single content-item creation path.
 *
 * Two screens create a post: Admin → Content ("New content") and Admin →
 * Moderation ("Approve & publish"). They used to own separate copies of the
 * same insert — item row, translations, photos, extension rows, status flip —
 * and copies drift the way copies do: the moderation copy never learned to
 * write `events` rows or tags, never accepted an explicit slug, and dropped the
 * photo asset passthrough. Approving a culture submission therefore published a
 * story with no date, venue or ticket link, and the drawer had no field that
 * could put them back.
 *
 * One builder now. A field handled here is available to both screens
 * immediately, which is the only durable defence against the class.
 */

export const CONTENT_TYPES = ['photo_story', 'news', 'listing', 'notice', 'culture', 'micro_story'] as const
export type CreatedContentType = (typeof CONTENT_TYPES)[number]

export type PublishMode = 'now' | 'schedule' | 'draft'

export type CreatedContentItem = { id: string; slug: string; type: CreatedContentType }

export type CreateContentOptions = {
  type: string
  draft: ContentDraftInput
  publish: PublishMode
  /** ISO — only read when publish === 'schedule'. */
  scheduledFor?: string
  expiresAt?: string | null
  /**
   * Explicit permalink (the Content form exposes the field, and so does the
   * approve form now). Blank falls back to `slugBase`, then the type, and a
   * collision is suffixed by uniqueSlug.
   */
  slug?: string
  /** Publish-date override for a back-dated post; ignored for draft/scheduled. */
  publishedAt?: string | null
  /**
   * Author fallback: an item created by staff with no picked profile is
   * attributed to the creator. The moderation path passes the submitter
   * instead, so a community story keeps its reporter.
   */
  authorFallbackId?: string | null
  /**
   * Community attribution — `content_items.submitted_by`. Real and queried
   * (lib/admin/queries/content-ops.ts, lib/queries/buy-sell.ts, the digest
   * contributor filter), and set by the moderation path: a story approved from
   * a submission belongs to the person who reported it, while `author_id`
   * stays the staff editor who shaped it. The create path leaves it null.
   */
  submittedById?: string | null
  /** Resolved client — callers that already hold a context pass it in. */
  supabase?: AdminContext['supabase']
}

/** Operator-facing failure that must not be logged as an unexpected throw. */
export class ContentCreateError extends Error {}

/**
 * Insert the content item with its translations, media, tags and per-type
 * extension row, then flip it to the target status. Everything short of the
 * final status flip is rolled back if any step throws, so a retry never
 * collides with a half-built row on the slug.
 *
 * Throws `ContentCreateError` with an operator-facing message; the calling
 * action turns that into `{ ok: false }`.
 */
export async function createContentRow(opts: CreateContentOptions): Promise<CreatedContentItem> {
  const supabase = opts.supabase ?? createAdminClient()
  const type = opts.type.trim()
  if (!(CONTENT_TYPES as readonly string[]).includes(type)) {
    throw new ContentCreateError('Unknown content type.')
  }
  const contentType = type as CreatedContentType
  if (opts.publish === 'schedule' && !opts.scheduledFor) {
    throw new ContentCreateError('A schedule date is required when scheduling.')
  }

  const now = new Date().toISOString()
  const draft = opts.draft
  const requestedSlug = (opts.slug ?? draft.slug ?? '').trim()
  const slug = await uniqueSlug(supabase, requestedSlug || draft.slugBase || contentType)

  const { data: created, error: createErr } = await supabase
    .from('content_items')
    .insert({
      type: contentType,
      slug,
      // Flipped to the target status only once every child row exists, so a
      // publish never exposes an item with no translations.
      status: 'draft',
      verification: draft.verification ?? null,
      location_id: draft.locationId || null,
      category_id: draft.categoryId || null,
      author_id: draft.authorId || opts.authorFallbackId || null,
      submitted_by: opts.submittedById ?? null,
      expires_at: opts.expiresAt || null,
    })
    .select('id')
    .single()
  if (createErr || !created) {
    throw new ContentCreateError(createErr?.message ?? 'Could not create the content item.')
  }
  const contentItemId = created.id as string

  try {
    await upsertTranslations(supabase, contentItemId, draft.translations)

    if ((draft.photos ?? []).length > 0 || (draft.attachments ?? []).length > 0) {
      await syncPhotos(supabase, contentItemId, draft.photos ?? [], [], draft.photographerCredit ?? null, draft.attachments ?? [])
    }

    // Tags were the field only one of the two screens wrote: a post approved
    // from the queue silently arrived untagged, so it missed every tag facet
    // and the related-stories rail.
    if (draft.tags !== undefined) {
      await syncContentTags(supabase, contentItemId, draft.tags)
    }

    await insertExtensionRow(supabase, contentItemId, contentType, draft, opts.expiresAt)
  } catch (e) {
    await rollbackContent(supabase, contentItemId)
    throw e instanceof Error ? e : new ContentCreateError('Could not create the content item.')
  }

  if (opts.publish !== 'draft') {
    // Inferred (not annotated) so the typed `update` helper accepts it — the
    // same shape the callers of this builder used before it was extracted.
    const statusPatch =
      opts.publish === 'now'
        ? { status: 'published', published_at: opts.publishedAt || now }
        : { status: 'scheduled', scheduled_for: opts.scheduledFor }
    const { error: flipErr } = await supabase.from('content_items').update(statusPatch).eq('id', contentItemId)
    if (flipErr) {
      await rollbackContent(supabase, contentItemId)
      throw new ContentCreateError(flipErr.message)
    }
  }

  return { id: contentItemId, slug, type: contentType }
}

/**
 * Per-type extension row. Split out so the parity test can assert every
 * content type that owns a table actually reaches it — `culture`/`events` was
 * the row the moderation copy never wrote, so an approved event published with
 * no date, venue or ticket link.
 */
async function insertExtensionRow(
  supabase: AdminContext['supabase'],
  contentItemId: string,
  contentType: CreatedContentType,
  draft: ContentDraftInput,
  expiresAt?: string | null,
): Promise<void> {
  if (contentType === 'listing') {
    const { error } = await supabase.from('listings').insert({
      content_item_id: contentItemId,
      price: draft.listing?.price ?? null,
      currency: draft.listing?.currency?.toUpperCase().slice(0, 3) ?? 'XAF',
      listing_status: 'active',
      contact_phone: draft.listing?.contactPhone ?? null,
      contact_email: draft.listing?.contactEmail ?? null,
      whatsapp_number: draft.listing?.whatsappNumber ?? null,
      seller_name: draft.listing?.sellerName?.trim() || null,
    })
    if (error) throw new Error(`Could not create the listing: ${error.message}`)
  }

  if (contentType === 'notice') {
    const { error } = await supabase.from('notices').insert({
      content_item_id: contentItemId,
      notice_type: draft.notice?.noticeType ?? 'other',
      organization_name: draft.notice?.organizationName ?? null,
      contact_phone: draft.notice?.contactPhone ?? null,
      notice_date: draft.notice?.noticeDate ?? null,
      expiry_date: draft.notice?.expiryDate ?? expiresAt ?? null,
      is_official: draft.verification === 'official_source' || draft.notice?.isOfficial === true,
    })
    if (error) throw new Error(`Could not create the notice: ${error.message}`)
  }

  if (contentType === 'culture') {
    const e = draft.event
    if (e && (e.startsAt || e.endsAt || e.venueName || e.ticketUrl || e.organizerName || e.organizerPhone || e.organizerEmail)) {
      const { error } = await supabase.from('events').insert({
        content_item_id: contentItemId,
        starts_at: e.startsAt ?? null,
        ends_at: e.endsAt ?? null,
        venue_name: e.venueName ?? null,
        ticket_url: e.ticketUrl?.trim() || null,
        organizer_name: e.organizerName ?? null,
        organizer_phone: e.organizerPhone ?? null,
        organizer_email: e.organizerEmail ?? null,
      })
      if (error) throw new Error(`Could not create the event: ${error.message}`)
    }
  }
}

/**
 * Delete a half-built item and its media, including the stored upload rows —
 * leaving those behind orphans files in the bucket with nothing attached.
 * Best-effort: a failed rollback must not mask the error that started it.
 */
async function rollbackContent(supabase: AdminContext['supabase'], contentItemId: string): Promise<void> {
  try {
    const { data: mediaRows } = await supabase
      .from('media_assets')
      .select('id, provider, storage_key')
      .eq('content_item_id', contentItemId)
    for (const media of mediaRows ?? []) {
      await deleteStoredMedia(supabase, media as { provider: string; storage_key: string | null })
    }
    await supabase.from('media_assets').delete().eq('content_item_id', contentItemId)
    await supabase.from('content_items').delete().eq('id', contentItemId)
  } catch {
    // The caller still reports the failure that started this.
  }
}

/**
 * Invalidate everything a newly created item can appear on. Both screens must
 * reach the same set — the moderation copy skipped /admin/content, so an
 * approving editor's own list looked unchanged until a manual reload.
 */
export function revalidateCreatedContent(
  publish: PublishMode,
  adminPaths: string[] = ['/admin/content', '/admin/dashboard'],
) {
  if (publish !== 'draft') revalidatePublicContentCache()
  for (const path of adminPaths) revalidateLocalized(path)
}



