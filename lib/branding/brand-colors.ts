/**
 * The three-colour brand model behind the simple "Brand colors" form
 * (/admin/branding).
 *
 * Non-designer admins should not have to reason about 19 semantic tokens. They
 * have one question — "what are our brand colours?" — and the answer is a
 * primary, a secondary and an accent. This module expands those three into a
 * complete `ColorTokens` set, and it does the part humans get wrong: the
 * foreground for each surface is CHOSEN to clear WCAG AA, never typed.
 *
 * PURE AND CLIENT-SAFE by the same rule as ./tokens and ./validation, because
 * the form recomputes this on every keystroke to show the swatch and its
 * contrast ratio live. `server-only` would break the editor; a DB import would
 * leak a service-role read path into the anon bundle.
 */

import { contrastRatio, parseColor } from './validation'
import type { ColorTokens } from './tokens'

/** A foreground that sits on a colour pair must clear this ratio. */
export const BRAND_MIN_CONTRAST = 4.5

/** The two candidates a surface gets its text colour from. */
export const INK = 'oklch(0.205 0 0)'
export const PAPER = 'oklch(0.99 0 0)'

export type BrandColorKey = 'primary' | 'secondary' | 'accent'

const BRAND_KEYS: readonly BrandColorKey[] = ['primary', 'secondary', 'accent']

export function isBrandColorKey(value: string): value is BrandColorKey {
  return (BRAND_KEYS as readonly string[]).includes(value)
}

/**
 * Pick the readable foreground for a surface: whichever of ink/paper has the
 * higher contrast against it, preferring ink so the shipped wordmark-on-gold
 * convention is preserved. Returns null only when the surface itself is not a
 * resolvable colour, which the caller reports rather than guesses at.
 */
export function readableForegroundOn(surface: string): string | null {
  if (!isValidBrandColor(surface)) return null
  const ink = contrastRatio(INK, surface) ?? -1
  const paper = contrastRatio(PAPER, surface) ?? -1
  // Tie goes to ink: dark text on a light brand colour is the house style, and
  // a tie can only happen on a mid-tone where either is already AA-compliant.
  return paper > ink ? PAPER : INK
}

/** Ratio of `fg` against `bg`, or null when either is unparseable. */
export function brandContrast(fg: string, bg: string): number | null {
  const ratio = contrastRatio(fg, bg)
  return ratio === null ? null : Math.round(ratio * 100) / 100
}

export type BrandColorInput = Record<BrandColorKey, string>

export type BrandDerivedField = {
  key: keyof ColorTokens
  value: string
  /** Foreground fields are computed from their surface, not typed by the admin. */
  derivedFrom?: BrandColorKey
}

/**
 * The fields the form writes, in display order: three the admin picks and the
 * three foregrounds derived from them. Surfaces that are not a brand colour
 * (background, card, muted, popover, border, ring, link, destructive, input)
 * pass through untouched — this is a brand-colour editor, not a palette reset.
 */
export function brandColorFields(
  base: ColorTokens,
  input: BrandColorInput,
): BrandDerivedField[] {
  return [
    { key: 'primary', value: input.primary },
    { key: 'primaryForeground', value: readableForegroundOn(input.primary) ?? base.primaryForeground, derivedFrom: 'primary' },
    { key: 'secondary', value: input.secondary },
    { key: 'secondaryForeground', value: readableForegroundOn(input.secondary) ?? base.secondaryForeground, derivedFrom: 'secondary' },
    { key: 'accent', value: input.accent },
    { key: 'accentForeground', value: readableForegroundOn(input.accent) ?? base.accentForeground, derivedFrom: 'accent' },
  ]
}

/**
 * Apply the three brand colours to a token set. Each surface also drives its own
 * foreground; `ring` follows `primary` so a focus outline reads as the brand
 * rather than the old palette, and `link` stays untouched because an inline
 * article link is a readability token, not a brand surface.
 */
export function applyBrandColors(base: ColorTokens, input: BrandColorInput): ColorTokens {
  let next: ColorTokens = { ...base }
  for (const field of brandColorFields(base, input)) {
    next = { ...next, [field.key]: field.value }
  }
  return { ...next, ring: input.primary }
}

/** The three current brand colours, read back out of a token set. */
export function brandColorsFrom(base: ColorTokens): BrandColorInput {
  return { primary: base.primary, secondary: base.secondary, accent: base.accent }
}

/** Is this a colour the model can parse and derive a foreground from? */
export function isValidBrandColor(value: string): boolean {
  return parseColor(value) !== null
}

export type BrandColorCheck = {
  surface: string
  foreground: string
  ratio: number | null
  passes: boolean
}

/**
 * What the form shows before saving. A mid-lightness brand colour can be
 * unreadable with EITHER foreground (around oklch L 0.48-0.72 both ink and
 * paper fall under 4.5:1), which is why Save is blocked rather than silently
 * publishing a button nobody can read — `updateThemeDraft` would store it.
 */
export function checkBrandColors(input: BrandColorInput): Record<BrandColorKey, BrandColorCheck> {
  const out = {} as Record<BrandColorKey, BrandColorCheck>
  for (const key of BRAND_KEYS) {
    const surface = input[key]
    const foreground = readableForegroundOn(surface) ?? INK
    const ratio = brandContrast(foreground, surface)
    out[key] = { surface, foreground, ratio, passes: ratio !== null && ratio >= BRAND_MIN_CONTRAST }
  }
  return out
}
