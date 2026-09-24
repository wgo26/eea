/**
 * Brand asset vocabulary (spec §11) — pure and client-safe, so the asset
 * library component and the server-side queries agree on one type union and one
 * metadata line without dragging a DB read into the browser bundle.
 *
 * The `role` of an asset is the theme token path it fills, which is what makes
 * "replace this logo" auditable: the usage rows name the surface, not just the
 * theme (spec §11 "usage restrictions").
 */

export const BRAND_ASSET_TYPES = ['logo', 'wordmark', 'icon', 'illustration'] as const
export type BrandAssetType = (typeof BRAND_ASSET_TYPES)[number]

export function isBrandAssetType(value: unknown): value is BrandAssetType {
  return typeof value === 'string' && (BRAND_ASSET_TYPES as readonly string[]).includes(value)
}

export function normalizeAssetType(value: string | null | undefined): BrandAssetType {
  return isBrandAssetType(value) ? value : 'logo'
}

/** Where an asset is consumed — mirrors `brand_asset_usage.role`. */
export const BRAND_ASSET_ROLES = ['logo', 'favicon', 'social_image', 'illustration'] as const
export type BrandAssetRole = (typeof BRAND_ASSET_ROLES)[number]

export function isBrandAssetRole(value: unknown): value is BrandAssetRole {
  return typeof value === 'string' && (BRAND_ASSET_ROLES as readonly string[]).includes(value)
}

export function normalizeAssetRole(value: string | null | undefined): BrandAssetRole {
  return isBrandAssetRole(value) ? value : 'logo'
}

/** `imagery.logoUrl` → `logo`, so a token reference resolves to its usage role. */
export function roleForTokenPath(path: string): BrandAssetRole | null {
  const match = /^imagery\.(\w+)$/.exec(path.trim())
  return match ? normalizeAssetRole(match[1]) : null
}

export interface AssetDimensions {
  width: number | null
  height: number | null
}

/** `jsonb` tolerates half-filled objects — a missing dimension stays null. */
export function parseDimensions(value: unknown): AssetDimensions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { width: null, height: null }
  const row = value as Record<string, unknown>
  const number = (input: unknown) =>
    typeof input === 'number' && Number.isFinite(input) && input > 0 ? Math.round(input) : null
  return { width: number(row.width) ?? number(row.w), height: number(row.height) ?? number(row.h) }
}

export function formatBytes(size: number | null | undefined): string | null {
  if (typeof size !== 'number' || !Number.isFinite(size) || size <= 0) return null
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`
  return `${(size / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDimensions(dimensions: AssetDimensions): string | null {
  if (!dimensions.width || !dimensions.height) return null
  return `${dimensions.width} × ${dimensions.height}`
}

/**
 * Spec §11 — the compact metadata line every library card shows. Purely
 * numeric/format text (no prose), so it needs no dictionary entry.
 */
export function assetMetaLine(input: {
  dimensions: AssetDimensions
  format?: string | null
  sizeBytes?: number | null
}): string {
  const parts = [
    formatDimensions(input.dimensions),
    input.format?.trim()?.toUpperCase() || null,
    formatBytes(input.sizeBytes),
  ].filter((part): part is string => Boolean(part))
  return parts.join(' · ')
}

/**
 * Container formats the upload pipeline accepts for brand assets. SVGs are
 * rejected project-wide (the MIME allowlist in app/api/uploads/route.ts), so
 * the library never offers them.
 */
export const BRAND_ASSET_FORMATS = ['png', 'jpeg', 'webp'] as const
