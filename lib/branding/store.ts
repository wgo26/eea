import 'server-only'

import { logger } from '@/lib/observability/logger'
import { createAdminClient, type InsertOf, type UpdateOf } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import type { BrandAssetType } from './assets'
import { nextMajorVersion, nextMinorVersion, parseBrandTheme, type BrandTheme } from './tokens'

/**
 * Theme + asset persistence (plan Phase 3.1/3.3, spec §9/§11).
 *
 * Mechanics only: no authorization, no audit trail. `lib/admin/actions/themes.ts`
 * owns the capability checks, the two-person control seam, the audit events and
 * the cache invalidation — the same split as `credential-manager.ts` vs
 * `admin/actions/credentials.ts`.
 *
 * Versioning model (spec §9 — "versioning with author/timestamp/changes"):
 *   * `brand_themes` holds the CURRENT state of a named identity: its tokens,
 *     lifecycle status and the version in the row.
 *   * `brand_theme_versions` is append-only history — one snapshot per save,
 *     publish or restore, each with its own version, author, timestamp and
 *     change summary. Nothing here ever rewrites or deletes a snapshot, so a
 *     rollback writes a NEW row that carries the old tokens forward.
 *   * A published theme is immutable in place: editing it must go through a
 *     new draft + publish, which is what makes the public change auditable and
 *     (spec §44) two-person controlled.
 *
 * Files are never deleted here. Archiving flips `is_active` only, the previous
 * file keeps serving any theme that still references it, and the library keeps
 * the row for rollback and audit (spec §9/§11).
 */

export type StoreResult = { ok: true } | { ok: false; error: string }
export type StoreIdResult = { ok: true; id: string } | { ok: false; error: string }
export type VersionedResult = { ok: true; id: string; version: string } | { ok: false; error: string }

/* ------------------------------------------------------------------ */
/* Theme rows                                                          */
/* ------------------------------------------------------------------ */

type ThemeRow = {
  id: string
  name: string
  version: string
  status: string
  is_active: boolean
  tokens: unknown
}

const THEME_ROW_COLUMNS = 'id, name, version, status, is_active, tokens'

async function readThemeRow(themeId: string): Promise<ThemeRow | null> {
  const { data, error } = await createAdminClient()
    .from('brand_themes')
    .select(THEME_ROW_COLUMNS)
    .eq('id', themeId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return (data as unknown as ThemeRow | null) ?? null
}

/** Statuses whose tokens may still change in place (a publication may not). */
const EDITABLE_STATUSES = new Set(['draft', 'review', 'approved'])

/**
 * Append one immutable snapshot. Versions come from the caller, so a concurrent
 * save can already have claimed it — retry with the next minor instead of
 * failing the save (the snapshot is history, not a lock).
 */
async function writeSnapshot(params: {
  themeId: string
  version: string
  tokens: BrandTheme
  changeSummary?: string | null
  actorId: string
}): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
  const admin = createAdminClient()
  let candidate = params.version
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { error } = await admin.from('brand_theme_versions').insert({
      theme_id: params.themeId,
      version: candidate,
      tokens: params.tokens as unknown as Json,
      change_summary: params.changeSummary?.trim() || null,
      created_by: params.actorId,
    } as InsertOf<'brand_theme_versions'>)
    if (!error) return { ok: true, version: candidate }
    if (error.code !== '23505') return { ok: false, error: error.message }
    candidate = nextMinorVersion(candidate)
  }
  return { ok: false, error: 'Could not record the theme version.' }
}

export type CreateThemeParams = {
  name: string
  tokens: BrandTheme
  createdBy: string
  changeSummary?: string | null
}

/** A new named theme in `draft`, with its first immutable snapshot. */
export async function createThemeRow(params: CreateThemeParams): Promise<VersionedResult> {
  try {
    const admin = createAdminClient()
    const name = params.name.trim()
    if (!name) return { ok: false, error: 'A theme name is required.' }

    const { data, error } = await admin
      .from('brand_themes')
      .insert({
        name,
        version: params.tokens.version?.trim() || '1.0',
        tokens: params.tokens as unknown as Json,
        status: 'draft',
        is_active: false,
        created_by: params.createdBy,
        preview_token: crypto.randomUUID(),
      } as InsertOf<'brand_themes'>)
      .select('id, version')
      .single()
    if (error || !data) return { ok: false, error: error?.message ?? 'Could not create the theme.' }

    const snapshot = await writeSnapshot({
      themeId: data.id,
      version: data.version,
      tokens: params.tokens,
      changeSummary: params.changeSummary ?? 'Initial draft',
      actorId: params.createdBy,
    })
    if (!snapshot.ok) return { ok: false, error: snapshot.error }
    return { ok: true, id: data.id, version: snapshot.version }
  } catch (e) {
    logger.error('branding', 'createThemeRow failed', { error: e })
    return { ok: false, error: e instanceof Error ? e.message : 'Could not create the theme.' }
  }
}

export type SaveThemeParams = {
  themeId: string
  tokens: BrandTheme
  actorId: string
  changeSummary?: string | null
}

/** Save an edit: new minor version on the row + an immutable snapshot. */
export async function saveThemeTokens(params: SaveThemeParams): Promise<VersionedResult> {
  try {
    const row = await readThemeRow(params.themeId)
    if (!row) return { ok: false, error: 'Theme not found.' }
    if (row.status === 'published') {
      return {
        ok: false,
        error: 'A published theme cannot be edited — create a draft from it, then publish that.',
      }
    }
    if (!EDITABLE_STATUSES.has(row.status)) {
      return { ok: false, error: 'Archived themes cannot be edited — create a new draft instead.' }
    }

    const version = nextMinorVersion(row.version)
    // Editing a theme that was already approved invalidates the approval: the
    // signature applied to the tokens it was given, so the row returns to draft
    // and must be approved again (spec §44).
    const status = row.status === 'approved' ? 'draft' : row.status
    const { error } = await createAdminClient()
      .from('brand_themes')
      .update({
        tokens: params.tokens as unknown as Json,
        version,
        status,
        updated_at: new Date().toISOString(),
      } as UpdateOf<'brand_themes'>)
      .eq('id', params.themeId)
    if (error) return { ok: false, error: error.message }

    const snapshot = await writeSnapshot({
      themeId: params.themeId,
      version,
      tokens: params.tokens,
      changeSummary: params.changeSummary ?? 'Draft saved',
      actorId: params.actorId,
    })
    if (!snapshot.ok) return { ok: false, error: snapshot.error }
    return { ok: true, id: params.themeId, version: snapshot.version }
  } catch (e) {
    logger.error('branding', 'saveThemeTokens failed', { error: e })
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save the theme.' }
  }
}

export type ApproveThemeParams = {
  themeId: string
  actorId: string
  changeSummary?: string | null
}

/**
 * Spec §46 "… → Validate → Approve → Publish": records the review as a state
 * change plus a history entry. Approval is a state, not a lock — the next save
 * demotes the row back to `draft` (see saveThemeTokens), so the signature always
 * covers the tokens it was given.
 */
export async function approveThemeRow(params: ApproveThemeParams): Promise<VersionedResult> {
  try {
    const row = await readThemeRow(params.themeId)
    if (!row) return { ok: false, error: 'Theme not found.' }
    if (row.is_active || row.status === 'published') {
      return { ok: false, error: 'This theme is already live.' }
    }
    if (row.status === 'approved') return { ok: true, id: params.themeId, version: row.version }
    if (!EDITABLE_STATUSES.has(row.status)) {
      return { ok: false, error: 'Archived themes cannot be approved — restore it first.' }
    }

    const version = nextMinorVersion(row.version)
    const now = new Date().toISOString()
    const { error } = await createAdminClient()
      .from('brand_themes')
      .update({
        status: 'approved',
        version,
        approved_by: params.actorId,
        approved_at: now,
        updated_at: now,
      } as UpdateOf<'brand_themes'>)
      .eq('id', params.themeId)
    if (error) return { ok: false, error: error.message }

    const snapshot = await writeSnapshot({
      themeId: params.themeId,
      version,
      tokens: parseBrandTheme(row.tokens),
      changeSummary: params.changeSummary ?? 'Approved',
      actorId: params.actorId,
    })
    if (!snapshot.ok) return { ok: false, error: snapshot.error }
    return { ok: true, id: params.themeId, version: snapshot.version }
  } catch (e) {
    logger.error('branding', 'approveThemeRow failed', { error: e })
    return { ok: false, error: e instanceof Error ? e.message : 'Could not approve the theme.' }
  }
}

export type PublishThemeRowParams = {
  themeId: string
  actorId: string
  changeSummary?: string | null
}

/**
 * Make a theme the live one. The incumbent is deactivated FIRST: the partial
 * unique index on `is_active` allows exactly one active row, so activating
 * before deactivating would violate it.
 */
export async function publishThemeRow(params: PublishThemeRowParams): Promise<VersionedResult> {
  try {
    const row = await readThemeRow(params.themeId)
    if (!row) return { ok: false, error: 'Theme not found.' }
    if (row.status === 'archived') return { ok: false, error: 'This theme is archived — restore it first.' }
    if (row.is_active) return { ok: false, error: 'This theme is already live.' }

    const admin = createAdminClient()
    const now = new Date().toISOString()
    const { error: clearError } = await admin
      .from('brand_themes')
      .update({ is_active: false, updated_at: now } as UpdateOf<'brand_themes'>)
      .eq('is_active', true)
      .neq('id', params.themeId)
    if (clearError) return { ok: false, error: clearError.message }

    const version = nextMajorVersion(row.version)
    const { error } = await admin
      .from('brand_themes')
      .update({
        is_active: true,
        status: 'published',
        version,
        approved_by: params.actorId,
        approved_at: now,
        updated_at: now,
      } as UpdateOf<'brand_themes'>)
      .eq('id', params.themeId)
    if (error) return { ok: false, error: error.message }

    const tokens = parseBrandTheme(row.tokens)
    const snapshot = await writeSnapshot({
      themeId: params.themeId,
      version,
      tokens,
      changeSummary: params.changeSummary ?? 'Published',
      actorId: params.actorId,
    })
    if (!snapshot.ok) return { ok: false, error: snapshot.error }
    return { ok: true, id: params.themeId, version: snapshot.version }
  } catch (e) {
    logger.error('branding', 'publishThemeRow failed', { error: e })
    return { ok: false, error: e instanceof Error ? e.message : 'Could not publish the theme.' }
  }
}

export async function archiveThemeRow(params: {
  themeId: string
  actorId: string
  changeSummary?: string | null
}): Promise<StoreResult> {
  try {
    const row = await readThemeRow(params.themeId)
    if (!row) return { ok: false, error: 'Theme not found.' }
    if (row.is_active) {
      return { ok: false, error: 'This theme is live — set another theme live before archiving it.' }
    }
    if (row.status === 'archived') return { ok: true }

    const { error } = await createAdminClient()
      .from('brand_themes')
      .update({ status: 'archived', is_active: false, updated_at: new Date().toISOString() } as UpdateOf<'brand_themes'>)
      .eq('id', params.themeId)
    if (error) return { ok: false, error: error.message }

    const snapshot = await writeSnapshot({
      themeId: params.themeId,
      version: nextMinorVersion(row.version),
      tokens: parseBrandTheme(row.tokens),
      changeSummary: params.changeSummary ?? 'Archived',
      actorId: params.actorId,
    })
    return snapshot.ok ? { ok: true } : { ok: false, error: snapshot.error }
  } catch (e) {
    logger.error('branding', 'archiveThemeRow failed', { error: e })
    return { ok: false, error: e instanceof Error ? e.message : 'Could not archive the theme.' }
  }
}

/**
 * Roll a snapshot's tokens forward into the theme as a new draft version.
 * Live themes are excluded on purpose: re-painting the public site is a
 * publication, and publications carry the §44 second signature — the action
 * layer routes that case through `createThemeRow` + `publishTheme` instead.
 */
export async function restoreThemeVersion(params: {
  themeId: string
  versionId: string
  actorId: string
}): Promise<VersionedResult> {
  try {
    const row = await readThemeRow(params.themeId)
    if (!row) return { ok: false, error: 'Theme not found.' }
    if (row.is_active) {
      return {
        ok: false,
        error: 'This theme is live — create a draft from that version and publish it instead.',
      }
    }

    const { data, error } = await createAdminClient()
      .from('brand_theme_versions')
      .select('id, theme_id, version, tokens')
      .eq('id', params.versionId)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!data || data.theme_id !== params.themeId) {
      return { ok: false, error: 'That version does not belong to this theme.' }
    }

    const version = nextMinorVersion(row.version)
    const tokens = parseBrandTheme(data.tokens)
    const { error: writeError } = await createAdminClient()
      .from('brand_themes')
      .update({
        tokens: data.tokens as unknown as Json,
        version,
        status: 'draft',
        updated_at: new Date().toISOString(),
      } as UpdateOf<'brand_themes'>)
      .eq('id', params.themeId)
    if (writeError) return { ok: false, error: writeError.message }

    const snapshot = await writeSnapshot({
      themeId: params.themeId,
      version,
      tokens,
      changeSummary: `Restored from v${data.version}`,
      actorId: params.actorId,
    })
    if (!snapshot.ok) return { ok: false, error: snapshot.error }
    return { ok: true, id: params.themeId, version: snapshot.version }
  } catch (e) {
    logger.error('branding', 'restoreThemeVersion failed', { error: e })
    return { ok: false, error: e instanceof Error ? e.message : 'Could not restore that version.' }
  }
}

/** Spec §46 — a stable, unguessable preview link for a draft. */
export async function ensurePreviewToken(themeId: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('brand_themes')
      .select('preview_token')
      .eq('id', themeId)
      .maybeSingle()
    if (data?.preview_token) return data.preview_token

    const token = crypto.randomUUID()
    const { error } = await admin
      .from('brand_themes')
      .update({ preview_token: token, updated_at: new Date().toISOString() } as UpdateOf<'brand_themes'>)
      .eq('id', themeId)
    if (error) return null
    return token
  } catch (e) {
    logger.error('branding', 'ensurePreviewToken failed', { error: e })
    return null
  }
}

/* ------------------------------------------------------------------ */
/* Asset usage (spec §11)                                              */
/* ------------------------------------------------------------------ */

function imageryRole(tokenKey: string): string | null {
  if (tokenKey === 'logoUrl') return 'logo'
  if (tokenKey === 'faviconUrl') return 'favicon'
  if (tokenKey === 'socialImageUrl') return 'social_image'
  return null
}

/**
 * Re-derive `brand_asset_usage` from the theme's imagery tokens. Called after
 * every save/publish so the junction reflects what the theme actually points
 * at — a URL that matches no library asset simply records nothing, which is how
 * an externally hosted asset stays visible as "not in the library".
 */
export async function syncBrandAssetUsage(themeId: string, theme: BrandTheme): Promise<void> {
  try {
    const admin = createAdminClient()
    const references: { url: string; role: string }[] = []
    for (const [key, value] of Object.entries(theme.imagery)) {
      const role = imageryRole(key)
      if (!role || typeof value !== 'string' || !value.trim()) continue
      references.push({ url: value.trim(), role })
    }

    const { data: existing } = await admin
      .from('brand_asset_usage')
      .select('id, asset_id, role')
      .eq('theme_id', themeId)
    const current = (existing ?? []) as unknown as { id: string; asset_id: string; role: string }[]
    const desired: { asset_id: string; role: string }[] = []

    if (references.length > 0) {
      const { data: assets } = await admin
        .from('brand_assets')
        .select('id, file_url')
        .in('file_url', references.map((reference) => reference.url))
      const byUrl = new Map(
        ((assets ?? []) as unknown as { id: string; file_url: string }[]).map((asset) => [asset.file_url, asset.id]),
      )
      for (const reference of references) {
        const assetId = byUrl.get(reference.url)
        if (assetId) desired.push({ asset_id: assetId, role: reference.role })
      }
    }

    const key = (row: { asset_id: string; role: string }) => `${row.asset_id}:${row.role}`
    const desiredKeys = new Set(desired.map(key))
    const staleIds = current.filter((row) => !desiredKeys.has(key(row))).map((row) => row.id)
    if (staleIds.length > 0) {
      await admin.from('brand_asset_usage').delete().in('id', staleIds)
    }
    const existingKeys = new Set(current.map(key))
    const missing = desired.filter((row) => !existingKeys.has(key(row)))
    if (missing.length > 0) {
      await admin.from('brand_asset_usage').insert(
        missing.map((row) => ({ asset_id: row.asset_id, theme_id: themeId, role: row.role })) as InsertOf<'brand_asset_usage'>[],
      )
    }
  } catch (e) {
    // Usage bookkeeping must never fail a save — the theme is the source of truth.
    logger.error('branding', 'syncBrandAssetUsage failed', { error: e })
  }
}

/* ------------------------------------------------------------------ */
/* Asset library (spec §11)                                            */
/* ------------------------------------------------------------------ */

export type BrandAssetInput = {
  name: string
  type: BrandAssetType
  fileUrl: string
  provider?: string
  storageKey?: string | null
  dimensions?: { width?: number | null; height?: number | null } | null
  format?: string | null
  sizeBytes?: number | null
  usageRestrictions?: string | null
  ownerId: string
}

function assetWriteShape(input: BrandAssetInput): Record<string, unknown> {
  return {
    name: input.name.trim(),
    type: input.type,
    file_url: input.fileUrl.trim(),
    provider: input.provider?.trim() || 'r2',
    storage_key: input.storageKey ?? null,
    dimensions: {
      width: input.dimensions?.width ?? null,
      height: input.dimensions?.height ?? null,
    } as Json,
    format: input.format?.trim()?.toLowerCase() || null,
    size_bytes: input.sizeBytes ?? null,
    usage_restrictions: input.usageRestrictions?.trim() || null,
    owner_id: input.ownerId,
  }
}

export async function insertBrandAsset(input: BrandAssetInput): Promise<StoreIdResult> {
  try {
    if (!input.name.trim()) return { ok: false, error: 'An asset name is required.' }
    if (!input.fileUrl.trim()) return { ok: false, error: 'An asset file is required.' }
    const { data, error } = await createAdminClient()
      .from('brand_assets')
      .insert({ ...assetWriteShape(input), is_active: true, version: 1 } as InsertOf<'brand_assets'>)
      .select('id')
      .single()
    if (error || !data) return { ok: false, error: error?.message ?? 'Could not save the asset.' }
    return { ok: true, id: data.id }
  } catch (e) {
    logger.error('branding', 'insertBrandAsset failed', { error: e })
    return { ok: false, error: e instanceof Error ? e.message : 'Could not save the asset.' }
  }
}

export type BrandAssetPatch = {
  name?: string
  type?: BrandAssetType
  usageRestrictions?: string | null
  isActive?: boolean
}

/** Metadata edits only — the file itself is replaced, never overwritten. */
export async function updateBrandAsset(id: string, patch: BrandAssetPatch): Promise<StoreResult> {
  try {
    const shape: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (patch.name !== undefined) {
      if (!patch.name.trim()) return { ok: false, error: 'An asset name is required.' }
      shape.name = patch.name.trim()
    }
    if (patch.type !== undefined) shape.type = patch.type
    if (patch.usageRestrictions !== undefined) shape.usage_restrictions = patch.usageRestrictions?.trim() || null
    if (patch.isActive !== undefined) shape.is_active = patch.isActive

    const { error } = await createAdminClient()
      .from('brand_assets')
      .update(shape as UpdateOf<'brand_assets'>)
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (e) {
    logger.error('branding', 'updateBrandAsset failed', { error: e })
    return { ok: false, error: e instanceof Error ? e.message : 'Could not update the asset.' }
  }
}

export type ReplaceAssetParams = {
  assetId: string
  input: BrandAssetInput
  actorId: string
}

export type ReplaceAssetResult =
  | { ok: true; id: string; version: number; liveReferences: number }
  | { ok: false; error: string }

/**
 * Spec §11 "replace": a NEW asset row supersedes the old one (version + 1), the
 * old row becomes inactive and points forward via `replaced_by_id`, and the old
 * asset's usages move to the replacement so the library keeps one lineage.
 *
 * Token references are rewritten for EDITABLE themes only. A published theme is
 * left pointing at the previous file — the file is retained — because changing
 * what the public renders is a publication (spec §44 two-person control), not a
 * library edit. Those references are counted back to the caller so the UI can
 * say how many live themes still need republishing.
 */
export async function replaceBrandAsset(params: ReplaceAssetParams): Promise<ReplaceAssetResult> {
  try {
    const admin = createAdminClient()
    const { data: current, error: readError } = await admin
      .from('brand_assets')
      .select('id, name, type, version, file_url, provider, storage_key')
      .eq('id', params.assetId)
      .maybeSingle()
    if (readError) return { ok: false, error: readError.message }
    if (!current) return { ok: false, error: 'Asset not found.' }

    const row = current as unknown as {
      id: string
      name: string
      type: string
      version: number
      file_url: string
    }
    const version = (typeof row.version === 'number' ? row.version : 1) + 1
    const { data: inserted, error: insertError } = await admin
      .from('brand_assets')
      .insert({
        ...assetWriteShape({
          ...params.input,
          name: params.input.name?.trim() || row.name,
          type: params.input.type ?? (row.type as BrandAssetType),
        }),
        version,
        is_active: true,
      } as InsertOf<'brand_assets'>)
      .select('id')
      .single()
    if (insertError || !inserted) return { ok: false, error: insertError?.message ?? 'Could not save the replacement.' }

    const now = new Date().toISOString()
    const { error: retireError } = await admin
      .from('brand_assets')
      .update({ is_active: false, replaced_by_id: inserted.id, updated_at: now } as UpdateOf<'brand_assets'>)
      .eq('id', row.id)
    if (retireError) return { ok: false, error: retireError.message }

    await admin.from('brand_asset_usage').update({ asset_id: inserted.id }).eq('asset_id', row.id)

    let liveReferences = 0
    const { data: themes } = await admin
      .from('brand_themes')
      .select('id, status, is_active, tokens')
      .neq('status', 'archived')
    for (const theme of (themes ?? []) as unknown as ThemeRow[]) {
      const tokens = parseBrandTheme(theme.tokens)
      const rewritten: Partial<Record<'logoUrl' | 'faviconUrl' | 'socialImageUrl', string>> = {}
      for (const key of ['logoUrl', 'faviconUrl', 'socialImageUrl'] as const) {
        if (tokens.imagery[key] === row.file_url) rewritten[key] = params.input.fileUrl.trim()
      }
      if (Object.keys(rewritten).length === 0) continue

      const isLive = Boolean(theme.is_active) || theme.status === 'published'
      if (isLive) {
        liveReferences += 1
        continue
      }
      await saveThemeTokens({
        themeId: theme.id,
        tokens: { ...tokens, imagery: { ...tokens.imagery, ...rewritten } },
        actorId: params.actorId,
        changeSummary: `Asset replaced — ${row.name} v${version}`,
      })
    }

    return { ok: true, id: inserted.id, version, liveReferences }
  } catch (e) {
    logger.error('branding', 'replaceBrandAsset failed', { error: e })
    return { ok: false, error: e instanceof Error ? e.message : 'Could not replace the asset.' }
  }
}

/**
 * Archive = remove from the working library. The storage object and the row
 * stay put: a live theme may still reference the file, and the audit trail
 * needs the record (spec §11).
 */
export async function archiveBrandAsset(id: string): Promise<StoreResult> {
  return updateBrandAsset(id, { isActive: false })
}
