import { describe, expect, it } from 'vitest'
import { validateContentDraft, type ContentDraftInput } from './content-validation'

function draft(overrides: Partial<ContentDraftInput> = {}): ContentDraftInput {
  return {
    slugBase: 'community update',
    translations: [
      { locale: 'en', title: 'Community update', body: 'Details' },
      { locale: 'fr', title: 'Mise a jour', body: 'Details' },
    ],
    ...overrides,
  }
}

describe('content draft validation', () => {
  it('requires both language titles for publication', () => {
    const value = draft({ translations: [{ locale: 'en', title: 'Only English' }] })

    expect(validateContentDraft(value, true)).toBe('A French title is required before publishing.')
    expect(validateContentDraft(value, false)).toBeNull()
  })

  it('rejects unsafe photo and ticket URLs', () => {
    expect(validateContentDraft(draft({ photos: [{ url: 'javascript:alert(1)' }] }), false))
      .toContain('Photo links must start')
    expect(validateContentDraft(draft({ event: { ticketUrl: '/tickets' } }), false))
      .toBe('Event ticket link must start with http:// or https://.')
  })

  it('rejects an event whose end precedes its start', () => {
    expect(validateContentDraft(draft({
      event: { startsAt: '2026-09-10T12:00:00Z', endsAt: '2026-09-10T11:00:00Z' },
    }), false)).toBe('Event end must be after start.')
  })
})
