/**
 * Theme validation (spec §10, §68) — pure and client-safe, so the admin theme
 * editor can validate a draft on every keystroke while the publish action
 * re-runs the identical check server-side.
 *
 * Contrast maths: oklch/hex/rgb → sRGB → WCAG 2.1 relative luminance. Brand
 * tokens are stored as literals (not var() references), so a value that
 * cannot be resolved is reported instead of silently skipped.
 */

import { resolveDarkColors, type BrandTheme, type ColorTokens } from './tokens'

/* ------------------------------------------------------------------ */
/* Colour parsing                                                     */
/* ------------------------------------------------------------------ */

export type Rgba = { r: number; g: number; b: number; a: number }

const OKLCH_RE =
  /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)(%?)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/i
const RGB_RE = /^rgba?\(\s*([^)]+)\s*\)$/i
const HEX_RE = /^#([0-9a-f]{3,8})$/i

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/** linear-light → gamma-encoded sRGB (the spec's transfer function). */
function encodeGamma(value: number): number {
  const c = clamp01(value)
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055
}

export function oklchToSrgb(L: number, C: number, hueDegrees: number): [number, number, number] {
  const h = (hueDegrees * Math.PI) / 180
  const a = C * Math.cos(h)
  const b = C * Math.sin(h)
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b
  const s_ = L - 0.0894841775 * a - 1.291485548 * b
  const l = l_ ** 3
  const m = m_ ** 3
  const s = s_ ** 3
  return [
    encodeGamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    encodeGamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    encodeGamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ]
}

/** Accepts the notation the design system ships: oklch(), hex, rgb()/rgba(). */
export function parseColor(value: string): Rgba | null {
  const input = value.trim()

  const hex = HEX_RE.exec(input)
  if (hex) {
    const digits = hex[1]
    const expand = (pair: string) => parseInt(pair, 16) / 255
    if (digits.length === 3 || digits.length === 4) {
      return {
        r: expand(digits[0] + digits[0]),
        g: expand(digits[1] + digits[1]),
        b: expand(digits[2] + digits[2]),
        a: digits.length === 4 ? expand(digits[3] + digits[3]) : 1,
      }
    }
    if (digits.length === 6 || digits.length === 8) {
      return {
        r: expand(digits.slice(0, 2)),
        g: expand(digits.slice(2, 4)),
        b: expand(digits.slice(4, 6)),
        a: digits.length === 8 ? expand(digits.slice(6, 8)) : 1,
      }
    }
    return null
  }

  const oklch = OKLCH_RE.exec(input)
  if (oklch) {
    const L = oklch[2] === '%' ? parseFloat(oklch[1]) / 100 : parseFloat(oklch[1])
    // CSS Color 4: 100% chroma equals 0.4 in the oklch() function.
    const C = oklch[4] === '%' ? (parseFloat(oklch[3]) / 100) * 0.4 : parseFloat(oklch[3])
    const hue = parseFloat(oklch[5])
    const alpha = oklch[6] === undefined
      ? 1
      : oklch[7] === '%'
        ? parseFloat(oklch[6]) / 100
        : parseFloat(oklch[6])
    if (![L, C, hue, alpha].every(Number.isFinite)) return null
    const [r, g, b] = oklchToSrgb(L, C, hue)
    return { r, g, b, a: clamp01(alpha) }
  }

  const rgb = RGB_RE.exec(input)
  if (rgb) {
    const parts = rgb[1].split(/[,/\s]+/).filter(Boolean)
    if (parts.length < 3) return null
    const channel = (part: string) =>
      part.endsWith('%') ? clamp01(parseFloat(part) / 100) : clamp01(parseFloat(part) / 255)
    const [r, g, b] = [channel(parts[0]), channel(parts[1]), channel(parts[2])]
    const rawAlpha = parts[3]
    const alpha = rawAlpha === undefined
      ? 1
      : clamp01(rawAlpha.endsWith('%') ? parseFloat(rawAlpha) / 100 : parseFloat(rawAlpha))
    if (![r, g, b, alpha].every(Number.isFinite)) return null
    return { r, g, b, a: alpha }
  }

  return null
}

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4)
}

/** WCAG 2.1 relative luminance of a gamma-encoded sRGB colour. */
export function relativeLuminance(color: Rgba): number {
  return 0.2126 * toLinear(color.r) + 0.7152 * toLinear(color.g) + 0.0722 * toLinear(color.b)
}

/** Source-over compositing, so translucent tokens are judged as rendered. */
function flatten(foreground: Rgba, backdrop: Rgba): Rgba {
  const a = foreground.a
  return {
    r: foreground.r * a + backdrop.r * (1 - a),
    g: foreground.g * a + backdrop.g * (1 - a),
    b: foreground.b * a + backdrop.b * (1 - a),
    a: 1,
  }
}

const WHITE: Rgba = { r: 1, g: 1, b: 1, a: 1 }

/** WCAG 2.1 contrast ratio (1–21), or null when either colour is unparseable. */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseColor(foreground)
  const bg = parseColor(background)
  if (!fg || !bg) return null
  const solidBackground = flatten(bg, WHITE)
  const solidForeground = flatten(fg, solidBackground)
  const l1 = relativeLuminance(solidForeground)
  const l2 = relativeLuminance(solidBackground)
  const [high, low] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (high + 0.05) / (low + 0.05)
}

/* ------------------------------------------------------------------ */
/* Contrast pairing (spec §68)                                        */
/* ------------------------------------------------------------------ */

export type ValidationLevel = 'error' | 'warning'

export interface ColorPairingResult {
  /** Rounded to 2 decimals — the number the editor displays. */
  ratio: number | null
  required: number
  passes: boolean
  reason?: string
}

/** WCAG 2.1 AA: 4.5:1 for text, 3:1 for non-text UI (spec §68 "invalid contrast"). */
export function validateColorPairing(
  foreground: string,
  background: string,
  required = 4.5,
): ColorPairingResult {
  const raw = contrastRatio(foreground, background)
  if (raw === null) {
    return {
      ratio: null,
      required,
      passes: false,
      reason: 'Unsupported colour notation — contrast could not be evaluated.',
    }
  }
  const ratio = Math.round(raw * 100) / 100
  return { ratio, required, passes: ratio >= required }
}

export interface ContrastPair {
  foreground: keyof ColorTokens
  background: keyof ColorTokens
  required: number
  level: ValidationLevel
  usage: string
}

/**
 * The combinations the design system actually renders. Text pairs are errors
 * at 4.5:1; decorative/focus pairs are warnings at 3:1 (spec §25 raises
 * contrast in critical states, so the editor surfaces these without blocking
 * a publish on a deliberately restrained palette).
 */
export const THEME_CONTRAST_PAIRS: ContrastPair[] = [
  { foreground: 'foreground', background: 'background', required: 4.5, level: 'error', usage: 'Body text' },
  { foreground: 'foreground', background: 'card', required: 4.5, level: 'error', usage: 'Text on cards' },
  { foreground: 'cardForeground', background: 'card', required: 4.5, level: 'error', usage: 'Card body text' },
  { foreground: 'mutedForeground', background: 'background', required: 4.5, level: 'error', usage: 'Secondary text' },
  { foreground: 'primaryForeground', background: 'primary', required: 4.5, level: 'error', usage: 'Primary button label' },
  { foreground: 'accentForeground', background: 'accent', required: 4.5, level: 'error', usage: 'Accent surfaces' },
  { foreground: 'link', background: 'background', required: 4.5, level: 'error', usage: 'Inline links' },
  { foreground: 'destructive', background: 'background', required: 4.5, level: 'error', usage: 'Destructive actions' },
  { foreground: 'destructive', background: 'card', required: 4.5, level: 'error', usage: 'Destructive actions on cards' },
  { foreground: 'border', background: 'background', required: 3, level: 'warning', usage: 'Borders / dividers' },
  { foreground: 'ring', background: 'background', required: 3, level: 'warning', usage: 'Focus ring' },
  { foreground: 'mutedForeground', background: 'muted', required: 4.5, level: 'warning', usage: 'Secondary text on muted surfaces' },
]

export type ColorMode = 'light' | 'dark'

export interface ContrastReport {
  mode: ColorMode
  foreground: keyof ColorTokens
  background: keyof ColorTokens
  usage: string
  level: ValidationLevel
  ratio: number | null
  required: number
  passes: boolean
}

/* ------------------------------------------------------------------ */
/* Structural, font and asset checks                                  */
/* ------------------------------------------------------------------ */

export interface ThemeIssue {
  level: ValidationLevel
  /** Dotted token path, e.g. `colors.primary` or `imagery.logoUrl`. */
  path: string
  message: string
}

const LENGTH_RE = /^-?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|%|vw|vh|ch|pt)?$/
const EASE_RE = /^(?:cubic-bezier\(|steps\(|linear\b|ease\b|ease-in\b|ease-out\b|ease-in-out\b)/

function isLength(value: string): boolean {
  return LENGTH_RE.test(value.trim())
}

/**
 * Fonts are self-hosted by project rule (the `[no remote fonts]` check in
 * `npm run check`), so there is no URL to fetch: this asserts the token
 * references one of the local font variables instead of a remote stack that
 * would silently degrade to a system fallback.
 */
export const SELF_HOSTED_FONT_TOKENS = ['var(--font-sans)', 'var(--font-display)', 'var(--font-geist-mono)']

const REMOTE_FONT_RE = /(?:https?:)?\/\/|url\(|@import/i

export function validateFontLoading(theme: BrandTheme): ThemeIssue[] {
  const issues: ThemeIssue[] = []
  const entries: [string, string][] = [
    ['typography.fontSans', theme.typography.fontSans],
    ['typography.fontDisplay', theme.typography.fontDisplay],
  ]
  for (const [path, value] of entries) {
    if (REMOTE_FONT_RE.test(value)) {
      issues.push({
        level: 'error',
        path,
        message: 'Remote font sources are not allowed — Eagle Eye Africa self-hosts every font.',
      })
      continue
    }
    if (!SELF_HOSTED_FONT_TOKENS.includes(value.trim())) {
      issues.push({
        level: 'warning',
        path,
        message: `Unknown font token "${value}" — expected one of ${SELF_HOSTED_FONT_TOKENS.join(', ')}; the browser will fall back to a system font.`,
      })
    }
  }
  return issues
}

function isSafeAssetUrl(url: string): boolean {
  const value = url.trim()
  if (value.startsWith('/')) return !value.startsWith('//')
  return /^https:\/\//i.test(value)
}

/** Spec §10 — missing asset warnings before a theme can go live. */
export function checkMissingAssets(theme: BrandTheme): ThemeIssue[] {
  const issues: ThemeIssue[] = []
  const required: [string, string, string][] = [
    ['imagery.logoUrl', theme.imagery.logoUrl ?? '', 'Logo'],
    ['imagery.faviconUrl', theme.imagery.faviconUrl ?? '', 'Favicon'],
    ['imagery.socialImageUrl', theme.imagery.socialImageUrl ?? '', 'Social preview image'],
  ]
  for (const [path, url, label] of required) {
    if (!url) {
      issues.push({
        level: 'warning',
        path,
        message: `${label} is not set — the default Eagle Eye Africa asset will be used.`,
      })
      continue
    }
    if (!isSafeAssetUrl(url)) {
      issues.push({
        level: 'error',
        path,
        message: `${label} must be an uploaded asset path or an https:// URL (got "${url}").`,
      })
    }
  }
  return issues
}

const DURATIONS: BrandTheme['motion']['duration'][] = ['minimal', 'reduced', 'full']

function checkStructure(theme: BrandTheme): ThemeIssue[] {
  const issues: ThemeIssue[] = []
  const { typography, spacing, radius, shadows, motion } = theme

  if (!(typography.headingWeight >= 400 && typography.headingWeight <= 900)) {
    issues.push({
      level: 'error',
      path: 'typography.headingWeight',
      message: 'Heading weight must be between 400 and 900.',
    })
  }
  if (!(typography.bodyLeading >= 1.1 && typography.bodyLeading <= 2.2)) {
    issues.push({
      level: 'error',
      path: 'typography.bodyLeading',
      message: 'Body line height must be between 1.1 and 2.2.',
    })
  }
  if (!isLength(radius.base)) {
    issues.push({ level: 'error', path: 'radius.base', message: `"${radius.base}" is not a valid CSS length.` })
  }
  if (!isLength(spacing.sectionGap)) {
    issues.push({
      level: 'error',
      path: 'spacing.sectionGap',
      message: `"${spacing.sectionGap}" is not a valid CSS length.`,
    })
  }
  if (!shadows.card.trim() || !shadows.lift.trim()) {
    issues.push({ level: 'warning', path: 'shadows', message: 'Empty shadow value — use "none" for a flat design.' })
  }
  if (!EASE_RE.test(motion.ease.trim())) {
    issues.push({
      level: 'warning',
      path: 'motion.ease',
      message: `"${motion.ease}" is not a recognised timing function.`,
    })
  }
  if (!DURATIONS.includes(motion.duration)) {
    issues.push({ level: 'error', path: 'motion.duration', message: 'Unknown motion duration.' })
  }
  return issues
}

/* ------------------------------------------------------------------ */
/* Aggregate report                                                   */
/* ------------------------------------------------------------------ */

export interface ThemeValidationReport {
  valid: boolean
  issues: ThemeIssue[]
  contrast: ContrastReport[]
}

/** Spec §68 — the single validation entry point used by editor and action. */
export function validateTheme(theme: BrandTheme): ThemeValidationReport {
  const issues: ThemeIssue[] = [...checkStructure(theme), ...validateFontLoading(theme), ...checkMissingAssets(theme)]

  // Light tokens are always authored by the theme, so every failure is the
  // author's to fix. Dark is only partly authored: a theme inherits the shipped
  // `.dark` ramp for everything it does not list, so a dark failure is reported
  // only when the theme overrode one of the two tokens involved — otherwise the
  // design system's own restrained dark borders would be blamed on the author
  // and no theme could ever clear the panel.
  const darkOverridden = new Set(Object.keys(theme.darkColors))
  const modes: [ColorMode, ColorTokens][] = [
    ['light', theme.colors],
    ['dark', resolveDarkColors(theme)],
  ]

  const contrast: ContrastReport[] = []
  for (const [mode, colors] of modes) {
    for (const pair of THEME_CONTRAST_PAIRS) {
      const foreground = colors[pair.foreground]
      const background = colors[pair.background]
      const result = validateColorPairing(foreground, background, pair.required)
      contrast.push({
        mode,
        foreground: pair.foreground,
        background: pair.background,
        usage: pair.usage,
        level: pair.level,
        ratio: result.ratio,
        required: pair.required,
        passes: result.passes,
      })
      if (result.passes) continue
      if (mode === 'dark' && !darkOverridden.has(pair.foreground) && !darkOverridden.has(pair.background)) continue
      const prefix = mode === 'dark' ? 'Dark mode — ' : ''
      issues.push({
        level: pair.level,
        path: `${mode === 'dark' ? 'darkColors' : 'colors'}.${pair.foreground}/${pair.background}`,
        message:
          result.ratio === null
            ? `${prefix}${pair.usage}: ${result.reason}`
            : `${prefix}${pair.usage}: contrast ${result.ratio}:1 is below the required ${pair.required}:1 (${foreground} on ${background}).`,
      })
    }
  }

  return {
    valid: !issues.some((issue) => issue.level === 'error'),
    issues,
    contrast,
  }
}
