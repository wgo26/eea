import { describe, expect, it } from 'vitest'

import { DEFAULT_BRAND_THEME } from './tokens'
import { contrastRatio } from './validation'
import {
  BRAND_MIN_CONTRAST,
  INK,
  PAPER,
  applyBrandColors,
  brandColorFields,
  brandColorsFrom,
  checkBrandColors,
  isBrandColorKey,
  isValidBrandColor,
  readableForegroundOn,
} from './brand-colors'

describe('readableForegroundOn', () => {
  it('puts ink on the shipped gold', () => {
    // The house convention: dark text on the bright brand accent.
    expect(readableForegroundOn(DEFAULT_BRAND_THEME.colors.primary)).toBe(INK)
  })

  it('puts paper on a dark brand colour', () => {
    expect(readableForegroundOn('oklch(0.25 0.05 250)')).toBe(PAPER)
  })

  it('returns null for a value it cannot resolve', () => {
    expect(readableForegroundOn('var(--primary)')).toBeNull()
    expect(readableForegroundOn('nonsense')).toBeNull()
  })

  // The property the whole form rests on: whichever candidate is chosen, it is
  // never the LESS readable of the two. Sweeping lightness catches a regression
  // where the comparison is inverted or a constant is swapped.
  it('never picks the less readable candidate', () => {
    for (const L of [0.1, 0.2, 0.3, 0.4, 0.5, 0.55, 0.6, 0.7, 0.85, 0.99]) {
      for (const hue of [85, 190, 27]) {
        const surface = `oklch(${L} 0.12 ${hue})`
        const chosen = readableForegroundOn(surface)
        expect(chosen, surface).not.toBeNull()
        const rejected = chosen === INK ? PAPER : INK
        const chosenRatio = contrastRatio(chosen as string, surface) as number
        const rejectedRatio = contrastRatio(rejected, surface) as number
        expect(chosenRatio, `${surface}: ${chosen} < ${rejected}`).toBeGreaterThanOrEqual(rejectedRatio)
      }
    }
  })
})

describe('brandColorFields', () => {
  it('interleaves picked surfaces with derived foregrounds', () => {
    const fields = brandColorFields(DEFAULT_BRAND_THEME.colors, {
      primary: 'oklch(0.62 0.13 190)',
      secondary: 'oklch(0.95 0.02 190)',
      accent: 'oklch(0.9 0.05 190)',
    })
    expect(fields.map((f) => f.key)).toEqual([
      'primary',
      'primaryForeground',
      'secondary',
      'secondaryForeground',
      'accent',
      'accentForeground',
    ])
    expect(fields.filter((f) => f.derivedFrom)).toHaveLength(3)
  })

  it('falls back to the existing foreground while a swatch is unparseable', () => {
    // Mid-typing state: the input holds "oklch(0.6" and cannot be measured yet.
    const fields = brandColorFields(DEFAULT_BRAND_THEME.colors, {
      primary: 'oklch(0.6',
      secondary: DEFAULT_BRAND_THEME.colors.secondary,
      accent: DEFAULT_BRAND_THEME.colors.accent,
    })
    expect(fields[0].value).toBe('oklch(0.6')
    expect(fields[1].value).toBe(DEFAULT_BRAND_THEME.colors.primaryForeground)
  })
})

describe('checkBrandColors', () => {
  it('passes the shipped identity', () => {
    const checks = checkBrandColors(brandColorsFrom(DEFAULT_BRAND_THEME.colors))
    for (const key of ['primary', 'secondary', 'accent'] as const) {
      expect(checks[key].passes, `${key} at ${checks[key].ratio}:1`).toBe(true)
      expect(checks[key].ratio).toBeGreaterThanOrEqual(BRAND_MIN_CONTRAST)
    }
  })

  /**
   * The reason the form blocks Save. A mid-lightness surface has NO readable
   * foreground from the ink/paper pair — neither clears 4.5:1 — so
   * auto-picking a foreground cannot rescue it and the admin must pick a
   * different brand colour. Pretending otherwise would publish unreadable
   * buttons. (Sweeping oklch lightness, this dead zone runs roughly
   * L 0.48–0.72; L=0.58 is its centre and measures 4.17:1 at best.)
   */
  it('flags a mid-tone that neither foreground can survive', () => {
    const mid = 'oklch(0.58 0.05 85)'
    const checks = checkBrandColors({ primary: mid, secondary: mid, accent: mid })
    expect(checks.primary.passes).toBe(false)
    expect(checks.primary.ratio).not.toBeNull()
    expect(checks.primary.ratio as number).toBeLessThan(BRAND_MIN_CONTRAST)
    // And the derivation really did choose the better of the two candidates.
    expect(checks.primary.ratio as number).toBeGreaterThan(3.5)
  })

  it('reports an unparseable swatch as failing rather than throwing', () => {
    const checks = checkBrandColors({
      primary: 'not-a-colour',
      secondary: 'oklch(0.95 0.02 190)',
      accent: 'oklch(0.9 0.05 190)',
    })
    expect(checks.primary.passes).toBe(false)
    expect(checks.primary.ratio).toBeNull()
  })
})

describe('guards', () => {
  it('recognises only the three brand keys', () => {
    expect(isBrandColorKey('primary')).toBe(true)
    expect(isBrandColorKey('secondary')).toBe(true)
    expect(isBrandColorKey('accent')).toBe(true)
    expect(isBrandColorKey('link')).toBe(false)
    expect(isBrandColorKey('background')).toBe(false)
  })

  it('accepts hex and oklch and refuses var references', () => {
    expect(isValidBrandColor('#1a7f5f')).toBe(true)
    expect(isValidBrandColor('oklch(0.62 0.13 190)')).toBe(true)
    expect(isValidBrandColor('var(--primary)')).toBe(false)
  })
})

describe('applyBrandColors', () => {
  const base = DEFAULT_BRAND_THEME.colors
  const teal = {
    primary: 'oklch(0.62 0.13 190)',
    secondary: 'oklch(0.95 0.02 190)',
    accent: 'oklch(0.9 0.05 190)',
  }

  it('sets the three surfaces and derives each foreground', () => {
    const next = applyBrandColors(base, teal)
    expect(next.primary).toBe(teal.primary)
    expect(next.secondary).toBe(teal.secondary)
    expect(next.accent).toBe(teal.accent)
    expect(next.primaryForeground).toBe(readableForegroundOn(teal.primary))
    expect(next.secondaryForeground).toBe(readableForegroundOn(teal.secondary))
    expect(next.accentForeground).toBe(readableForegroundOn(teal.accent))
  })

  it('follows primary with the focus ring', () => {
    expect(applyBrandColors(base, teal).ring).toBe(teal.primary)
  })

  /**
   * The scope limit, asserted rather than described: this form paints the brand
   * and leaves readability alone. If a future edit made `link` follow `primary`,
   * inline article links would change colour on every brand tweak.
   */
  it('leaves non-brand surfaces untouched', () => {
    const next = applyBrandColors(base, teal)
    const untouched = [
      'background', 'foreground', 'card', 'cardForeground', 'popover', 'popoverForeground',
      'muted', 'mutedForeground', 'border', 'input', 'link', 'destructive',
    ] as const
    for (const key of untouched) {
      expect(next[key], `${key} must not move`).toBe(base[key])
    }
  })

  it('does not mutate the token set it was given', () => {
    const before = JSON.stringify(base)
    applyBrandColors(base, teal)
    expect(JSON.stringify(base)).toBe(before)
  })

  it('round-trips through brandColorsFrom', () => {
    expect(brandColorsFrom(applyBrandColors(base, teal))).toEqual(teal)
  })
})
