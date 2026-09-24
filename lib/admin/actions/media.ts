'use server'

/**
 * Media archive management (plan Phase 5.3, spec §6).
 *
 * The `media_assets` table already carries the archive columns
 * (`archived_at`, crop/resize fields and the full rights block — migration
 * `20261101000002_media_archive_management`). These actions expose them:
 * metadata/rights editing, crop + resize transforms (stored as transform
 * parameters the renderer applies — the original bytes are never rewritten),
 * reversible archiving and full-text metadata search.
 *
 * Capability: `media.manage`. Every mutation writes to `audit_events`
 * (spec §19) with `resource_type = 'media_asset'`; metadata must never carry
 * file bytes, only references and descriptors.
 */

import { assertCapability } from '@/lib/admin/auth'
import { createAdminClient, type UpdateOf } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { auditEvent, fail, revalidateLocalized, type ActionResult } from './_shared'

export type MediaMetadataInput = {
  caption?: string | null
  altText?: string | null
  credit?: string | null
  locationText?: string | null
  capturedAt?: string | null
  creator?: string | null
  copyrightHolder?: string | null
  license?: string | null
  usagePermission?: string | null
  consentStatus?: string | null
  rightsHolder?: string | null
  rightsStatus?: string | null
  rightsNotes?: string | null
}

export type CropInput = { x: number; y: number; width: number; height: number }

export type MediaSearchRow = {
  id: string
  publicUrl: string | null
  mimeType: string | null
  caption: string | null
  credit: string | null
  creator: string | null
  archivedAt: string | null
}

function fraction(n: unknown): number | null {
  const v = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(v) || v < 0 || v > 1) return null
  return v
}

export async function updateMediaMetadata(
  mediaId: string,
  input: MediaMetadataInput,
): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('media.manage')
    const admin = createAdminClient()
    const { data: existing } = await admin.from('media_assets').select('id').eq('id', mediaId).maybeSingle()
    if (!existing) return { ok: false, error: 'Media not found.' }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    const str = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() || null)
    const put = (key: string, v: string | null | undefined) => {
      const s = str(v)
      if (s !== undefined) patch[key] = s
    }
    put('caption', input.caption)
    put('alt_text', input.altText)
    put('photographer_credit', input.credit)
    put('location_text', input.locationText)
    put('creator', input.creator)
    put('copyright_holder', input.copyrightHolder)
    put('license', input.license)
    put('usage_permission', input.usagePermission)
    put('consent_status', input.consentStatus)
    put('rights_holder', input.rightsHolder)
    put('rights_status', input.rightsStatus)
    put('rights_notes', input.rightsNotes)
    if (input.capturedAt !== undefined) {
      if (!input.capturedAt) {
        patch.captured_at = null
      } else {
        const ts = new Date(input.capturedAt)
        if (Number.isNaN(ts.getTime())) return { ok: false, error: 'Invalid capture date.' }
        patch.captured_at = ts.toISOString()
      }
    }
    const { error } = await admin
      .from('media_assets')
      .update(patch as UpdateOf<'media_assets'>)
      .eq('id', mediaId)
    if (error) return { ok: false, error: error.message }

    await auditEvent(ctx.user.id, {
      action: 'media.metadata_updated',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'media_asset',
      resourceId: mediaId,
      metadata: { fields: Object.keys(patch).filter((k) => k !== 'updated_at') },
    })
    revalidateLocalized('/admin/content')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Store crop parameters (fractions of the source dimensions). The transform
 * is declarative — renderers apply it on the fly — so the archived original
 * stays byte-identical for rights and re-crop purposes.
 */
export async function cropMedia(mediaId: string, input: CropInput): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('media.manage')
    const x = fraction(input.x)
    const y = fraction(input.y)
    const width = fraction(input.width)
    const height = fraction(input.height)
    if (x === null || y === null || width === null || height === null) {
      return { ok: false, error: 'Crop values must be fractions between 0 and 1.' }
    }
    if (width <= 0 || height <= 0 || x + width > 1.0001 || y + height > 1.0001) {
      return { ok: false, error: 'Crop rectangle must sit inside the source image.' }
    }
    const admin = createAdminClient()
    const { data: existing } = await admin.from('media_assets').select('id').eq('id', mediaId).maybeSingle()
    if (!existing) return { ok: false, error: 'Media not found.' }
    const { error } = await admin
      .from('media_assets')
      .update({
        crop: { x, y, width, height } as unknown as Json,
        updated_at: new Date().toISOString(),
      } as UpdateOf<'media_assets'>)
      .eq('id', mediaId)
    if (error) return { ok: false, error: error.message }
    await auditEvent(ctx.user.id, {
      action: 'media.cropped',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'media_asset',
      resourceId: mediaId,
      metadata: { crop: { x, y, width, height } },
    })
    revalidateLocalized('/admin/content')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Store the target rendition dimensions (declarative, like the crop). */
export async function resizeMedia(mediaId: string, width: number, height: number): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('media.manage')
    const w = Math.floor(width)
    const h = Math.floor(height)
    if (!Number.isFinite(w) || !Number.isFinite(h) || w < 16 || h < 16 || w > 8192 || h > 8192) {
      return { ok: false, error: 'Dimensions must be between 16 and 8192 pixels.' }
    }
    const admin = createAdminClient()
    const { data: existing } = await admin.from('media_assets').select('id').eq('id', mediaId).maybeSingle()
    if (!existing) return { ok: false, error: 'Media not found.' }
    const { error } = await admin
      .from('media_assets')
      .update({
        resize_width: w,
        resize_height: h,
        resized_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as UpdateOf<'media_assets'>)
      .eq('id', mediaId)
    if (error) return { ok: false, error: error.message }
    await auditEvent(ctx.user.id, {
      action: 'media.resized',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'media_asset',
      resourceId: mediaId,
      metadata: { width: w, height: h },
    })
    revalidateLocalized('/admin/content')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Archive is reversible (unlike delete): the row stays, `archived_at` hides
 * it from pickers. Deletion stays an `admin`-only destructive action behind
 * the confirm dialog (spec §60).
 */
export async function archiveMedia(mediaId: string): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('media.manage')
    const admin = createAdminClient()
    const { error } = await admin
      .from('media_assets')
      .update({
        archived_at: new Date().toISOString(),
        archived_by: ctx.user.id,
        updated_at: new Date().toISOString(),
      } as UpdateOf<'media_assets'>)
      .eq('id', mediaId)
    if (error) return { ok: false, error: error.message }
    await auditEvent(ctx.user.id, {
      action: 'media.archived',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'media_asset',
      resourceId: mediaId,
    })
    revalidateLocalized('/admin/content')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function restoreMedia(mediaId: string): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('media.manage')
    const admin = createAdminClient()
    const { error } = await admin
      .from('media_assets')
      .update({ archived_at: null, archived_by: null, updated_at: new Date().toISOString() } as UpdateOf<'media_assets'>)
      .eq('id', mediaId)
    if (error) return { ok: false, error: error.message }
    await auditEvent(ctx.user.id, {
      action: 'media.restored',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'media_asset',
      resourceId: mediaId,
    })
    revalidateLocalized('/admin/content')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Full-text metadata search across caption/credit/creator/rights (spec §36). */
export async function searchMedia(query: string, limit = 10): Promise<MediaSearchRow[]> {
  try {
    await assertCapability('media.manage')
  } catch {
    return []
  }
  const q = query.trim().slice(0, 80).replace(/[%_,]/g, '')
  if (q.length < 2) return []
  const admin = createAdminClient()
  const { data } = await admin
    .from('media_assets')
    .select('id, public_url, mime_type, caption, photographer_credit, creator, archived_at')
    .or(`caption.ilike.%${q}%,photographer_credit.ilike.%${q}%,creator.ilike.%${q}%,copyright_holder.ilike.%${q}%,alt_text.ilike.%${q}%`)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 25))
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    publicUrl: (r.public_url as string | null) ?? null,
    mimeType: (r.mime_type as string | null) ?? null,
    caption: (r.caption as string | null) ?? null,
    credit: (r.photographer_credit as string | null) ?? null,
    creator: (r.creator as string | null) ?? null,
    archivedAt: (r.archived_at as string | null) ?? null,
  }))
}
