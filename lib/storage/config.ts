import type { StorageDestination, StorageProvider, MediaKind } from './types'

/**
 * Section 14's provider split, encoded once so nothing else in the app
 * needs to know or decide "which provider handles this":
 *   - Cloudflare R2  → public-facing photography (public_photo)
 *   - Supabase Storage → small admin/user assets (admin_asset)
 *   - Backblaze B2   → backup mirror only — never a direct upload target,
 *                       see lib/storage/backup.ts
 *   - Cloudinary     → optional transform layer on top of R2 URLs, not a
 *                       storage destination — see lib/storage/cloudinary.ts
 */
export const DESTINATION_PROVIDER: Record<StorageDestination, StorageProvider> = {
  public_photo: 'r2',
  admin_asset: 'supabase',
  backup: 'b2',
}

export const MAX_FILE_SIZE_BYTES: Record<StorageDestination, number> = {
  public_photo: 15 * 1024 * 1024, // 15MB — photo story / news / listing / notice images
  admin_asset: 5 * 1024 * 1024, // 5MB — avatars, ad creatives, small internal assets
  backup: Number.POSITIVE_INFINITY, // backup mirror copies whatever the source already validated
}

// Allowlist, not denylist — anything not explicitly listed is rejected,
// which is what makes this safe against executable content by construction
// rather than by trying to enumerate every dangerous type.
export const ALLOWED_MIME_TYPES: Record<MediaKind, string[]> = {
  image: ['image/jpeg', 'image/png', 'image/webp'],
  video: ['video/mp4', 'video/quicktime'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/wav'],
  document: ['application/pdf'],
}

export function mimeToKind(mimeType: string): MediaKind | null {
  for (const [kind, types] of Object.entries(ALLOWED_MIME_TYPES) as [MediaKind, string[]][]) {
    if (types.includes(mimeType)) return kind
  }
  return null
}

export const storageConfig = {
  r2: {
    accountId: process.env.R2_ACCOUNT_ID!,
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    bucket: process.env.R2_BUCKET!,
    // Custom domain or r2.dev subdomain the bucket is served from.
    publicBaseUrl: process.env.R2_PUBLIC_BASE_URL!,
  },
  b2: {
    keyId: process.env.B2_KEY_ID!,
    applicationKey: process.env.B2_APPLICATION_KEY!,
    bucket: process.env.B2_BACKUP_BUCKET!,
    // Region-specific S3-compatible endpoint, e.g. https://s3.us-west-004.backblazeb2.com
    endpoint: process.env.B2_ENDPOINT!,
  },
  supabase: {
    bucket: process.env.SUPABASE_ADMIN_ASSET_BUCKET || 'admin-asset',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || '',
  },
}
