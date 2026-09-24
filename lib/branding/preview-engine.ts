/**
 * Spec §10/§46 — brand preview engine.
 *
 * Turns a theme plus a component name into everything a renderer needs to draw
 * a truthful sample of that component: the composed tokens, the light and dark
 * variable sets, stylesheet source, the contrast/validation report and a
 * structural description of the sample itself.
 *
 * DELIBERATELY PURE AND CLIENT-SAFE — the theme editor previews unpublished
 * drafts in the browser, so nothing here may touch the database, and no copy
 * lives here either: blocks carry dictionary keys (`copyKey`), which is what
 * keeps the preview bilingual.
 */

import {
  composeDarkTheme,
  composeTheme,
  serializeTheme,
  themeToCssVariables,
  type AccessibilityMode,
  type BrandTheme,
  type ColorTokens,
} from './tokens'
import { validateTheme, type ThemeValidationReport } from './validation'

/* ------------------------------------------------------------------ */
/* Catalogue                                                          */
/* ------------------------------------------------------------------ */

export type PreviewComponentId = 'homepage' | 'news' | 'photo-story' | 'notice' | 'buy-sell'

export type PreviewBlockKind = 'media' | 'heading' | 'text' | 'button' | 'link' | 'badge' | 'card'

/**
 * Dictionary keys are `admin.branding.preview.copy.<component>.<kind>`; the
 * renderer resolves them, so both locales preview identically.
 */
export type PreviewCopyKey = `${PreviewComponentId}.${PreviewBlockKind}`

export interface PreviewComponent {
  id: PreviewComponentId
  /** Dictionary key for the tab label. */
  labelKey: string
}

/** Spec §10 — the surfaces a theme has to hold up on. */
export const PREVIEW_COMPONENTS: PreviewComponent[] = [
  { id: 'homepage', labelKey: 'homepage' },
  { id: 'news', labelKey: 'news' },
  { id: 'photo-story', labelKey: 'photoStory' },
  { id: 'notice', labelKey: 'notice' },
  { id: 'buy-sell', labelKey: 'buySell' },
]

export type PreviewViewportId = 'desktop' | 'tablet' | 'mobile'

export interface PreviewViewport {
  id: PreviewViewportId
  /** Frame width in CSS pixels; `null` means "fill the available width". */
  width: number | null
  /** Breakpoint hint the renderer uses to stack columns. */
  stacked: boolean
}

export const PREVIEW_VIEWPORTS: PreviewViewport[] = [
  { id: 'desktop', width: null, stacked: false },
  { id: 'tablet', width: 768, stacked: false },
  { id: 'mobile', width: 390, stacked: true },
]

const SAMPLES: Record<PreviewComponentId, PreviewBlockKind[]> = {
  homepage: ['badge', 'heading', 'text', 'media', 'button', 'card'],
  news: ['badge', 'heading', 'text', 'media', 'link'],
  'photo-story': ['media', 'heading', 'text'],
  notice: ['badge', 'heading', 'text', 'link'],
  'buy-sell': ['badge', 'heading', 'media', 'text', 'button'],
}

export function isPreviewComponentId(value: string): value is PreviewComponentId {
  return PREVIEW_COMPONENTS.some((component) => component.id === value)
}

/* ------------------------------------------------------------------ */
/* Sample blocks                                                      */
/* ------------------------------------------------------------------ */

export interface PreviewBlock {
  kind: PreviewBlockKind
  /** `admin.branding.preview.copy.<copyKey>` — never inline copy. */
  copyKey: PreviewCopyKey
  /** Inline CSS derived from the composed theme. */
  style: Record<string, string>
}

/** Type-scale token → rendered sizes, so the scale control visibly does something. */
const SCALE_SIZES: Record<BrandTheme['typography']['scale'], { heading: string; text: string }> = {
  compact: { heading: '1.5rem', text: '0.9rem' },
  default: { heading: '1.75rem', text: '1rem' },
  spacious: { heading: '2.125rem', text: '1.125rem' },
}

const DENSITY_GAPS: Record<BrandTheme['spacing']['density'], string> = {
  compact: '0.5rem',
  comfortable: '0.75rem',
  spacious: '1.125rem',
}

const BUTTON_RADIUS: Record<BrandTheme['components']['buttonShape'], string> = {
  rounded: 'var(--radius, 0.625rem)',
  pill: '9999px',
  square: '0',
}

function shadowFor(theme: BrandTheme): string {
  if (theme.components.cardElevation === 'flat') return 'none'
  if (theme.components.cardElevation === 'floating') return theme.shadows.lift
  return theme.shadows.card
}

/** Imagery treatment as a filter, so the token changes what the preview shows. */
function mediaFilter(theme: BrandTheme): string {
  if (theme.imagery.treatment === 'monochrome') return 'grayscale(1)'
  if (theme.imagery.treatment === 'duotone') return 'grayscale(0.65) sepia(0.55) hue-rotate(-20deg)'
  return 'none'
}

function blockStyle(kind: PreviewBlockKind, theme: BrandTheme): Record<string, string> {
  const { colors, typography, radius } = theme
  const sizes = SCALE_SIZES[typography.scale] ?? SCALE_SIZES.default
  const base = { fontFamily: typography.fontSans, marginBlock: DENSITY_GAPS[theme.spacing.density] ?? '0.75rem' }
  switch (kind) {
    case 'media':
      return {
        ...base,
        height: '8rem',
        borderRadius: radius.base,
        border: `1px solid ${colors.border}`,
        background: theme.imagery.logoUrl
          ? `center / contain no-repeat url(${JSON.stringify(theme.imagery.logoUrl)}) ${colors.muted}`
          : colors.muted,
        filter: mediaFilter(theme),
      }
    case 'heading':
      return {
        ...base,
        color: colors.foreground,
        fontFamily: typography.fontDisplay,
        fontWeight: String(typography.headingWeight),
        fontSize: sizes.heading,
        lineHeight: String(Math.max(1.1, typography.bodyLeading - 0.3)),
      }
    case 'text':
      return {
        ...base,
        color: colors.mutedForeground,
        fontSize: sizes.text,
        lineHeight: String(typography.bodyLeading),
      }
    case 'button':
      return {
        ...base,
        display: 'inline-block',
        background: colors.primary,
        color: colors.primaryForeground,
        borderRadius: BUTTON_RADIUS[theme.components.buttonShape],
        fontWeight: '600',
        fontSize: sizes.text,
        padding: '0.5rem 1rem',
      }
    case 'link':
      return {
        ...base,
        color: colors.link,
        fontSize: sizes.text,
        textDecoration: 'underline',
        textUnderlineOffset: '2px',
      }
    case 'badge':
      return {
        ...base,
        display: 'inline-block',
        background: colors.accent,
        color: colors.accentForeground,
        border: `1px solid ${colors.border}`,
        borderRadius: BUTTON_RADIUS[theme.components.buttonShape],
        fontSize: '0.75rem',
        padding: '0.125rem 0.5rem',
      }
    case 'card':
    default:
      return {
        ...base,
        background: colors.card,
        color: colors.cardForeground,
        border: `1px solid ${colors.border}`,
        borderRadius: radius.base,
        boxShadow: shadowFor(theme),
        padding: '1rem',
      }
  }
}

function sampleBlocks(component: PreviewComponentId, theme: BrandTheme): PreviewBlock[] {
  return SAMPLES[component].map((kind) => ({
    kind,
    copyKey: `${component}.${kind}` as PreviewCopyKey,
    style: blockStyle(kind, theme),
  }))
}

/* ------------------------------------------------------------------ */
/* Rendering                                                          */
/* ------------------------------------------------------------------ */

export interface ThemePreviewRender {
  component: PreviewComponentId
  labelKey: string
  /** The theme actually being previewed — state and accessibility applied. */
  theme: BrandTheme
  /** Resolved dark palette for the dark pane (ramp + deviations + layers). */
  darkTheme: BrandTheme
  blocks: PreviewBlock[]
  variables: Record<string, string>
  darkVariables: Record<string, string>
  /** Stylesheet source, for `<style>` injection ahead of first paint. */
  css: string
  /** Spec §68 — the same report the publish action will produce. */
  validation: ThemeValidationReport
}

/**
 * Spec §10/§46 — preview a theme against a real component template. Safe to
 * call on an unpublished draft: it reads nothing but its arguments.
 */
export function renderThemePreview(
  theme: BrandTheme,
  component: PreviewComponentId,
  options?: { stateId?: string; accessibility?: AccessibilityMode },
): ThemePreviewRender {
  const composed = composeTheme(theme, options?.stateId ?? 'NORMAL', options?.accessibility ?? 'standard')
  const dark = composeDarkTheme(theme, options?.stateId ?? 'NORMAL', options?.accessibility ?? 'standard')
  return {
    component,
    labelKey: PREVIEW_COMPONENTS.find((entry) => entry.id === component)?.labelKey ?? component,
    theme: composed,
    darkTheme: dark,
    blocks: sampleBlocks(component, composed),
    variables: themeToCssVariables(composed),
    darkVariables: themeToCssVariables(dark),
    css: serializeTheme(composed),
    validation: validateTheme(composed),
  }
}

/** Contrast rows the editor shows beside the preview, worst first. */
export function contrastHighlights(report: ThemeValidationReport): {
  mode: 'light' | 'dark'
  foreground: keyof ColorTokens
  background: keyof ColorTokens
  usage: string
  ratio: number | null
  required: number
  passes: boolean
}[] {
  return report.contrast
    .filter((row) => !row.passes)
    .sort((a, b) => (a.ratio ?? 0) - (b.ratio ?? 0))
}
