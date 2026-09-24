import { describe, expect, it } from 'vitest'

import {
  PREVIEW_COMPONENTS,
  PREVIEW_VIEWPORTS,
  contrastHighlights,
  isPreviewComponentId,
  renderThemePreview,
} from './preview-engine'
import { DARK_RAMP_COLORS, DEFAULT_BRAND_THEME, parseBrandTheme } from './tokens'

describe('preview catalogue', () => {
  it('covers the five surfaces spec §10 names', () => {
    expect(PREVIEW_COMPONENTS.map((component) => component.id)).toEqual([
      'homepage',
      'news',
      'photo-story',
      'notice',
      'buy-sell',
    ])
  })

  it('offers desktop, tablet and mobile frames', () => {
    expect(PREVIEW_VIEWPORTS.map((viewport) => viewport.id)).toEqual(['desktop', 'tablet', 'mobile'])
    expect(PREVIEW_VIEWPORTS.find((viewport) => viewport.id === 'mobile')?.stacked).toBe(true)
  })

  it('narrows component ids', () => {
    expect(isPreviewComponentId('homepage')).toBe(true)
    expect(isPreviewComponentId('checkout')).toBe(false)
  })
})

describe('renderThemePreview', () => {
  it('draws every component from theme tokens, never inline copy', () => {
    for (const component of PREVIEW_COMPONENTS) {
      const render = renderThemePreview(DEFAULT_BRAND_THEME, component.id)
      expect(render.blocks.length).toBeGreaterThan(0)
      for (const block of render.blocks) {
        expect(block.copyKey.startsWith(`${component.id}.`)).toBe(true)
        expect(Object.keys(block.style).length).toBeGreaterThan(0)
      }
    }
  })

  it('reflects the theme it is given', () => {
    const theme = parseBrandTheme({
      colors: { primary: 'oklch(0.5 0.2 200)' },
      components: { buttonShape: 'pill' },
      typography: { headingWeight: 900 },
    })
    const render = renderThemePreview(theme, 'homepage')
    const button = render.blocks.find((block) => block.kind === 'button')
    const heading = render.blocks.find((block) => block.kind === 'heading')
    expect(button?.style.background).toBe('oklch(0.5 0.2 200)')
    expect(button?.style.borderRadius).toBe('9999px')
    expect(heading?.style.fontWeight).toBe('900')
    expect(render.variables['--primary']).toBe('oklch(0.5 0.2 200)')
  })

  it('applies the imagery treatment as a filter on media blocks', () => {
    const mono = renderThemePreview(parseBrandTheme({ imagery: { treatment: 'monochrome' } }), 'news')
    expect(mono.blocks.find((block) => block.kind === 'media')?.style.filter).toBe('grayscale(1)')

    const standard = renderThemePreview(DEFAULT_BRAND_THEME, 'news')
    expect(standard.blocks.find((block) => block.kind === 'media')?.style.filter).toBe('none')
  })

  it('previews the composed state and accessibility layers', () => {
    const render = renderThemePreview(DEFAULT_BRAND_THEME, 'notice', { stateId: 'CRITICAL' })
    expect(render.variables['--primary']).toBe('oklch(0.55 0.22 27)')
    expect(render.variables['--brand-motion']).toBe('0.001s')

    const contrast = renderThemePreview(DEFAULT_BRAND_THEME, 'notice', { accessibility: 'high-contrast' })
    expect(contrast.theme.colors.foreground).toBe('oklch(0 0 0)')
  })

  it('resolves a dark pane that does not depend on the shipped .dark class', () => {
    const render = renderThemePreview(DEFAULT_BRAND_THEME, 'homepage')
    expect(render.darkVariables['--background']).toBe(DARK_RAMP_COLORS.background)
    expect(render.css).toContain('.dark {')

    const themed = renderThemePreview(parseBrandTheme({ darkColors: { background: 'oklch(0.1 0 0)' } }), 'homepage')
    expect(themed.darkVariables['--background']).toBe('oklch(0.1 0 0)')
    expect(themed.darkTheme.colors.background).toBe('oklch(0.1 0 0)')
    // The light pane is untouched by a dark override.
    expect(themed.variables['--background']).toBe(DEFAULT_BRAND_THEME.colors.background)
  })

  it('carries the validation report the publish action will re-run', () => {
    const bad = parseBrandTheme({
      colors: { foreground: 'oklch(0.95 0 0)', background: 'oklch(1 0 0)' },
    })
    const render = renderThemePreview(bad, 'homepage')
    expect(render.validation.valid).toBe(false)

    const baseline = renderThemePreview(DEFAULT_BRAND_THEME, 'homepage')
    expect(baseline.validation.valid).toBe(true)
    expect(contrastHighlights(baseline.validation).every((row) => row.passes === false)).toBe(true)
  })
})
