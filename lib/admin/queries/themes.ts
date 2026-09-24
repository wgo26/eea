import 'server-only'

import {
  type ThemeRecord,
  type ThemeVersionRow,
  loadThemeList,
  loadThemeRecord,
  loadThemeVersions,
} from '@/lib/branding'
import {
  assetMetaLine,
  normalizeAssetRole,
  normalizeAssetType,
  parseDimensions,
  type BrandAssetRole,
  type BrandAssetType,
} from '@/lib/branding/assets'
import { logger } from '@/lib/observability/logger'
import { db, hasDatabase, safe } from './shared'

export type { ThemeRecord, ThemeVersionRow }
export { loadThemeList, loadThemeRecord, loadThemeVersions }

/* ------------------------------------------------------------------ */
/* Themes (spec §7–§9)                                                */
/* ------------------------------------------------------------------ */

export type StateThemeBinding = {
  stateId: string
  themeId: string
  themeName: string
  themeVersion: string
}

/** State → theme bindings (spec §42): a contextual state may carry its own palette. */
export async function getStateThemeBindings(): Promise<StateThemeBinding[]> {
  if (!hasDatabase()) return []
  try {
    const { data } = await safe(
      db()
        .from('system_state_themes')
        .select('state_id, theme_id, theme:brand_themes(name, version)'),
    )
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
      const theme = (Array.isArray(row.theme) ? row.theme[0] : row.theme) as
        | { name: string | null; version: string | null }
        | undefined
      return {
        stateId: row.state_id as string,
        themeId: row.theme_id as string,
        themeName: theme?.name ?? '—',
        themeVersion: theme?.version ?? '1.0',
      }
    })
  } catch (e) {
    logger.error('admin', 'getStateThemeBindings failed', { error: e })
    return []
  }
}

export type ThemeUsageCounts = {
  themeId: string
  assets: number
  states: number
}

/** Asset/state usage per theme, in one pass — the list page's "usage" column. */
export async function getThemeUsageCounts(): Promise<Record<string, ThemeUsageCounts>> {
  if (!hasDatabase()) return {}
  try {
    const [assetRes, stateRes] = await Promise.all([
      safe(db().from('brand_asset_usage').select('theme_id')),
      safe(db().from('system_state_themes').select('theme_id')),
    ])
    const counts: Record<string, ThemeUsageCounts> = {}
    const bump = (themeId: string, key: 'assets' | 'states') => {
      counts[themeId] ??= { themeId, assets: 0, states: 0 }
      counts[themeId][key] += 1
    }
    for (const row of (assetRes.data ?? []) as unknown as { theme_id: string }[]) bump(row.theme_id, 'assets')
    for (const row of (stateRes.data ?? []) as unknown as { theme_id: string }[]) bump(row.theme_id, 'states')
    return counts
  } catch (e) {
    logger.error('admin', 'getThemeUsageCounts failed', { error: e })
    return {}
  }
}

/** States bound to a theme, for the theme detail page. */
export async function getThemeStateIds(themeId: string): Promise<string[]> {
  if (!hasDatabase()) return []
  try {
    const { data } = await safe(db().from('system_state_themes').select('state_id').eq('theme_id', themeId))
    return ((data ?? []) as unknown as { state_id: string }[]).map((row) => row.state_id)
  } catch (e) {
    logger.error('admin', 'getThemeStateIds failed', { error: e })
    return []
  }
}

/* ------------------------------------------------------------------ */
/* Asset library (spec §11)                                           */
/* ------------------------------------------------------------------ */

export type BrandAssetUsage = {
  themeId: string
  themeName: string
  themeVersion: string
  role: BrandAssetRole
}

export type BrandAssetRow = {
  id: string
  name: string
  type: BrandAssetType
  fileUrl: string
  provider: string
  storageKey: string | null
  dimensions: { width: number | null; height: number | null }
  /** Pre-formatted "1200 × 630 · PNG · 48 KB" (spec §11) — numbers only, no prose. */
  meta: string
  format: string | null
  sizeBytes: number | null
  version: number
  ownerId: string | null
  ownerName: string | null
  usageRestrictions: string | null
  isActive: boolean
  replacedById: string | null
  createdAt: string | null
  updatedAt: string | null
  usage: BrandAssetUsage[]
}

const ASSET_COLUMNS = `id, name, type, file_url, provider, storage_key, dimensions, format, size_bytes,
  version, owner_id, usage_restrictions, is_active, replaced_by_id, created_at, updated_at,
  owner:profiles(display_name, full_name)`

function mapAsset(row: Record<string, unknown>, usage: BrandAssetUsage[] = []): BrandAssetRow {
  const owner = (Array.isArray(row.owner) ? row.owner[0] : row.owner) as
    | { display_name: string | null; full_name: string | null }
    | undefined
  const dimensions = parseDimensions(row.dimensions)
  const format = (row.format as string | null) ?? null
  const sizeBytes = typeof row.size_bytes === 'number' ? row.size_bytes : null
  return {
    id: row.id as string,
    name: (row.name as string | null) ?? 'Untitled asset',
    type: normalizeAssetType(row.type as string | null),
    fileUrl: row.file_url as string,
    provider: (row.provider as string | null) ?? 'r2',
    storageKey: (row.storage_key as string | null) ?? null,
    dimensions,
    meta: assetMetaLine({ dimensions, format, sizeBytes }),
    format,
    sizeBytes,
    version: typeof row.version === 'number' ? row.version : 1,
    ownerId: (row.owner_id as string | null) ?? null,
    ownerName: owner?.display_name ?? owner?.full_name ?? null,
    usageRestrictions: (row.usage_restrictions as string | null) ?? null,
    isActive: row.is_active !== false,
    replacedById: (row.replaced_by_id as string | null) ?? null,
    createdAt: (row.created_at as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
    usage,
  }
}

async function loadUsageByAsset(): Promise<Record<string, BrandAssetUsage[]>> {
  const { data } = await safe(
    db()
      .from('brand_asset_usage')
      .select('asset_id, theme_id, role, theme:brand_themes(name, version)'),
  )
  const byAsset: Record<string, BrandAssetUsage[]> = {}
  for (const row of (data ?? []) as unknown as Record<string, unknown>[]) {
    const theme = (Array.isArray(row.theme) ? row.theme[0] : row.theme) as
      | { name: string | null; version: string | null }
      | undefined
    const assetId = row.asset_id as string
    byAsset[assetId] ??= []
    byAsset[assetId].push({
      themeId: row.theme_id as string,
      themeName: theme?.name ?? '—',
      themeVersion: theme?.version ?? '1.0',
      role: normalizeAssetRole(row.role as string | null),
    })
  }
  return byAsset
}

/**
 * The asset library (spec §11). `includeArchived` exists for the audit view;
 * the default list is the working set a theme editor picks from.
 */
export async function getBrandAssets(options?: {
  type?: BrandAssetType | 'all'
  includeArchived?: boolean
  search?: string
}): Promise<BrandAssetRow[]> {
  if (!hasDatabase()) return []
  try {
    let query = db().from('brand_assets').select(ASSET_COLUMNS).order('created_at', { ascending: false }).limit(200)
    if (options?.type && options.type !== 'all') query = query.eq('type', options.type)
    if (!options?.includeArchived) query = query.eq('is_active', true)
    const search = options?.search?.trim()
    if (search) query = query.ilike('name', `%${search}%`)

    const [assetsRes, usage] = await Promise.all([safe(query), loadUsageByAsset()])
    return ((assetsRes.data ?? []) as unknown as Record<string, unknown>[]).map((row) =>
      mapAsset(row, usage[row.id as string] ?? []),
    )
  } catch (e) {
    logger.error('admin', 'getBrandAssets failed', { error: e })
    return []
  }
}

export async function getBrandAssetById(id: string): Promise<BrandAssetRow | null> {
  if (!hasDatabase()) return null
  try {
    const [assetRes, usage] = await Promise.all([
      safe(db().from('brand_assets').select(ASSET_COLUMNS).eq('id', id).maybeSingle()),
      loadUsageByAsset(),
    ])
    return assetRes.data
      ? mapAsset(assetRes.data as unknown as Record<string, unknown>, usage[id] ?? [])
      : null
  } catch (e) {
    logger.error('admin', 'getBrandAssetById failed', { error: e })
    return null
  }
}

/** Every asset a theme references — the "Assets" tab's linked list. */
export async function getThemeAssets(themeId: string): Promise<BrandAssetRow[]> {
  if (!hasDatabase()) return []
  try {
    const { data } = await safe(
      db().from('brand_asset_usage').select('asset_id').eq('theme_id', themeId),
    )
    const ids = [...new Set(((data ?? []) as unknown as { asset_id: string }[]).map((row) => row.asset_id))]
    if (ids.length === 0) return []
    const usage = await loadUsageByAsset()
    const { data: assets } = await safe(db().from('brand_assets').select(ASSET_COLUMNS).in('id', ids))
    return ((assets ?? []) as unknown as Record<string, unknown>[]).map((row) =>
      mapAsset(row, usage[row.id as string] ?? []),
    )
  } catch (e) {
    logger.error('admin', 'getThemeAssets failed', { error: e })
    return []
  }
}
