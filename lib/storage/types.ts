// Must match public.storage_destination / public.storage_provider / public.media_kind
// in the database schema.

export type StorageDestination = 'public_photo' | 'admin_asset' | 'backup'
export type StorageProvider = 'r2' | 'supabase' | 'b2' | 'cloudinary'
export type MediaKind = 'image' | 'video' | 'audio' | 'document'

export interface UploadInput {
  /** Raw file bytes as received from the client (already read into memory/buffer by the route handler). */
  buffer: Buffer
  /** Original filename as supplied by the client — never trusted, only used for extension/display. */
  originalFilename: string
  /** Client-supplied Content-Type — never trusted alone, cross-checked against sniffed bytes. */
  declaredMimeType: string
  destination: StorageDestination
  /** Null when the media belongs to a not-yet-approved submission rather than a published content item. */
  contentItemId?: string | null
  uploadedBy?: string | null
  /**
   * Client-probed playback duration in seconds (video/audio only, via the
   * browser's metadata reader). Informational — the server clamps it to a
   * sane range but cannot verify it without a transcode pipeline.
   */
  durationSeconds?: number | null
}

export interface UploadResult {
  assetId?: string
  provider: StorageProvider
  destination: StorageDestination
  kind: MediaKind
  storageKey: string
  publicUrl: string | null
  mimeType: string
  fileSizeBytes: number
  width?: number | null
  height?: number | null
  durationSeconds?: number | null
}

export class StorageValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'StorageValidationError'
  }
}
