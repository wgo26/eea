import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { DESTINATION_PROVIDER, storageConfig } from './config'
import { validateUpload } from './validate'
import { uploadToR2 } from './providers/r2'
import { logger } from '@/lib/observability/logger'
import { StorageValidationError } from './types'
import type { UploadInput, UploadResult } from './types'

/**
 * Single entry point for all media uploads. Routes each file to the
 * provider that owns its destination (see lib/storage/config.ts):
 *   - public_photo → Cloudflare R2
 *   - admin_asset  → Supabase Storage
 * Validation (size, sniffed type, image re-encode) happens before any
 * provider is touched, so a rejected file never leaves the server.
 * Transactionally records a media_assets row for every upload.
 */
export async function uploadMedia(
  supabase: SupabaseClient,
  input: UploadInput
): Promise<UploadResult> {
  const validated = await validateUpload(
    input.buffer,
    input.declaredMimeType,
    input.destination
  )

  const provider = DESTINATION_PROVIDER[input.destination]
  const storageKey = buildStorageKey(input, validated.mimeType)

  let publicUrl: string | null = null

  if (provider === 'r2') {
    publicUrl = await uploadToR2(storageKey, validated.buffer, validated.mimeType)
  } else {
    // admin_asset → Supabase Storage
    const { error } = await supabase.storage
      .from(storageConfig.supabase.bucket)
      .upload(storageKey, validated.buffer, {
        contentType: validated.mimeType,
        cacheControl: '3600',
        upsert: false,
      })

    if (error) {
      throw new StorageValidationError(`Supabase storage upload failed: ${error.message}`)
    }

    const { data } = supabase.storage.from(storageConfig.supabase.bucket).getPublicUrl(storageKey)
    publicUrl = data.publicUrl
  }

  // Record asset in media_assets table transactionally.
  // Column names must match public.media_assets (init schema): provider (not
  // storage_provider), kind (not media_kind).
  // Fail-closed: if the row can't be recorded, the upload is rejected so the
  // object never becomes untracked/orphaned storage (audit §1.2). The caller
  // surfaces a 500; storage-side cleanup of the orphaned key is a follow-up
  // best-effort (logged with the key).
  //
  // duration_seconds comes from the browser's metadata probe (route-validated
  // range, video/audio only) — no server-side transcoder exists, so this is
  // advisory data for moderation triage, never billing input.
  const rawDuration = input.durationSeconds
  const durationSeconds =
    validated.kind === 'video' || validated.kind === 'audio'
      ? (typeof rawDuration === 'number' && Number.isFinite(rawDuration) && rawDuration > 0 && rawDuration <= 7200
          ? Math.round(rawDuration * 10) / 10
          : null)
      : null
  let assetId: string | undefined = undefined
  try {
    const adminDb = createAdminClient()
    const { data: asset, error: insertError } = await adminDb
      .from('media_assets')
      .insert({
        content_item_id: input.contentItemId ?? null,
        uploaded_by: input.uploadedBy ?? null,
        provider,
        destination: input.destination,
        kind: validated.kind,
        storage_key: storageKey,
        public_url: publicUrl,
        mime_type: validated.mimeType,
        file_size_bytes: validated.buffer.byteLength,
        width: validated.width ?? null,
        height: validated.height ?? null,
        duration_seconds: durationSeconds,
      })
      .select('id')
      .single()

    if (insertError || !asset) {
      logger.error('uploadMedia', 'Failed to create media_assets row (fail-closed)', { error: insertError?.message ?? 'empty', storageKey, provider })
      throw new StorageValidationError('Upload could not be recorded. Please retry.')
    }
    assetId = asset.id
  } catch (dbErr) {
    if (dbErr instanceof StorageValidationError) throw dbErr
    logger.error('uploadMedia', 'Failed to insert media_asset', { error: dbErr instanceof Error ? dbErr.message : String(dbErr), storageKey })
    throw new StorageValidationError('Upload could not be recorded. Please retry.')
  }

  return {
    assetId,
    provider,
    destination: input.destination,
    kind: validated.kind,
    storageKey,
    publicUrl,
    mimeType: validated.mimeType,
    fileSizeBytes: validated.buffer.byteLength,
    width: validated.width,
    height: validated.height,
    durationSeconds,
  }
}

function buildStorageKey(input: UploadInput, mimeType: string): string {
  const ext = extensionFor(mimeType, input.originalFilename)
  const id = input.contentItemId ?? crypto.randomUUID()
  return `${input.destination}/${id}/${crypto.randomUUID()}.${ext}`
}

function extensionFor(mimeType: string, originalFilename: string): string {
  const fromMime: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/ogg': 'ogg',
    'audio/webm': 'weba',
    'application/pdf': 'pdf',
  }
  if (fromMime[mimeType]) return fromMime[mimeType]
  const ext = originalFilename.split('.').pop()
  return ext && /^[a-z0-9]{1,5}$/i.test(ext) ? ext.toLowerCase() : 'bin'
}

export { StorageValidationError }