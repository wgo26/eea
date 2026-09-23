import { describe, expect, it } from 'vitest'
import { formatPrice } from './format'
import { validateContentDraft } from './content-validation'

/** Phase 1/3 — locale-aware admin formatting/validation never regresses to EN-only. */
describe('admin locale formatting', () => {
  it('formats prices per locale (FR spacing, EN grouping)', () => {
    const en = formatPrice(45000, 'XAF', 'en')
    const fr = formatPrice(45000, 'XAF', 'fr')
    // ICU renders XAF with the FCFA symbol in both locales — the locale
    // difference is the grouping (en-GB comma vs fr-FR narrow-no-break space).
    expect(en).toMatch(/45,000/)
    expect(fr).toMatch(/45[\u00a0\u202f]000/)
    expect(fr).not.toBe(en)
  })

  it('returns French validation messages when asked', () => {
    const missing = {
      slugBase: 'x',
      translations: [{ locale: 'en' as const, title: 'Only English' }],
    }
    expect(validateContentDraft(missing, true, 'fr')).toBe(
      'Un titre français est requis avant publication.',
    )
    expect(validateContentDraft(missing, true, 'en')).toBe(
      'A French title is required before publishing.',
    )
  })

  it('keeps English as the default validation locale', () => {
    expect(
      validateContentDraft(
        { slugBase: 'x', translations: [{ locale: 'en' as const, title: '' }] },
        false,
      ),
    ).toBe('An English title is required.')
  })
})
