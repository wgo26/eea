import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  COLOR_VARIABLES,
  DARK_RAMP_COLORS,
  DEFAULT_BRAND_THEME,
  composeTheme,
  getAccessibilityTokenOverrides,
  getStateTokenOverrides,
  parseBrandTheme,
  resolveDarkColors,
  themeToCssVariables,
  themeToDarkCssVariables,
} from './tokens'

describe('parseBrandTheme', () => {
  it('returns the baseline for an empty or malformed blob', () => {
    expect(parseBrandTheme(null)).toEqual(DEFAULT_BRAND_THEME)
    expect(parseBrandTheme('nope')).toEqual(DEFAULT_BRAND_THEME)
    expect(parseBrandTheme([])).toEqual(DEFAULT_BRAND_THEME)
  })

  it('merges a partial override onto the defaults', () => {
    const theme = parseBrandTheme({
      colors: { primary: 'oklch(0.5 0.2 200)' },
      typography: { headingWeight: 800 },
    })
    expect(theme.colors.primary).toBe('oklch(0.5 0.2 200)')
    expect(theme.colors.foreground).toBe(DEFAULT_BRAND_THEME.colors.foreground)
    expect(theme.typography.headingWeight).toBe(800)
    expect(theme.typography.bodyLeading).toBe(DEFAULT_BRAND_THEME.typography.bodyLeading)
  })

  it('ignores values of the wrong type or unknown enum members', () => {
    const theme = parseBrandTheme({
      colors: { primary: 42 },
      typography: { scale: 'gigantic' },
      motion: { duration: 'warp' },
      imagery: { logoUrl: '' },
    })
    expect(theme.colors.primary).toBe(DEFAULT_BRAND_THEME.colors.primary)
    expect(theme.typography.scale).toBe(DEFAULT_BRAND_THEME.typography.scale)
    expect(theme.motion.duration).toBe(DEFAULT_BRAND_THEME.motion.duration)
    expect(theme.imagery.logoUrl).toBeNull()
  })

  it('parses only the dark tokens a theme actually carries', () => {
    expect(DEFAULT_BRAND_THEME.darkColors).toEqual({})

    const theme = parseBrandTheme({
      darkColors: { background: 'oklch(0.1 0 0)', foreground: 7, bogus: '#fff' },
    })
    expect(theme.darkColors).toEqual({ background: 'oklch(0.1 0 0)' })
    // Absent/blank dark tokens must NOT fall back to the light value.
    expect('foreground' in theme.darkColors).toBe(false)
    expect(parseBrandTheme({ darkColors: { muted: '  ' } }).darkColors).toEqual({})
    expect(parseBrandTheme({ darkColors: 'nope' }).darkColors).toEqual({})
  })
})

describe('getStateTokenOverrides', () => {
  it('leaves NORMAL (and unknown ids) untouched', () => {
    expect(getStateTokenOverrides('NORMAL').colors).toEqual({})
    expect(getStateTokenOverrides('WHAT_IS_THIS').colors).toEqual({})
  })

  it('reduces motion and radius under CRITICAL (spec §25)', () => {
    const overrides = getStateTokenOverrides('CRITICAL')
    expect(overrides.motion).toBe('minimal')
    expect(overrides.radius).toBe('0.25rem')
    expect(overrides.colors.primary).toBe('oklch(0.55 0.22 27)')
  })
})

describe('composeTheme (spec §42)', () => {
  it('is the identity for NORMAL + standard accessibility', () => {
    const theme = composeTheme(DEFAULT_BRAND_THEME)
    expect(theme.colors).toEqual(DEFAULT_BRAND_THEME.colors)
    expect(theme.radius).toEqual(DEFAULT_BRAND_THEME.radius)
    expect(theme.motion.duration).toBe(DEFAULT_BRAND_THEME.motion.duration)
  })

  it('carries the state layer over the brand base', () => {
    const theme = composeTheme(DEFAULT_BRAND_THEME, 'SEASONAL')
    expect(theme.colors.accent).toBe('oklch(0.96 0.03 75)')
    expect(theme.colors.primary).toBe(DEFAULT_BRAND_THEME.colors.primary)
  })

  it('composes a state against the brand base and leaves other tokens alone', () => {
    const critical = composeTheme(DEFAULT_BRAND_THEME, 'CRITICAL')
    expect(critical.colors.primary).toBe('oklch(0.55 0.22 27)')
    expect(critical.colors.accent).toBe(DEFAULT_BRAND_THEME.colors.accent)
    expect(critical.motion.duration).toBe('minimal')
    expect(critical.radius.base).toBe('0.25rem')
  })

  it('does not leak a previous state composition into another state', () => {
    const seasonal = composeTheme(DEFAULT_BRAND_THEME, 'SEASONAL')
    expect(seasonal.colors.accent).toBe('oklch(0.96 0.03 75)')
    // The effective state is resolved by precedence upstream; composing the
    // winner against the brand base is what makes CRITICAL override SEASONAL.
    const critical = composeTheme(DEFAULT_BRAND_THEME, 'CRITICAL')
    expect(critical.colors.accent).toBe(DEFAULT_BRAND_THEME.colors.accent)
    expect(critical.colors.primary).toBe('oklch(0.55 0.22 27)')
  })

  it('lets accessibility win over the state layer', () => {
    const theme = composeTheme(DEFAULT_BRAND_THEME, 'INCIDENT', 'high-contrast')
    expect(theme.colors.foreground).toBe('oklch(0 0 0)')
    expect(theme.colors.primary).toBe('oklch(0.62 0.19 35)')
  })

  it('never mutates the base theme', () => {
    const before = JSON.stringify(DEFAULT_BRAND_THEME)
    composeTheme(DEFAULT_BRAND_THEME, 'CRITICAL', 'high-contrast')
    expect(JSON.stringify(DEFAULT_BRAND_THEME)).toBe(before)
  })
})

describe('getAccessibilityTokenOverrides', () => {
  it('darkens text for high contrast and stills motion for reduced motion', () => {
    expect(getAccessibilityTokenOverrides('high-contrast').colors.foreground).toBe('oklch(0 0 0)')
    expect(getAccessibilityTokenOverrides('reduced-motion').motion).toBe('minimal')
    expect(getAccessibilityTokenOverrides('standard')).toEqual({ colors: {} })
  })
})

describe('themeToCssVariables', () => {
  it('maps semantic tokens onto the design-system variables', () => {
    const vars = themeToCssVariables(DEFAULT_BRAND_THEME)
    expect(vars['--primary']).toBe(DEFAULT_BRAND_THEME.colors.primary)
    expect(vars['--primary-foreground']).toBe(DEFAULT_BRAND_THEME.colors.primaryForeground)
    expect(vars['--radius']).toBe('0.625rem')
    expect(vars['--ease-standard']).toBe(DEFAULT_BRAND_THEME.motion.ease)
    expect(vars['--brand-heading-weight']).toBe('700')
  })

  it('compresses the duration token for minimal motion', () => {
    const vars = themeToCssVariables(composeTheme(DEFAULT_BRAND_THEME, 'CRITICAL'))
    expect(vars['--brand-motion']).toBe('0.001s')
  })
})

describe('dark mode', () => {
  it('resolves the shipped ramp when the theme has no dark deviations', () => {
    expect(resolveDarkColors(DEFAULT_BRAND_THEME)).toEqual(DARK_RAMP_COLORS)
  })

  it('lets a theme override single dark tokens', () => {
    const theme = parseBrandTheme({ darkColors: { background: 'oklch(0.1 0 0)' } })
    const dark = resolveDarkColors(theme)
    expect(dark.background).toBe('oklch(0.1 0 0)')
    expect(dark.foreground).toBe(DARK_RAMP_COLORS.foreground)
    expect(dark.link).toBe(DARK_RAMP_COLORS.link)
  })

  it('emits only the deviations as dark CSS variables', () => {
    expect(themeToDarkCssVariables(DEFAULT_BRAND_THEME)).toEqual({})

    const theme = parseBrandTheme({ darkColors: { background: 'oklch(0.1 0 0)', link: '#ffcc00' } })
    expect(themeToDarkCssVariables(theme)).toEqual({
      '--background': 'oklch(0.1 0 0)',
      '--link': '#ffcc00',
    })
  })

  it('carries dark deviations through composition untouched', () => {
    const theme = parseBrandTheme({ darkColors: { background: 'oklch(0.1 0 0)' } })
    const composed = composeTheme(theme, 'CRITICAL', 'high-contrast')
    expect(composed.darkColors).toEqual({ background: 'oklch(0.1 0 0)' })
  })

  // DARK_RAMP_COLORS is a copy of app/globals.css (.dark); this is the guard
  // that keeps the copy honest. If it fails, fix the values here or in the
  // stylesheet — never relax the assertion.
  it('mirrors the .dark block in app/globals.css', () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'globals.css'), 'utf8')
    const block = css.match(/^\.dark\s*\{([\s\S]*?)\}/m)
    expect(block, 'app/globals.css has no .dark block').toBeTruthy()

    const declared = new Map<string, string>()
    for (const line of (block?.[1] ?? '').split('\n')) {
      const match = line.match(/^\s*(--[a-z-]+):\s*(.+?);\s*$/)
      if (match) declared.set(match[1], match[2])
    }

    for (const [token, variable] of Object.entries(COLOR_VARIABLES)) {
      const dark = DARK_RAMP_COLORS[token as keyof typeof COLOR_VARIABLES]
      expect(declared.get(variable), `.dark is missing ${variable}`).toBe(dark)
    }
  })
})
