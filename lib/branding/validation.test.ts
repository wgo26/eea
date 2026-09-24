import { describe, expect, it } from 'vitest'

import { DEFAULT_BRAND_THEME, composeTheme, parseBrandTheme } from './tokens'
import {
  checkMissingAssets,
  contrastRatio,
  parseColor,
  relativeLuminance,
  validateColorPairing,
  validateFontLoading,
  validateTheme,
} from './validation'

describe('parseColor', () => {
  it('parses the oklch notation the design system ships', () => {
    const parsed = parseColor('oklch(0.83 0.19 85)')
    expect(parsed).not.toBeNull()
    // Brand gold: high red, mid green, low blue.
    expect(parsed!.r).toBeGreaterThan(parsed!.b)
    expect(parsed!.a).toBe(1)
  })

  it('parses percentage lightness/chroma and alpha', () => {
    const parsed = parseColor('oklch(83% 19% 85 / 0.5)')
    expect(parsed).not.toBeNull()
    expect(parsed!.a).toBe(0.5)
  })

  it('parses hex in 3, 6 and 8 digit forms', () => {
    expect(parseColor('#fff')).toEqual({ r: 1, g: 1, b: 1, a: 1 })
    expect(parseColor('#000000')).toEqual({ r: 0, g: 0, b: 0, a: 1 })
    expect(parseColor('#00000080')!.a).toBeCloseTo(0.502, 2)
  })

  it('parses rgb()/rgba() with commas or spaces', () => {
    expect(parseColor('rgb(255, 255, 255)')).toEqual({ r: 1, g: 1, b: 1, a: 1 })
    expect(parseColor('rgba(0 0 0 / 50%)')!.a).toBeCloseTo(0.5, 5)
  })

  it('rejects non-literal colour values', () => {
    expect(parseColor('var(--primary)')).toBeNull()
    expect(parseColor('currentColor')).toBeNull()
    expect(parseColor('')).toBeNull()
  })
})

describe('contrastRatio (WCAG 2.1)', () => {
  it('computes the canonical extremes', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5)
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5)
  })

  it('matches the published 4.54:1 boundary grey', () => {
    expect(contrastRatio('#767676', '#ffffff')).toBeCloseTo(4.54, 2)
  })

  it('is symmetric', () => {
    const a = contrastRatio('oklch(0.83 0.19 85)', 'oklch(0.205 0 0)')!
    const b = contrastRatio('oklch(0.205 0 0)', 'oklch(0.83 0.19 85)')!
    expect(a).toBeCloseTo(b, 10)
  })

  it('returns null when a value cannot be resolved', () => {
    expect(contrastRatio('var(--primary)', '#ffffff')).toBeNull()
  })
})

describe('validateColorPairing', () => {
  it('passes the AA threshold at 4.5:1', () => {
    const result = validateColorPairing('#767676', '#ffffff')
    expect(result.passes).toBe(true)
    expect(result.required).toBe(4.5)
  })

  it('fails below the threshold and reports the ratio', () => {
    const result = validateColorPairing('#999999', '#ffffff')
    expect(result.passes).toBe(false)
    expect(result.ratio).toBeLessThan(4.5)
  })

  it('reports an unsupported notation instead of throwing', () => {
    const result = validateColorPairing('var(--x)', '#ffffff')
    expect(result.ratio).toBeNull()
    expect(result.passes).toBe(false)
    expect(result.reason).toBeTruthy()
  })
})

describe('validateTheme(DEFAULT_BRAND_THEME)', () => {
  it('accepts the shipped identity without errors', () => {
    const report = validateTheme(DEFAULT_BRAND_THEME)
    expect(report.issues.filter((issue) => issue.level === 'error')).toEqual([])
    expect(report.valid).toBe(true)
  })

  it('reports the contrast matrix for every load-bearing pair', () => {
    const report = validateTheme(DEFAULT_BRAND_THEME)
    expect(report.contrast.length).toBeGreaterThanOrEqual(8)
    const body = report.contrast.find(
      (row) => row.mode === 'light' && row.foreground === 'foreground' && row.background === 'background',
    )
    expect(body?.ratio).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps quiet about the shipped dark ramp when the theme does not touch dark', () => {
    const report = validateTheme(DEFAULT_BRAND_THEME)
    expect(report.issues.some((issue) => issue.path.startsWith('darkColors'))).toBe(false)
    // The matrix still states the dark numbers, so the editor can show them.
    expect(report.contrast.some((row) => row.mode === 'dark')).toBe(true)
  })

  it('rejects a draft with an unreadable palette', () => {
    const theme = {
      ...DEFAULT_BRAND_THEME,
      colors: {
        ...DEFAULT_BRAND_THEME.colors,
        foreground: 'oklch(0.9 0 0)',
        background: 'oklch(1 0 0)',
      },
    }
    const report = validateTheme(theme)
    expect(report.valid).toBe(false)
    expect(report.issues.some((issue) => issue.path.includes('colors.foreground'))).toBe(true)
  })

  it('flags malformed structural tokens', () => {
    const theme = {
      ...DEFAULT_BRAND_THEME,
      radius: { base: 'big' },
      typography: { ...DEFAULT_BRAND_THEME.typography, headingWeight: 100 },
    }
    const report = validateTheme(theme)
    expect(report.issues.some((issue) => issue.path === 'radius.base')).toBe(true)
    expect(report.issues.some((issue) => issue.path === 'typography.headingWeight')).toBe(true)
  })

  it('validates the composed CRITICAL state', () => {
    const report = validateTheme(composeTheme(DEFAULT_BRAND_THEME, 'CRITICAL'))
    expect(report.issues.filter((issue) => issue.level === 'error')).toEqual([])
  })

  it('validates the composed high-contrast mode', () => {
    const report = validateTheme(composeTheme(DEFAULT_BRAND_THEME, 'NORMAL', 'high-contrast'))
    expect(report.valid).toBe(true)
  })

  it('fails a dark override that makes body text unreadable', () => {
    const theme = parseBrandTheme({
      darkColors: { background: 'oklch(0.9 0 0)', foreground: 'oklch(0.95 0 0)' },
    })
    const report = validateTheme(theme)
    expect(report.valid).toBe(false)
    expect(report.issues.some((issue) => issue.path.includes('darkColors.foreground'))).toBe(true)
  })

  it('accepts a dark override that keeps the ramp readable', () => {
    const theme = parseBrandTheme({ darkColors: { card: 'oklch(0.3 0.02 75)' } })
    expect(validateTheme(theme).issues.some((issue) => issue.path.startsWith('darkColors'))).toBe(false)
  })
})

describe('validateFontLoading', () => {
  it('accepts the self-hosted font tokens', () => {
    expect(validateFontLoading(DEFAULT_BRAND_THEME)).toEqual([])
  })

  it('errors on a remote font source', () => {
    const theme = {
      ...DEFAULT_BRAND_THEME,
      typography: { ...DEFAULT_BRAND_THEME.typography, fontSans: 'url(https://fonts.gstatic.com/x.woff2)' },
    }
    const issues = validateFontLoading(theme)
    expect(issues.some((issue) => issue.level === 'error')).toBe(true)
  })

  it('warns on an unknown local token', () => {
    const theme = {
      ...DEFAULT_BRAND_THEME,
      typography: { ...DEFAULT_BRAND_THEME.typography, fontDisplay: 'var(--font-comic)' },
    }
    const issues = validateFontLoading(theme)
    expect(issues.some((issue) => issue.level === 'warning')).toBe(true)
  })
})

describe('checkMissingAssets', () => {
  it('warns when the identity assets are unset', () => {
    const issues = checkMissingAssets(DEFAULT_BRAND_THEME)
    expect(issues).toHaveLength(3)
    expect(issues.every((issue) => issue.level === 'warning')).toBe(true)
  })

  it('accepts uploaded paths and https URLs', () => {
    const theme = {
      ...DEFAULT_BRAND_THEME,
      imagery: {
        ...DEFAULT_BRAND_THEME.imagery,
        logoUrl: '/api/uploads/logo.svg',
        faviconUrl: 'https://cdn.example.com/favicon.ico',
        socialImageUrl: '/api/uploads/social.png',
      },
    }
    expect(checkMissingAssets(theme)).toEqual([])
  })

  it('errors on an unsafe scheme', () => {
    const theme = {
      ...DEFAULT_BRAND_THEME,
      imagery: { ...DEFAULT_BRAND_THEME.imagery, logoUrl: 'javascript:alert(1)' },
    }
    const issues = checkMissingAssets(theme)
    expect(issues.some((issue) => issue.level === 'error')).toBe(true)
  })
})

describe('relativeLuminance', () => {
  it('spans 0 to 1', () => {
    expect(relativeLuminance({ r: 0, g: 0, b: 0, a: 1 })).toBeCloseTo(0, 5)
    expect(relativeLuminance({ r: 1, g: 1, b: 1, a: 1 })).toBeCloseTo(1, 5)
  })
})
