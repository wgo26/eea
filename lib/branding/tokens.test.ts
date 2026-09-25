import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  COLOR_VARIABLES,
  DARK_RAMP_COLORS,
  DEFAULT_BRAND_THEME,
  DEFERRED_COLOR_VARIABLES,
  composeTheme,
  cssBlock,
  isSafeCssValue,
  getAccessibilityTokenOverrides,
  getStateTokenOverrides,
  parseBrandTheme,
  resolveDarkColors,
  serializeTheme,
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

/* ------------------------------------------------------------------ */
/* CSS value safety (injection hardening)                              */
/* ------------------------------------------------------------------ */

describe('isSafeCssValue', () => {
  // The values the design system actually ships must all survive: dropping one
  // of these would silently un-brand a surface, which is the failure this
  // filter has to avoid while still refusing markups.
  it.each([
    'oklch(1 0 0)',
    'oklch(0.83 0.19 85)',
    'oklch(0.205 0.02 75)',
    'oklch(1 0 0 / 10%)',
    '#ffcc00',
    'rgb(0 0 0 / 0.06)',
    '0 1px 2px rgb(0 0 0 / 0.06), 0 4px 16px -4px rgb(0 0 0 / 0.12)',
    'cubic-bezier(0.2, 0, 0, 1)',
    '0.625rem',
    '200ms',
    '700',
  ])('accepts the shipped notation %s', (value) => {
    expect(isSafeCssValue(value)).toBe(true)
  })

  // Every value below is the raw text of a stored token. cssBlock is the last
  // function to see it before it is written into a <style> on every page, and
  // CSP allows inline styles by design, so this is the check that matters.
  it.each([
    ['closes the declaration and reopens a rule', 'red; } body { display: none'],
    ['closes the style element and injects markup', '</style><script>alert(1)</script>'],
    ['breaks out via an img onerror', '</style><img src=x onerror=alert(1)>'],
    ['opens a nested block', 'red { color: blue }'],
    ['carries an at-rule', '@import url(https://evil.test/x.css)'],
    ['reaches a host with no scheme, which the charset alone would allow', 'url(//evil.test/x.png)'],
    ['reaches a relative host the charset alone would allow', 'url(evil.test)'],
    ['uses a CSS comment to hide text', 'red /* } */ blue'],
    ['is only whitespace', '   '],
    ['is empty', ''],
  ])('refuses %s', (_label, value) => {
    expect(isSafeCssValue(value)).toBe(false)
  })

  it('refuses a value that is not a declaration body at all', () => {
    // A colour token carrying a property name and semicolon is a markup
    // attempt, not a value.
    expect(isSafeCssValue('color: red')).toBe(false)
  })

  it('refuses an over-long value', () => {
    expect(isSafeCssValue(`oklch(0.5 0 ${'9'.repeat(600)})`)).toBe(false)
  })
})

describe('cssBlock', () => {
  it('drops unsafe declarations and keeps the rest of the block intact', () => {
    const css = cssBlock(':root', {
      '--primary': 'oklch(0.5 0.2 200)',
      '--link': 'red; } body { display: none',
      '--ring': 'oklch(0.5 0.1 85)',
    })
    expect(css).toContain('--primary: oklch(0.5 0.2 200);')
    expect(css).toContain('--ring: oklch(0.5 0.1 85);')
    expect(css).not.toContain('display: none')
    // Only the block's own delimiters survive.
    expect(css.match(/\{/g)).toHaveLength(1)
    expect(css.match(/\}/g)).toHaveLength(1)
  })

  it('never lets a stored token terminate the style element', () => {
    const css = cssBlock('.dark', { '--background': '</style><img src=x onerror=alert(1)>' })
    expect(css).not.toContain('</style>')
    expect(css).not.toContain('<img')
    expect(css).toBe('.dark {\n\n}')
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

  // The surface of the design system the engine can repaint. A token that stops
  // being emitted here silently reverts to globals.css at runtime, so the count
  // is asserted, not just spot-checked.
  it('emits one declaration per mapped colour token', () => {
    const vars = themeToCssVariables(DEFAULT_BRAND_THEME)
    for (const variable of Object.values(COLOR_VARIABLES)) {
      expect(vars[variable], `${variable} was not emitted`).toBeTruthy()
    }
    const nonBrand = Object.keys(vars).filter((key) => !key.startsWith('--brand'))
    expect(nonBrand).toHaveLength(Object.keys(COLOR_VARIABLES).length + 4)
    // radius, the two shadows and the easing curve — the non-colour geometry
    // vars the design system ships alongside the palette.
    expect(nonBrand.filter((k) => !Object.values(COLOR_VARIABLES).includes(k)).sort()).toEqual(
      ['--ease-standard', '--radius', '--shadow-card', '--shadow-lift'],
    )
    expect(vars['--secondary']).toBe(DEFAULT_BRAND_THEME.colors.secondary)
    expect(vars['--popover-foreground']).toBe(DEFAULT_BRAND_THEME.colors.popoverForeground)
    // Deferred vars must never leak in — they are not the theme's to set.
    for (const variable of Object.values(DEFERRED_COLOR_VARIABLES)) {
      expect(vars[variable], `${variable} is deferred but was emitted`).toBeUndefined()
    }
  })
})

describe('serializeTheme', () => {
  // The filter in cssBlock must cost the baseline nothing: a dropped
  // declaration here means a surface silently falls back to globals.css while
  // everything around it is rebranded. This is the guard that the allowlist is
  // wide enough for what the design system actually ships.
  it('emits every declaration for the shipped baseline', () => {
    const css = serializeTheme(DEFAULT_BRAND_THEME)
    const perScheme = Object.keys(themeToCssVariables(DEFAULT_BRAND_THEME)).length
    expect(perScheme).toBeGreaterThan(Object.keys(COLOR_VARIABLES).length)
    const declarations = css.split('\n').filter((line) => line.trim().endsWith(';'))
    expect(declarations).toHaveLength(perScheme * 2)
    // Nothing was filtered out of either block.
    for (const selector of [':root', '.dark']) {
      const start = css.indexOf(selector)
      const block = css.slice(start, css.indexOf('}', start))
      expect(block.split('\n').filter((l) => l.trim().endsWith(';'))).toHaveLength(perScheme)
    }
  })

  // Injection relies on source order: :root and .dark share specificity and both
  // match <html>, so the dark block must come second or dark mode loses.
  it('places the dark block after :root and repaints both schemes', () => {
    const css = serializeTheme(DEFAULT_BRAND_THEME)
    const rootAt = css.indexOf(':root {')
    const darkAt = css.indexOf('.dark {')
    expect(rootAt).toBeGreaterThanOrEqual(0)
    expect(darkAt).toBeGreaterThan(rootAt)

    for (const variable of Object.values(COLOR_VARIABLES)) {
      const hits = css.match(new RegExp(`${variable}:`, 'g')) ?? []
      // Emitted once per scheme, and the two blocks are fully resolved.
      expect(hits, `${variable} should appear in both :root and .dark`).toHaveLength(2)
    }
    // Dark carries the ramp, not the light value, for tokens the theme omits.
    const darkBlock = css.slice(darkAt)
    expect(darkBlock).toContain(`--background: ${DARK_RAMP_COLORS.background}`)
    expect(darkBlock).toContain(`--popover: ${DARK_RAMP_COLORS.popover}`)
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

  // Rows saved before a token existed hold jsonb that simply lacks the key. The
  // new tokens must arrive as the shipped values, never as '' or undefined — an
  // empty custom property makes every consumer fall back to the browser default
  // (black on white), which is how a rebrand "loses" the secondary buttons.
  it('backfills tokens added after a row was saved', () => {
    const legacy = {
      name: 'Legacy',
      colors: { primary: 'oklch(0.5 0.2 200)' },
      darkColors: { primary: 'oklch(0.6 0.2 200)' },
    }
    const theme = parseBrandTheme(legacy)
    for (const key of ['popover', 'popoverForeground', 'secondary', 'secondaryForeground', 'input'] as const) {
      expect(theme.colors[key], `colors.${key} was not backfilled`).toBe(DEFAULT_BRAND_THEME.colors[key])
    }
    expect(theme.colors.popover).toBe('oklch(1 0 0)')
    expect(theme.colors.secondary).toBe('oklch(0.97 0 0)')
    expect(theme.colors.input).toBe('oklch(0.922 0 0)')
    // Dark stays a genuine deviation: absent means "inherit the ramp", not "".
    expect(theme.darkColors.popover).toBeUndefined()
    expect(resolveDarkColors(theme).popover).toBe(DARK_RAMP_COLORS.popover)
    expect(resolveDarkColors(theme).primary).toBe('oklch(0.6 0.2 200)')
  })

  // DARK_RAMP_COLORS is a copy of app/globals.css (.dark); this is the guard
  // that keeps the copy honest. If it fails, fix the values here or in the
  // stylesheet — never relax the assertion.
  it('mirrors the .dark block in app/globals.css', () => {
    const declared = readCssBlock('.dark')
    expect(declared.size, 'app/globals.css has no .dark block').toBeGreaterThan(0)

    for (const [token, variable] of Object.entries(COLOR_VARIABLES)) {
      const dark = DARK_RAMP_COLORS[token as keyof typeof COLOR_VARIABLES]
      expect(declared.get(variable), `.dark is missing ${variable}`).toBe(dark)
    }
  })
})

/* ------------------------------------------------------------------ */
/* Coverage of the stylesheet's colour vocabulary                      */
/* ------------------------------------------------------------------ */

/**
 * `--chart-1` and friends carry digits, so a `(--[a-z-]+)` matcher silently
 * finds nothing and the guard reports success over vars it never read. Digits
 * must stay in this class — widening the value side is harmless, narrowing the
 * name side is what hid the charts ramp.
 */
function readCssBlock(selector: string): Map<string, string> {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app', 'globals.css'), 'utf8')
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const block = css.match(new RegExp(`^${escaped}\\s*\\{([\\s\\S]*?)\\}`, 'm'))
  const declared = new Map<string, string>()
  for (const line of (block?.[1] ?? '').split('\n')) {
    const match = line.match(/^\s*(--[a-z0-9-]+):\s*(.+?);\s*$/)
    // --radius is geometry, not a colour; the brand-only vars are emitted by
    // themeToCssVariables and deliberately not declared in :root.
    if (match && match[1] !== '--radius' && !match[1].startsWith('--brand')) {
      declared.set(match[1], match[2])
    }
  }
  return declared
}

describe('colour vocabulary coverage', () => {
  it('the digit-bearing vars are visible to the block parser', () => {
    // Regression guard for the parser itself: without this, a silent no-match
    // in the coverage tests below would read as a pass.
    const root = readCssBlock(':root')
    expect(root.has('--chart-1'), ':root is missing --chart-1').toBe(true)
    expect(root.has('--sidebar-accent-foreground')).toBe(true)
  })

  // Every colour variable the design system declares is either a theme token or
  // an explicitly deferred one. A new var in globals.css that belongs to neither
  // means an admin rebrand would leave that surface on the old palette — the
  // exact split-brain this closes, so name it here rather than in a bug report.
  it('accounts for every colour var in globals.css, in both schemes', () => {
    const owned = new Set([...Object.values(COLOR_VARIABLES), ...Object.values(DEFERRED_COLOR_VARIABLES)])
    for (const selector of [':root', '.dark']) {
      const declared = readCssBlock(selector)
      expect(declared.size, `globals.css declares no colour vars in ${selector}`).toBeGreaterThan(0)
      for (const variable of declared.keys()) {
        expect(owned, `${selector} declares ${variable}, which the token engine neither maps nor defers`).toContain(variable)
      }
    }
  })

  it('maps every token the engine claims and defers the rest without overlap', () => {
    const mapped = Object.values(COLOR_VARIABLES)
    expect(mapped).toHaveLength(19)
    expect(new Set(mapped).size, 'two tokens share one CSS variable').toBe(mapped.length)
    const deferred = Object.values(DEFERRED_COLOR_VARIABLES)
    for (const variable of deferred) {
      expect(mapped, `${variable} is both mapped and deferred`).not.toContain(variable)
    }
  })

  it('every mapped variable is actually declared by both schemes', () => {
    const schemes = [':root', '.dark'].map(readCssBlock)
    for (const variable of Object.values(COLOR_VARIABLES)) {
      for (const [index, declared] of schemes.entries()) {
        expect(declared.has(variable), `${variable} is not declared in ${[':root', '.dark'][index]}`).toBe(true)
      }
    }
  })
})
