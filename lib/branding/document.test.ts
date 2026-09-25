import { describe, expect, it, vi } from 'vitest'

import {
  DARK_RAMP_COLORS,
  DEFAULT_BRAND_THEME,
  composeTheme,
  type BrandTheme,
} from './tokens'

// The document loader is the only thing here that reads; stubbing it keeps the
// suite free of a database and lets each case state exactly what is published.
const loadActiveThemeRecord = vi.fn()

vi.mock('./index', () => ({
  loadActiveThemeRecord: () => loadActiveThemeRecord(),
}))

const { documentThemeFromRecord, loadDocumentTheme } = await import('./document')

function record(name: string, tokens: BrandTheme) {
  return { name, tokens }
}

/** The declarations inside one selector's block, as a property map. */
function blockOf(css: string, selector: string): Record<string, string> {
  const start = css.indexOf(selector)
  if (start === -1) return {}
  const body = css.slice(css.indexOf('{', start) + 1, css.indexOf('}', start))
  const out: Record<string, string> = {}
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*(--[\w-]+):\s*(.+);$/)
    if (m) out[m[1]] = m[2]
  }
  return out
}

describe('documentThemeFromRecord', () => {
  it('reports the baseline when nothing is published', () => {
    const doc = documentThemeFromRecord(null)
    expect(doc.isBaseline).toBe(true)
    expect(doc.themeName).toBeNull()
    expect(doc.theme).toEqual(DEFAULT_BRAND_THEME)
  })

  it('carries the published theme and its name', () => {
    const published: BrandTheme = {
      ...DEFAULT_BRAND_THEME,
      colors: { ...DEFAULT_BRAND_THEME.colors, primary: 'oklch(0.5 0.2 250)' },
    }
    const doc = documentThemeFromRecord(record('Indigo Press', published))
    expect(doc.isBaseline).toBe(false)
    expect(doc.themeName).toBe('Indigo Press')
    expect(doc.theme.colors.primary).toBe('oklch(0.5 0.2 250)')
  })

  /**
   * The architectural point of this module: the document paints the brand and
   * nothing else. If the state layer ever leaked in here, whichever state was
   * live at generation time would be baked into static HTML for the length of
   * the cache window — an incident palette on pages rendered after it cleared.
   */
  it('never applies the system state layer', () => {
    const doc = documentThemeFromRecord(null)
    const statesThatPaint = ['CRITICAL', 'INCIDENT', 'MAINTENANCE', 'DEGRADED', 'HIGH_ACTIVITY', 'SEASONAL', 'RECOVERY']
    let asserted = 0
    for (const stateId of statesThatPaint) {
      const stateful = composeTheme(DEFAULT_BRAND_THEME, stateId)
      // A state that changes no colour would make the assertion below vacuous,
      // so only the painting states count — and at least one must.
      if (JSON.stringify(stateful.colors) === JSON.stringify(doc.theme.colors)) continue
      asserted += 1
      expect(
        doc.theme.colors,
        `the document theme carries the ${stateId} palette`,
      ).toEqual(DEFAULT_BRAND_THEME.colors)
    }
    expect(asserted, 'no state changed colour, so the assertion above proved nothing').toBeGreaterThan(0)
  })

  it('never applies the accessibility layer either', () => {
    // High contrast belongs to the reader and globals.css asserts it at
    // html.high-contrast (0,1,1). Baking it in here would apply it to everyone.
    const doc = documentThemeFromRecord(null)
    expect(doc.theme.colors.foreground).not.toBe('oklch(0 0 0)')
    expect(doc.theme.colors.border).not.toBe('oklch(0.35 0 0)')
  })
})

describe('documentThemeFromRecord().css', () => {
  const published: BrandTheme = {
    ...DEFAULT_BRAND_THEME,
    colors: {
      ...DEFAULT_BRAND_THEME.colors,
      primary: 'oklch(0.5 0.2 250)',
      background: 'oklch(0.99 0.005 95)',
    },
    darkColors: { primary: 'oklch(0.65 0.2 250)' },
  }

  it('orders :root before .dark so the dark block wins by document order', () => {
    const { css } = documentThemeFromRecord(record('Doc', published))
    expect(css.indexOf('.dark {')).toBeGreaterThan(css.indexOf(':root {'))
  })

  it('states only :root and .dark, so high contrast keeps outranking the brand', () => {
    const { css } = documentThemeFromRecord(record('Doc', published))
    // html.high-contrast is (0,1,1). Any selector here combining a class or
    // element with the root would tie or beat it and silently override an
    // accessibility guarantee.
    const selectors = css
      .split('\n')
      .filter((line) => line.trim().endsWith('{'))
      .map((line) => line.trim())
    expect(selectors).toEqual([':root {', '.dark {'])
  })

  it('resolves the dark block in full, so it renders correctly standalone', () => {
    const dark = blockOf(documentThemeFromRecord(record('Doc', published)).css, '.dark')
    // Overridden by the theme...
    expect(dark['--primary']).toBe('oklch(0.65 0.2 250)')
    // ...and inherited from the shipped ramp wherever the theme stayed quiet.
    expect(dark['--background']).toBe(DARK_RAMP_COLORS.background)
    expect(dark['--popover']).toBe(DARK_RAMP_COLORS.popover)
  })

  it('does not let a light value leak into the dark block', () => {
    // The failure mode: composing dark from the light theme leaves bright
    // surfaces behind the dark class, so dark mode reads as a broken light one.
    const dark = blockOf(documentThemeFromRecord(record('Doc', published)).css, '.dark')
    expect(dark['--background']).not.toBe(published.colors.background)
    expect(dark['--popover']).not.toBe(published.colors.popover)
    expect(dark['--card']).not.toBe(published.colors.card)
  })
})

describe('loadDocumentTheme', () => {
  it('falls back to the baseline when no theme is published', async () => {
    loadActiveThemeRecord.mockResolvedValue(null)
    const doc = await loadDocumentTheme()
    expect(doc.isBaseline).toBe(true)
    expect(doc.css).toContain(':root {')
  })

  it('paints the published theme when one is active', async () => {
    loadActiveThemeRecord.mockResolvedValue(
      record('Teal Edition', {
        ...DEFAULT_BRAND_THEME,
        colors: { ...DEFAULT_BRAND_THEME.colors, primary: 'oklch(0.7 0.14 190)' },
      }),
    )
    const doc = await loadDocumentTheme()
    expect(doc.themeName).toBe('Teal Edition')
    expect(blockOf(doc.css, ':root')['--primary']).toBe('oklch(0.7 0.14 190)')
  })
})

