import type { SupabaseClient } from '@supabase/supabase-js'
import { DESTINATION_PROVIDER, storageConfig } from './config'
import { validateUpload } from './validate'
import { uploadToR2 } from './providers/r2'
import { StorageValidationError } from './types'
import type { UploadInput, UploadResult } from './types'

/**
 * Single entry point for all media uploads. Routes each file to the
 * provider that owns its destination (see lib/storage/config.ts):
 *   - public_photo → Cloudflare R2
 *   - admin_asset  → Supabase Storage
 * Validation (size, sniffed type, image re-encode) happens before any
 * provider is touched, so a rejected file never leaves the server.
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

  if (provider === 'r2') {
    const publicUrl = await uploadToR2(storageKey, validated.buffer, validated.mimeType)
    return {
      provider,
      destination: input.destination,
      kind: validated.kind,
      storageKey,
      publicUrl,
      mimeType: validated.mimeType,
      fileSizeBytes: validated.buffer.byteLength,
      width: validated.width,
      height: validated.height,
    }
  }

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

  return {
    provider,
    destination: input.destination,
    kind: validated.kind,
    storageKey,
    publicUrl: data.publicUrl,
    mimeType: validated.mimeType,
    fileSizeBytes: validated.buffer.byteLength,
    width: validated.width,
    height: validated.height,
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
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'application/pdf': 'pdf',
  }
  if (fromMime[mimeType]) return fromMime[mimeType]
  const ext = originalFilename.split('.').pop()
  return ext && /^[a-z0-9]{1,5}$/i.test(ext) ? ext.toLowerCase() : 'bin'
}

export { StorageValidationError }