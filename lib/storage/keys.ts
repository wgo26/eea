import { randomUUID } from 'crypto'
import type { StorageDestination } from './types'

const DESTINATION_PREFIX: Record<StorageDestination, string> = {
  public_photo: 'public-photo',
  admin_asset: 'admin-asset',
  backup: 'backup',
}

/** Lowercase, strip anything but a-z 0-9 . _ -, collapse repeats — never trust a client filename directly. */
export function normalizeFilename(originalFilename: string): string {
  const dot = originalFilename.lastIndexOf('.')
  const ext = dot >= 0 ? originalFilename.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, '') : ''
  const base = (dot >= 0 ? originalFilename.slice(0, dot) : originalFilename)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'file'

  return ext ? `${base}.${ext}` : base
}

/**
 * public-photo/{content_id}/{media_id}/{filename}
 * admin-asset/{user_id}/{uuid}/{filename}
 * (per the auth/storage runbook)
 *
 * When contentItemId is null (submission not yet linked to a published
 * content item), "pending" is used as the folder segment — the key is
 * still permanently valid once media_assets.content_item_id is set later,
 * since nothing re-derives the path from that column.
 */
export function generateStorageKey(params: {
  destination: StorageDestination
  contentItemId?: string | null
  uploadedBy?: string | null
  originalFilename: string
  mediaId?: string
}): { storageKey: string; mediaId: string } {
  const mediaId = params.mediaId ?? randomUUID()
  const filename = normalizeFilename(params.originalFilename)
  const prefix = DESTINATION_PREFIX[params.destination]

  const scopeSegment =
    params.destination === 'admin_asset'
      ? params.uploadedBy ?? 'anonymous'
      : params.contentItemId ?? 'pending'

  return {
    mediaId,
    storageKey: `${prefix}/${scopeSegment}/${mediaId}/${filename}`,
  }
}
