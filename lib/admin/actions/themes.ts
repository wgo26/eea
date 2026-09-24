'use server'

/**
 * Branding server actions (plan Phase 3.2/3.3, spec §7–§11, §46).
 *
 * Layering: `lib/branding/store.ts` owns the mechanics (theme rows, version
 * snapshots, the asset library); this module owns authorization, the
 * two-person-control seam, the audit trail and the cache invalidation — the
 * same split as `credential-manager.ts` vs `actions/credentials.ts`.
 *
 * Spec §44 gates "global branding changes" behind a second administrator.
 * `publishTheme` is the only operation that changes what the public renders, so
 * it is the only one that requires an approval: `requestThemePublish` raises
 * the request, a different admin approves it on /admin/approvals, and
 * `publishTheme` verifies the approval before and consumes it after the
 * publication. Draft edits, approvals, archiving and asset curation stay
 * single-administrator operations — none of them is public on its own.
 *
 * Every theme is validated before it can be approved or published (spec §68),
 * and the composed preview is rendered from the same token engine the public
 * shell uses (spec §10), so the preview is not a mock.
 */

import { assertCapability, assertTwoFactorIfEnrolled } from '@/lib/admin/auth'
import {
  checkApproval,
  consumeApproval,
  isApprovalRequired,
  requestTwoPersonApproval,
} from '@/lib/admin/two-person-control'
import { loadThemeRecord } from '@/lib/branding'
import { normalizeAssetType, type BrandAssetType } from '@/lib/branding/assets'
import {
  approveThemeRow,
  archiveBrandAsset as archiveBrandAssetRecord,
  archiveThemeRow,
  createThemeRow,
  ensurePreviewToken,
  insertBrandAsset,
  publishThemeRow,
  replaceBrandAsset as replaceBrandAssetRecord,
  restoreThemeVersion,
  saveThemeTokens,
  syncBrandAssetUsage,
  updateBrandAsset as updateBrandAssetRecord,
  type BrandAssetInput,
} from '@/lib/branding/store'
import {
  DEFAULT_BRAND_THEME,
  composeDarkTheme,
  composeTheme,
  parseBrandTheme,
  serializeTheme,
  themeToCssVariables,
  type AccessibilityMode,
  type BrandTheme,
} from '@/lib/branding/tokens'
import { validateTheme, type ThemeValidationReport } from '@/lib/branding/validation'
import { NORMAL_STATE_ID } from '@/lib/platform/state-engine'
import {
  auditEvent,
  fail,
  revalidateBrandCache,
  revalidateLocalized,
  revalidatePublicContentCache,
  type ActionResult,
} from './_shared'

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

export type ThemeMutationResult = { ok: true; version: string } | { ok: false; error: string }

export type ThemeDraftInput = {
  name: string
  /** Tokens to start from — defaults to the shipped baseline. */
  tokens?: BrandTheme | null
  /** Spec §9: seed a draft from another theme (a published one is immutable). */
  fromThemeId?: string | null
  changeSummary?: string | null
}

export type SaveThemeDraftInput = {
  tokens: BrandTheme
  changeSummary?: string | null
}

export type SaveThemeDraftResult =
  | { ok: true; version: string; validation: ThemeValidationReport }
  | { ok: false; error: string }

function validationErrors(report: ThemeValidationReport): string[] {
  return report.issues.filter((issue) => issue.level === 'error').map((issue) => issue.message)
}

/** One readable sentence from a validation report — first failure + count. */
function describeErrors(report: ThemeValidationReport): string {
  const errors = validationErrors(report)
  if (errors.length === 0) return ''
  return errors.length === 1 ? errors[0] : `${errors[0]} (+${errors.length - 1} more)`
}

function revalidateAdminTheme(themeId?: string): void {
  revalidateLocalized('/admin/branding')
  if (themeId) revalidateLocalized(`/admin/branding/${themeId}`)
}

/* ------------------------------------------------------------------ */
/* Theme drafts (spec §9)                                              */
/* ------------------------------------------------------------------ */

/**
 * A new named theme in `draft`, authorized by `branding.publish` (the create
 * branch of the branding capability). Cloning from a published theme is how the
 * designer iterates on what the site is currently running: the published row
 * itself never changes in place.
 */
export async function createThemeDraft(input: ThemeDraftInput): Promise<{ ok: true; id: string; version: string } | { ok: false; error: string }> {
  try {
    const ctx = await assertCapability('branding.publish')
    const name = input.name?.trim()
    if (!name) return { ok: false, error: 'A theme name is required.' }

    let tokens: BrandTheme | null = input.tokens ? parseBrandTheme(input.tokens) : null
    let clonedFrom: string | null = null
    if (!tokens && input.fromThemeId) {
      const source = await loadThemeRecord(input.fromThemeId)
      if (!source) return { ok: false, error: 'The theme to copy was not found.' }
      tokens = source.tokens
      clonedFrom = `${source.name} v${source.version}`
    }

    const result = await createThemeRow({
      name,
      tokens: tokens ?? DEFAULT_BRAND_THEME,
      createdBy: ctx.user.id,
      changeSummary: input.changeSummary?.trim() || (clonedFrom ? `Draft from ${clonedFrom}` : 'Initial draft'),
    })
    if (!result.ok) return result

    await syncBrandAssetUsage(result.id, tokens ?? DEFAULT_BRAND_THEME)
    await auditEvent(ctx.user.id, {
      action: 'theme.draft_created',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'brand_theme',
      resourceId: result.id,
      metadata: { name, version: result.version, from: clonedFrom },
    })
    revalidateAdminTheme(result.id)
    return result
  } catch (e) {
    return fail(e)
  }
}

/**
 * Save an edit as a new minor version + immutable history snapshot. Invalid
 * tokens are allowed to be saved (a draft is a work surface, not the public
 * site) — the report travels back so the editor can gate Approve on it.
 */
export async function updateThemeDraft(
  themeId: string,
  input: SaveThemeDraftInput,
): Promise<SaveThemeDraftResult> {
  try {
    const ctx = await assertCapability('branding.publish')
    if (!themeId) return { ok: false, error: 'A theme is required.' }
    if (!input?.tokens) return { ok: false, error: 'Nothing to save.' }

    const tokens = parseBrandTheme(input.tokens)
    const validation = validateTheme(tokens)
    const result = await saveThemeTokens({
      themeId,
      tokens,
      actorId: ctx.user.id,
      changeSummary: input.changeSummary,
    })
    if (!result.ok) return result

    await syncBrandAssetUsage(themeId, tokens)
    await auditEvent(ctx.user.id, {
      action: 'theme.updated',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'brand_theme',
      resourceId: themeId,
      metadata: {
        version: result.version,
        errors: validationErrors(validation).length,
        warnings: validation.issues.length,
      },
    })
    revalidateAdminTheme(themeId)
    return { ok: true, version: result.version, validation }
  } catch (e) {
    return fail(e)
  }
}

/** Spec §46 review step — records the approval in the version history. */
export async function approveTheme(themeId: string): Promise<ThemeMutationResult> {
  try {
    const ctx = await assertCapability('branding.publish')
    const record = await loadThemeRecord(themeId)
    if (!record) return { ok: false, error: 'Theme not found.' }

    const validation = validateTheme(record.tokens)
    if (!validation.valid) {
      return { ok: false, error: `Fix the validation errors before approving: ${describeErrors(validation)}` }
    }

    const result = await approveThemeRow({ themeId, actorId: ctx.user.id })
    if (!result.ok) return result

    await auditEvent(ctx.user.id, {
      action: 'theme.approved',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'brand_theme',
      resourceId: themeId,
      metadata: { version: result.version, warnings: validation.issues.length, name: record.name },
    })
    revalidateAdminTheme(themeId)
    return { ok: true, version: result.version }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Preview (spec §10/§46)                                              */
/* ------------------------------------------------------------------ */

export type ThemePreview = {
  theme: BrandTheme
  darkTheme: BrandTheme
  /** Full dark set (shipped ramp + deviations) — dark previews standalone. */
  css: string
  darkCss: string
  variables: Record<string, string>
  validation: ThemeValidationReport
  isActive: boolean
  /** Unguessable share link key (spec §46) — null until one is created. */
  previewToken: string | null
}

export type ThemePreviewResult = ({ ok: true } & ThemePreview) | { ok: false; error: string }

/**
 * Validate and compose a theme exactly as the public shell would render it
 * (spec §10: the preview runs the real token engine, not a mock). Read-only:
 * the share token is only minted by `createPreviewLink`.
 */
export async function previewTheme(
  themeId: string,
  options: { stateId?: string | null; accessibility?: AccessibilityMode } = {},
): Promise<ThemePreviewResult> {
  try {
    await assertCapability('branding.publish')
    const record = await loadThemeRecord(themeId)
    if (!record) return { ok: false, error: 'Theme not found.' }

    const stateId = options.stateId?.trim() || NORMAL_STATE_ID
    const accessibility = options.accessibility ?? 'standard'
    const theme = composeTheme(record.tokens, stateId, accessibility)
    const darkTheme = composeDarkTheme(theme, stateId, accessibility)
    return {
      ok: true,
      theme,
      darkTheme,
      css: serializeTheme(theme),
      darkCss: serializeTheme(darkTheme),
      variables: themeToCssVariables(theme),
      validation: validateTheme(record.tokens),
      isActive: record.isActive,
      previewToken: record.previewToken,
    }
  } catch (e) {
    return fail(e)
  }
}

/** Spec §46 — mint (or return) the shareable preview key for a draft. */
export async function createPreviewLink(themeId: string): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  try {
    const ctx = await assertCapability('branding.publish')
    const token = await ensurePreviewToken(themeId)
    if (!token) return { ok: false, error: 'Could not create a preview link.' }
    await auditEvent(ctx.user.id, {
      action: 'theme.preview_link_created',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'brand_theme',
      resourceId: themeId,
    })
    revalidateAdminTheme(themeId)
    return { ok: true, token }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Publication (spec §44 two-person control)                           */
/* ------------------------------------------------------------------ */

export type RequestThemePublishResult =
  | { ok: true; approvalId: string; existing: boolean }
  | { ok: false; error: string }

/**
 * Step 1 of the §44 flow. The requester cannot approve their own request
 * (`approveTwoPersonApproval` refuses), so a second administrator must act.
 */
export async function requestThemePublish(
  themeId: string,
  reason?: string | null,
): Promise<RequestThemePublishResult> {
  try {
    const ctx = await assertTwoFactorIfEnrolled(await assertCapability('branding.publish'))
    const record = await loadThemeRecord(themeId)
    if (!record) return { ok: false, error: 'Theme not found.' }
    if (record.isActive) return { ok: false, error: 'This theme is already live.' }
    if (record.status === 'archived') return { ok: false, error: 'This theme is archived — restore it first.' }

    const validation = validateTheme(record.tokens)
    if (!validation.valid) {
      return { ok: false, error: `Fix the validation errors before requesting publication: ${describeErrors(validation)}` }
    }

    const approval = await requestTwoPersonApproval({
      action: 'branding.publish',
      actorId: ctx.user.id,
      resourceType: 'brand_theme',
      resourceId: themeId,
      reason: reason?.trim() || null,
    })
    if (!approval.ok) return approval

    await auditEvent(ctx.user.id, {
      action: 'approval.requested',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'brand_theme',
      resourceId: themeId,
      metadata: {
        approvalAction: 'branding.publish',
        approvalId: approval.id,
        themeName: record.name,
        version: record.version,
        reason: reason?.trim() || null,
        expiresAt: approval.expiresAt,
      },
    })
    revalidateAdminTheme(themeId)
    revalidateLocalized('/admin/approvals')
    return { ok: true, approvalId: approval.id, existing: approval.existing }
  } catch (e) {
    return fail(e)
  }
}

export type PublishThemeResult = { ok: true; version: string } | { ok: false; error: string }

/**
 * Step 3 of the §44 flow: make the theme live. `checkApproval` is read-only and
 * runs BEFORE the publication; `consumeApproval` runs only after it succeeds, so
 * a failed attempt leaves the approval usable and an approval can never
 * authorize a second publication.
 */
export async function publishTheme(
  themeId: string,
  options: { approvalId?: string | null; changeSummary?: string | null } = {},
): Promise<PublishThemeResult> {
  try {
    const ctx = await assertTwoFactorIfEnrolled(await assertCapability('branding.publish'))
    const approvalId = options.approvalId?.trim() || null
    if (isApprovalRequired('branding.publish')) {
      if (!approvalId) {
        return {
          ok: false,
          error: 'Publishing a theme needs a second administrator’s approval — request one first.',
        }
      }
      const verdict = await checkApproval({
        approvalId,
        action: 'branding.publish',
        actorId: ctx.user.id,
        resourceType: 'brand_theme',
        resourceId: themeId,
      })
      if (!verdict.ok) return verdict
    }

    const record = await loadThemeRecord(themeId)
    if (!record) return { ok: false, error: 'Theme not found.' }
    const validation = validateTheme(record.tokens)
    if (!validation.valid) {
      return { ok: false, error: `This theme does not validate: ${describeErrors(validation)}` }
    }

    const result = await publishThemeRow({
      themeId,
      actorId: ctx.user.id,
      changeSummary: options.changeSummary,
    })
    if (!result.ok) return result
    if (approvalId) await consumeApproval(approvalId)

    await syncBrandAssetUsage(themeId, record.tokens)
    await auditEvent(ctx.user.id, {
      action: 'theme.published',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'brand_theme',
      resourceId: themeId,
      metadata: {
        name: record.name,
        fromVersion: record.version,
        version: result.version,
        warnings: validation.issues.length,
        approvalId,
      },
    })
    // Publishing re-paints every public surface: the brand tag drives the
    // theme loader, and the content caches carry the rendered chrome.
    revalidateBrandCache()
    revalidatePublicContentCache()
    revalidateAdminTheme(themeId)
    revalidateLocalized('/admin/approvals')
    return { ok: true, version: result.version }
  } catch (e) {
    return fail(e)
  }
}

export async function archiveTheme(themeId: string): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('branding.publish')
    const result = await archiveThemeRow({ themeId, actorId: ctx.user.id })
    if (!result.ok) return result

    await auditEvent(ctx.user.id, {
      action: 'theme.archived',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'brand_theme',
      resourceId: themeId,
    })
    revalidateAdminTheme(themeId)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Spec §9 rollback: the snapshot's tokens are carried forward as a NEW draft
 * version (history is append-only). Live themes are excluded — see
 * `restoreThemeVersion`; re-painting the site is a publication and goes through
 * `publishTheme`.
 */
export async function revertToThemeVersion(themeId: string, versionId: string): Promise<ThemeMutationResult> {
  try {
    const ctx = await assertCapability('branding.publish')
    if (!versionId) return { ok: false, error: 'Choose a version to restore.' }
    const result = await restoreThemeVersion({ themeId, versionId, actorId: ctx.user.id })
    if (!result.ok) return result

    const record = await loadThemeRecord(themeId)
    if (record) await syncBrandAssetUsage(themeId, record.tokens)
    await auditEvent(ctx.user.id, {
      action: 'theme.version_restored',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'brand_theme',
      resourceId: themeId,
      metadata: { versionId, version: result.version, name: record?.name ?? null },
    })
    revalidateAdminTheme(themeId)
    return { ok: true, version: result.version }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Asset library (spec §11)                                            */
/* ------------------------------------------------------------------ */

export type BrandAssetActionInput = {
  name: string
  type?: string | null
  /** From the /api/uploads result — the library never re-uploads here. */
  fileUrl: string
  provider?: string | null
  storageKey?: string | null
  width?: number | null
  height?: number | null
  format?: string | null
  sizeBytes?: number | null
  usageRestrictions?: string | null
}

export type BrandAssetCreateResult = { ok: true; id: string } | { ok: false; error: string }

function toAssetInput(
  input: BrandAssetActionInput,
  ownerId: string,
  fallback?: { name: string; type: BrandAssetType },
): BrandAssetInput | { error: string } {
  const name = input.name?.trim() || fallback?.name?.trim() || ''
  const fileUrl = input.fileUrl?.trim() ?? ''
  if (!name) return { error: 'An asset name is required.' }
  if (!fileUrl) return { error: 'An asset file is required.' }
  return {
    name,
    type: normalizeAssetType(input.type ?? fallback?.type ?? null),
    fileUrl,
    provider: input.provider ?? undefined,
    storageKey: input.storageKey,
    dimensions: { width: input.width ?? null, height: input.height ?? null },
    format: input.format,
    sizeBytes: input.sizeBytes ?? null,
    usageRestrictions: input.usageRestrictions,
    ownerId,
  }
}

export async function createBrandAsset(input: BrandAssetActionInput): Promise<BrandAssetCreateResult> {
  try {
    const ctx = await assertCapability('branding.publish')
    const normalized = toAssetInput(input, ctx.user.id)
    if ('error' in normalized) return { ok: false, error: normalized.error }

    const result = await insertBrandAsset(normalized)
    if (!result.ok) return result
    await auditEvent(ctx.user.id, {
      action: 'brand_asset.created',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'brand_asset',
      resourceId: result.id,
      metadata: { name: normalized.name, type: normalized.type, provider: normalized.provider ?? null, version: 1 },
    })
    revalidateLocalized('/admin/branding/assets')
    revalidateAdminTheme()
    return result
  } catch (e) {
    return fail(e)
  }
}

/** Metadata only — the file is replaced, never overwritten (spec §11). */
export async function updateBrandAssetMeta(
  assetId: string,
  patch: { name?: string; type?: string | null; usageRestrictions?: string | null },
): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('branding.publish')
    const result = await updateBrandAssetRecord(assetId, {
      name: patch.name,
      type: patch.type === undefined ? undefined : normalizeAssetType(patch.type),
      usageRestrictions: patch.usageRestrictions,
    })
    if (!result.ok) return result

    await auditEvent(ctx.user.id, {
      action: 'brand_asset.updated',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'brand_asset',
      resourceId: assetId,
      metadata: { fields: Object.keys(patch).filter((key) => patch[key as keyof typeof patch] !== undefined) },
    })
    revalidateLocalized('/admin/branding/assets')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export type ReplaceBrandAssetResult =
  | { ok: true; id: string; version: number; liveReferences: number }
  | { ok: false; error: string }

/**
 * Spec §11 replace. Editable themes are re-pointed at the new file; a published
 * theme keeps the previous file (retained, not deleted) and is counted in
 * `liveReferences` so the UI can report which live themes still need
 * republishing.
 */
export async function replaceBrandAsset(
  assetId: string,
  input: BrandAssetActionInput,
): Promise<ReplaceBrandAssetResult> {
  try {
    const ctx = await assertCapability('branding.publish')
    const normalized = toAssetInput(input, ctx.user.id)
    if ('error' in normalized) return { ok: false, error: normalized.error }

    const result = await replaceBrandAssetRecord({ assetId, input: normalized, actorId: ctx.user.id })
    if (!result.ok) return result

    await auditEvent(ctx.user.id, {
      action: 'brand_asset.replaced',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'brand_asset',
      resourceId: result.id,
      metadata: { replacedAssetId: assetId, version: result.version, liveReferences: result.liveReferences },
    })
    revalidateLocalized('/admin/branding/assets')
    revalidateAdminTheme()
    // The replacement can re-point draft themes, so the brand tag goes too.
    revalidateBrandCache()
    return result
  } catch (e) {
    return fail(e)
  }
}

/**
 * Remove an asset from the working library. The row and the storage object stay
 * for rollback and audit (spec §9/§11) — a live theme may still reference the
 * file.
 */
export async function archiveBrandAsset(assetId: string): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('branding.publish')
    const result = await archiveBrandAssetRecord(assetId)
    if (!result.ok) return result

    await auditEvent(ctx.user.id, {
      action: 'brand_asset.archived',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'brand_asset',
      resourceId: assetId,
    })
    revalidateLocalized('/admin/branding/assets')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
