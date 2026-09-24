import 'server-only'

import { revalidatePath, revalidateTag } from 'next/cache'
import { type AdminContext, assertStaff } from '@/lib/admin/auth'
import { CACHE_TAGS } from '@/lib/cache/tags'
import { deleteFromR2 } from '@/lib/storage/providers/r2'
import { storageConfig } from '@/lib/storage/config'
import { type InsertOf, type UpdateOf, createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { sanitizeBodyHtml } from '@/lib/security/html'

/**
 * Server Functions for the admin section. Every mutation checks authorization
 * via assertStaff/assertAdmin (which throw plain Errors the client can catch),
 * performs the change through the service-role client, then revalidates the
 * affected paths so the UI reflects the new state.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

export const LOCALES = ['en', 'fr'] as const;

/** Revalidate a locale-free path in both locales (routes live under /[locale]). */
export function revalidateLocalized(path: string) {
    for (const locale of LOCALES) revalidatePath('/'+locale+path);
}

/**
 * Phase 4.1 (audit §4.1) — on-demand invalidation of the public content cache.
 * Every cached public read (news/home/listings/notices/stories/culture — see
 * lib/cache/tags.ts) is invalidated here so editorial mutations land without
 * waiting for the 5-minute ISR window. Phase 1 closed the gap where only
 * news/home/locations were invalidated and listings/notices/stories/culture
 * relied on the ISR backstop. Uses the two-argument revalidateTag
 * form (single-arg is deprecated in Next 16); profile 'max' serves the cached
 * render while the fresh one regenerates (stale-while-revalidate).
 */
export function revalidatePublicContentCache() {
    revalidateTag(CACHE_TAGS.news, 'max')
    revalidateTag(CACHE_TAGS.home, 'max')
    revalidateTag(CACHE_TAGS.listings, 'max')
    revalidateTag(CACHE_TAGS.notices, 'max')
    revalidateTag(CACHE_TAGS.stories, 'max')
    revalidateTag(CACHE_TAGS.culture, 'max')
    // Publishing changes location content lists + counts.
    revalidateTag(CACHE_TAGS.locations, 'max')
}

/** On-demand invalidation for the ad-serving cache (lib/queries/ads.ts). */
export function revalidateAdsCache() {
    revalidateTag(CACHE_TAGS.ads, 'max')
    revalidateTag(CACHE_TAGS.home, 'max')
}

/**
 * Phase 3.3 — on-demand invalidation for the brand/theme cache
 * (lib/branding/index.ts). Publishing a theme re-paints every public surface,
 * so the brand tag is paired with `revalidatePublicContentCache()` there.
 */
export function revalidateBrandCache() {
    revalidateTag(CACHE_TAGS.brand, 'max')
}

/**
 * Always the error variant — declared narrowly (not ActionResult) so callers
 * with richer success shapes (e.g. bulkInviteUsers' sent/skipped) still
 * type-check; { ok: false; error } is assignable to ActionResult everywhere.
 */
export function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
}

export type AuditEntry = {
  action: string
  contentItemId?: string | null
  entityType?: string | null
  entityId?: string | null
  submissionId?: string | null
  fromStatus?: string | null
  toStatus?: string | null
  notes?: string | null
  /** Phase 1.1 — system-trail fields (audit_events, spec §19). */
  resourceType?: string | null
  resourceId?: string | null
  requestId?: string | null
  source?: string | null
}

/**
 * Best-effort audit trail: records who did what in moderation_log (the same
 * table the audit-log page reads). Non-content entities (polls, users, ads,
 * policies, …) have no dedicated column, so the entity id travels in `notes`.
 * Never fails the action — a logging problem must not roll back an
 * already-applied change.
 */
export async function audit(
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

export type AuditEventInput = AuditEntry & {
  resourceType: string
  metadata?: Record<string, unknown> | null
  actorRole?: string | null
}

/**
 * System-wide audit event (spec §19): every privileged action lands in
 * `audit_events` with actor, role, resource, request id and source, so the
 * trail survives independently of the content pipeline. `moderation_log`
 * (via `audit()`) stays the moderation/submission source of truth; actions
 * that are both may write to each. Same best-effort contract — metadata must
 * never carry secret values (spec §19).
 */
export async function auditEvent(actorId: string, entry: AuditEventInput): Promise<void> {
  try {
    // `audit_events` is service-role-write-only (SELECT-only RLS), so this
    // owns its client instead of taking the caller's cookie-scoped one.
    const supabase = createAdminClient()
    await supabase.from('audit_events').insert({
      action: entry.action,
      actor_id: actorId,
      actor_role: entry.actorRole ?? null,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId ?? entry.entityId ?? null,
      request_id: entry.requestId ?? crypto.randomUUID(),
      source: entry.source ?? 'admin_dashboard',
      metadata: (entry.metadata ?? {}) as unknown as Json,
    })
  } catch {
    // Audit must never break the admin action itself.
  }
}

/**
 * Phase 4.6 (spec §53) — one `audit_events` row per bulk operation, never one
 * per item, so the security view can surface destructive bulk work as a
 * pattern without the trail exploding on a 200-row selection. The bulk
 * wrappers only loop single-item actions (which authorize per item), so
 * attribution is resolved here.
 */
export async function auditBulkOperation(entry: {
  action: string
  resourceType: string
  ids: string[]
  failed?: number
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const { user } = await assertStaff()
    await auditEvent(user.id, {
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.ids[0] ?? null,
      metadata: {
        selection: entry.ids.length,
        ...(entry.failed ? { failed: entry.failed } : {}),
        // Enough to trace a specific report, bounded so a huge selection does
        // not turn one row into a novel.
        sampleIds: entry.ids.slice(0, 10),
        ...entry.metadata,
      },
    })
  } catch {
    // Audit must never break the admin action itself.
  }
}

/* ------------------------------------------------------------------ */
/* Moderation                                                          */
/* ------------------------------------------------------------------ */

/** submission_type → content_type (buy_sell submissions become listing items). */
export const SUBMISSION_TO_CONTENT: Record<string, string> = {
  photo_story: 'photo_story',
  news: 'news',
  culture: 'culture',
  notice: 'notice',
  buy_sell: 'listing',
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

/** Find a unique slug, appending -2, -3… when the base collides. */
export async function uniqueSlug(supabase: AdminContext['supabase'], base: string): Promise<string> {
  const root = slugify(base) || 'submission'
  for (let i = 1; i <= 50; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`
    const { data } = await supabase.from('content_items').select('id').eq('slug', candidate).limit(1)
    if (!data || data.length === 0) return candidate
  }
  return `${root}-${Date.now()}`
}

/** Sync media_assets rows for a content item: delete dropped ids, link uploaded assets, insert new URL-only rows. */
export async function syncPhotos(
  supabase: AdminContext['supabase'],
  contentItemId: string,
  photos: { url: string; alt?: string; caption?: string; credit?: string; assetId?: string; kind?: string; mimeType?: string; durationSeconds?: number | null }[],
  keepPhotoIds: string[],
  credit: string | null,
  attachments: { url: string; kind?: 'video' | 'audio' | 'document' | 'image'; caption?: string; assetId?: string }[] = [],
): Promise<void> {
  const keep = new Set(keepPhotoIds ?? [])
  // Rows uploaded through /api/uploads already exist in media_assets
  // (uploadMedia inserts them transactionally with storage_key + metadata).
  // Their ids travel back as assetId — never delete those below, and link
  // them to this item instead of inserting duplicate URL-only rows. The
  // duplicates carried a null storage_key (and dropped kind/mime metadata),
  // which is what tripped the storage_key NOT NULL constraint.
  const linkedIds = new Set(
    [...photos, ...attachments]
      .map((p) => p.assetId)
      .filter((id): id is string => !!id),
  )
  const { data: existing } = await supabase
    .from('media_assets')
    .select('id, provider, storage_key')
    .eq('content_item_id', contentItemId)
  for (const row of existing ?? []) {
    if (!keep.has(row.id) && !linkedIds.has(row.id)) {
      await deleteStoredMedia(supabase, row as { provider: string; storage_key: string | null })
      const { error } = await supabase.from('media_assets').delete().eq('id', row.id)
      if (error) throw new Error(`Could not remove photo metadata: ${error.message}`)
    }
  }
  const newPhotos = photos.filter((p) => p.url.trim())
  const newAttachments = attachments.filter((a) => a.url.trim())
  const { count } = await supabase
    .from('media_assets')
    .select('id', { count: 'exact', head: true })
    .eq('content_item_id', contentItemId)
  let sortIndex = count ?? 0
  // Link already-uploaded rows (uploaded before the content item existed, so
  // their content_item_id is null or stale) instead of duplicating them.
  const toLink = [...newPhotos, ...newAttachments].filter((p) => p.assetId)
  for (const photo of toLink) {
    const patch: Record<string, unknown> = {
      content_item_id: contentItemId,
      public_url: photo.url.trim(),
      sort_order: sortIndex,
      is_cover: sortIndex === 0,
    }
    if ('caption' in photo && photo.caption !== undefined) {
      patch.caption = photo.caption?.trim() || null
      patch.alt_text = photo.caption?.trim() || null
    }
    if ('credit' in photo && photo.credit !== undefined) {
      patch.photographer_credit = photo.credit?.trim() || credit
    }
    if ('mimeType' in photo && photo.mimeType) patch.mime_type = photo.mimeType
    if ('durationSeconds' in photo && typeof photo.durationSeconds === 'number') {
      patch.duration_seconds = photo.durationSeconds
    }
    const { error } = await supabase.from('media_assets').update(patch as UpdateOf<'media_assets'>).eq('id', photo.assetId!)
    if (error) throw new Error(`Could not save photos: ${error.message}`)
    sortIndex += 1
  }
  // URL-pasted / library-reused entries have no asset row yet — insert
  // link-only rows (storage_key stays null; the new migration guarantees the
  // column is nullable like the repo schema declares).
  const rows = [
    ...newPhotos.filter((p) => !p.assetId).map((photo, index) => ({
      content_item_id: contentItemId,
      kind: (photo.kind as 'image' | 'video' | 'audio' | 'document' | undefined) ?? 'image',
      provider: 'r2' as const,
      destination: 'public_photo' as const,
      public_url: photo.url.trim(),
      mime_type: photo.mimeType ?? null,
      duration_seconds: typeof photo.durationSeconds === 'number' ? photo.durationSeconds : null,
      caption: photo.caption?.trim() || null,
      alt_text: (photo.alt?.trim() || photo.caption?.trim()) || null,
      photographer_credit: photo.credit?.trim() || credit,
      sort_order: sortIndex + index,
      is_cover: sortIndex + index === 0,
    })),
    ...newAttachments.filter((a) => !a.assetId).map((att, index) => ({
      content_item_id: contentItemId,
      kind: (att.kind ?? 'video') as 'video' | 'audio' | 'document' | 'image',
      provider: 'r2' as const,
      destination: 'public_photo' as const,
      public_url: att.url.trim(),
      caption: att.caption?.trim() || null,
      alt_text: att.caption?.trim() || null,
      photographer_credit: credit,
      sort_order: sortIndex + newPhotos.filter((p) => !p.assetId).length + index,
      is_cover: false,
    })),
  ]
  if (rows.length === 0) return
  const { error } = await supabase.from('media_assets').insert(rows)
  if (error) throw new Error(`Could not save photos: ${error.message}`)
}

export async function deleteStoredMedia(
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
export async function upsertTranslations(
  supabase: AdminContext['supabase'],
  contentItemId: string,
  translations: {
    locale: 'en' | 'fr'
    title: string
    excerpt?: string
    body?: string
    seoDescription?: string | null
    byline?: string | null
    shareText?: string | null
    voiceType?: 'formal' | 'pidgin' | 'camfranglais' | null
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
      // Ingestion-side sanitization (parser-based allowlist — defense in
      // depth; every public render boundary re-sanitizes): bodies may carry
      // editorial HTML (Blogger imports, rich pastes).
      body: (t.body?.trim() ? sanitizeBodyHtml(t.body.trim()) : null) ?? null,
    }
    if (t.seoDescription !== undefined) payload.seo_description = t.seoDescription?.trim() || null
    if (t.byline !== undefined) payload.byline = t.byline?.trim() || null
    // Phase 4 — WhatsApp share line + voice register (undefined = keep).
    if (t.shareText !== undefined) payload.share_text = t.shareText?.trim().slice(0, 280) || null
    if (t.voiceType !== undefined) payload.voice_type = t.voiceType ?? null
    const { error } = await supabase.from('content_translations').upsert(
      payload as InsertOf<'content_translations'>,
      { onConflict: 'content_item_id,locale,voice' },
    )
    if (error) throw new Error(`Could not save the ${t.locale} translation: ${error.message}`)
  }
}
