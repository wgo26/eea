import 'server-only'

import { unstable_cache } from 'next/cache'

import { db, hasDatabase, safe } from '@/lib/admin/queries/shared'
import { getActiveStates } from '@/lib/admin/queries/states'
import { CACHE_TAGS, PUBLIC_CONTENT_REVALIDATE_SECONDS } from '@/lib/cache/tags'
import { logger } from '@/lib/observability/logger'
import { NORMAL_STATE_ID, getEffectiveState } from '@/lib/platform/state-engine'
import {
  DEFAULT_BRAND_THEME,
  composeDarkTheme,
  composeTheme,
  parseBrandTheme,
  serializeTheme,
  themeToCssVariables,
  type AccessibilityMode,
  type BrandTheme,
} from './tokens'

/**
 * Branding engine loader (spec §7–§10).
 *
 * This module is SERVER-ONLY because it reads the database. Client components
 * (the theme editor, the preview renderer) must import `@/lib/branding/tokens`
 * and `@/lib/branding/validation` directly — both are pure — so the anon
 * bundle never picks up a service-role read path.
 *
 * The published theme is the single source of truth for the design tokens;
 * when no theme has been published the platform intentionally renders the
 * shipped baseline (`DEFAULT_BRAND_THEME`) rather than seeding a duplicate
 * copy of it into the database.
 */

export type ThemeStatus = 'draft' | 'review' | 'approved' | 'published' | 'archived'

const THEME_STATUSES: ThemeStatus[] = ['draft', 'review', 'approved', 'published', 'archived']

export function normalizeThemeStatus(value: string | null | undefined): ThemeStatus {
  const v = (value ?? '').toLowerCase()
  return (THEME_STATUSES as string[]).includes(v) ? (v as ThemeStatus) : 'draft'
}

/** A `brand_themes` row with its jsonb tokens parsed into the typed shape. */
export interface ThemeRecord {
  id: string
  name: string
  version: string
  status: ThemeStatus
  /** At most one row carries this (partial unique index in the migration). */
  isActive: boolean
  tokens: BrandTheme
  createdBy: string | null
  creatorName: string | null
  createdAt: string | null
  updatedAt: string | null
  approvedBy: string | null
  approvedAt: string | null
  previewToken: string | null
}

/** An immutable snapshot from `brand_theme_versions` (spec §9 history). */
export interface ThemeVersionRow {
  id: string
  themeId: string
  version: string
  changeSummary: string | null
  tokens: BrandTheme
  createdBy: string | null
  creatorName: string | null
  createdAt: string | null
}

const THEME_COLUMNS = `id, name, version, tokens, status, is_active, created_by, created_at, updated_at,
  approved_by, approved_at, preview_token, creator:profiles(display_name, full_name)`

function actorName(value: unknown): string | null {
  const actor = (Array.isArray(value) ? value[0] : value) as
    | { display_name: string | null; full_name: string | null }
    | undefined
  return actor?.display_name ?? actor?.full_name ?? null
}

export function toThemeRecord(row: Record<string, unknown>): ThemeRecord {
  return {
    id: row.id as string,
    name: (row.name as string | null) ?? 'Untitled theme',
    version: (row.version as string | null) ?? '1.0',
    status: normalizeThemeStatus(row.status as string | null),
    isActive: Boolean(row.is_active),
    tokens: parseBrandTheme(row.tokens),
    createdBy: (row.created_by as string | null) ?? null,
    creatorName: actorName(row.creator),
    createdAt: (row.created_at as string | null) ?? null,
    updatedAt: (row.updated_at as string | null) ?? null,
    approvedBy: (row.approved_by as string | null) ?? null,
    approvedAt: (row.approved_at as string | null) ?? null,
    previewToken: (row.preview_token as string | null) ?? null,
  }
}

/* ------------------------------------------------------------------ */
/* Reads                                                              */
/* ------------------------------------------------------------------ */

/**
 * Cached: the active theme is read by the admin shell on every request and by
 * the public shell once published themes drive it. The `brand` tag is
 * invalidated by every theme mutation, so a publish lands immediately; the
 * five-minute window is the direct-SQL backstop.
 */
const getCachedActiveTheme = unstable_cache(
  async (): Promise<ThemeRecord | null> => {
    const { data, error } = await safe(
      db().from('brand_themes').select(THEME_COLUMNS).eq('is_active', true).maybeSingle(),
    )
    if (error) throw new Error(error)
    return data ? toThemeRecord(data as unknown as Record<string, unknown>) : null
  },
  ['brand-active-theme'],
  { tags: [CACHE_TAGS.brand], revalidate: PUBLIC_CONTENT_REVALIDATE_SECONDS },
)

/**
 * Reported once per process. This read now runs while generating every page, and
 * the catch below is a designed fallback to the shipped baseline — not a fault.
 * As `logger.error` it turned one recoverable condition (a missing or
 * unreadable `brand_themes` table) into an event per render: 177 during a single
 * `next build`, each of which also reaches Sentry via `captureException`.
 */
let unreadableReported = false

/** The published theme record, or null when the platform runs on the baseline. */
export async function loadActiveThemeRecord(): Promise<ThemeRecord | null> {
  if (!hasDatabase()) return null
  try {
    return await getCachedActiveTheme()
  } catch (e) {
    if (!unreadableReported) {
      unreadableReported = true
      logger.warn('branding', 'active theme unreadable — rendering the shipped baseline', { error: e })
    }
    return null
  }
}

/**
 * The active theme's tokens (spec §7). Falls back to the shipped baseline so
 * callers always have a complete theme to render.
 */
export async function loadActiveTheme(): Promise<BrandTheme> {
  return (await loadActiveThemeRecord())?.tokens ?? DEFAULT_BRAND_THEME
}

export async function loadThemeRecord(id: string): Promise<ThemeRecord | null> {
  if (!hasDatabase()) return null
  try {
    const { data } = await safe(
      db().from('brand_themes').select(THEME_COLUMNS).eq('id', id).maybeSingle(),
    )
    return data ? toThemeRecord(data as unknown as Record<string, unknown>) : null
  } catch (e) {
    logger.error('branding', 'loadThemeRecord failed', { error: e })
    return null
  }
}

/**
 * Resolves the read-only share link behind `preview_token` (spec §10 safe
 * preview). Uncached and unauthenticated by design — the token is the
 * capability, so the caller must never widen this to a tokenless read.
 */
export async function loadThemeByPreviewToken(token: string): Promise<ThemeRecord | null> {
  if (!hasDatabase() || !token) return null
  try {
    const { data } = await safe(
      db().from('brand_themes').select(THEME_COLUMNS).eq('preview_token', token).maybeSingle(),
    )
    return data ? toThemeRecord(data as unknown as Record<string, unknown>) : null
  } catch (e) {
    logger.error('branding', 'loadThemeByPreviewToken failed', { error: e })
    return null
  }
}

/** Every theme, newest first — the version list on /admin/branding. */
export async function loadThemeList(): Promise<ThemeRecord[]> {
  if (!hasDatabase()) return []
  try {
    const { data } = await safe(
      db().from('brand_themes').select(THEME_COLUMNS).order('created_at', { ascending: false }).limit(100),
    )
    return ((data ?? []) as unknown as Record<string, unknown>[]).map(toThemeRecord)
  } catch (e) {
    logger.error('branding', 'loadThemeList failed', { error: e })
    return []
  }
}

/** Immutable history for one theme (spec §9: author + timestamp + changes). */
export async function loadThemeVersions(themeId: string, limit = 30): Promise<ThemeVersionRow[]> {
  if (!hasDatabase()) return []
  try {
    const { data } = await safe(
      db()
        .from('brand_theme_versions')
        .select('id, theme_id, version, change_summary, tokens, created_by, created_at, creator:profiles(display_name, full_name)')
        .eq('theme_id', themeId)
        .order('created_at', { ascending: false })
        .limit(limit),
    )
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      themeId: row.theme_id as string,
      version: (row.version as string | null) ?? '1.0',
      changeSummary: (row.change_summary as string | null) ?? null,
      tokens: parseBrandTheme(row.tokens),
      createdBy: (row.created_by as string | null) ?? null,
      creatorName: actorName(row.creator),
      createdAt: (row.created_at as string | null) ?? null,
    }))
  } catch (e) {
    logger.error('branding', 'loadThemeVersions failed', { error: e })
    return []
  }
}

/* ------------------------------------------------------------------ */
/* Composition (spec §42) + serialization                              */
/* ------------------------------------------------------------------ */

/**
 * Spec §10 — semantic tokens as CSS source for `<style>` injection ahead of
 * first paint (the preview frame and any surface that cannot take a `style`
 * prop). Pure, so client previews share the exact code path.
 */
export { serializeTheme }

/** Pure: brand base → state layer → accessibility layer. Later layers win. */
export function composeEffectiveTheme(params: {
  theme: BrandTheme | null
  stateId?: string | null
  accessibility?: AccessibilityMode
}): BrandTheme {
  return composeTheme(params.theme ?? DEFAULT_BRAND_THEME, params.stateId ?? NORMAL_STATE_ID, params.accessibility ?? 'standard')
}

export interface EffectiveTheme {
  theme: BrandTheme
  /** Null when the platform renders the shipped baseline. */
  record: ThemeRecord | null
  stateId: string
  accessibility: AccessibilityMode
  isBaseline: boolean
  variables: Record<string, string>
  /** Full dark set (shipped ramp + deviations) — dark renders standalone. */
  darkVariables: Record<string, string>
  css: string
}

/**
 * The theme the current request renders with: published tokens composed with
 * the effective system state and the accessibility preference (spec §42).
 */
export async function resolveEffectiveTheme(options?: {
  /** Overrides the resolved system state — used by preview renderers. */
  stateId?: string
  accessibility?: AccessibilityMode
}): Promise<EffectiveTheme> {
  const record = await loadActiveThemeRecord()
  let stateId = options?.stateId ?? NORMAL_STATE_ID
  if (!options?.stateId) {
    const states = await getActiveStates()
    stateId = getEffectiveState(states).id
  }
  const accessibility = options?.accessibility ?? 'standard'
  const theme = composeEffectiveTheme({ theme: record?.tokens ?? null, stateId, accessibility })
  return {
    theme,
    record,
    stateId,
    accessibility,
    isBaseline: record === null,
    variables: themeToCssVariables(theme),
    darkVariables: themeToCssVariables(composeDarkTheme(theme, stateId, accessibility)),
    css: serializeTheme(theme),
  }
}
