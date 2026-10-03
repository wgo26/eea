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

  it('accepts a profile author id but rejects a malformed one', () => {
    expect(validateContentDraft(draft({ authorId: '123e4567-e89b-12d3-a456-426614174000' }), false)).toBeNull()
    expect(validateContentDraft(draft({ authorId: null }), false)).toBeNull()
    expect(validateContentDraft(draft({ authorId: 'not-a-uuid' }), false))
      .toBe('Unknown author — please pick an author from the search results.')
  })

  it('requires a location for publication but not for drafts', () => {
    // Drafts may stay locationless until they publish.
    expect(validateContentDraft(draft(), false)).toBeNull()
    expect(validateContentDraft(draft({ locationId: 'loc-1' }), true)).toBeNull()
    expect(validateContentDraft(draft(), true))
      .toBe('Add a location before publishing — place pages and filters depend on it.')
    expect(validateContentDraft(draft({ locationId: null }), true))
      .toBe('Add a location before publishing — place pages and filters depend on it.')
  })

  it('rejects bad listing and notice domain data', () => {
    expect(validateContentDraft(draft({ listing: { price: -5 } }), false))
      .toBe('Listing price must be a positive number.')
    expect(validateContentDraft(draft({ listing: { price: Number.NaN } }), false))
      .toBe('Listing price must be a positive number.')
    expect(validateContentDraft(draft({ listing: { contactEmail: 'not-an-email' } }), false))
      .toBe('Contact email address is invalid.')
    expect(validateContentDraft(draft({ listing: { contactPhone: '12' } }), false))
      .toBe('Contact phone number is invalid — use 6 to 15 digits.')
    expect(validateContentDraft(draft({ listing: { whatsappNumber: 'abc' } }), false))
      .toBe('Contact phone number is invalid — use 6 to 15 digits.')
    expect(validateContentDraft(draft({ listing: { currency: 'X' } }), false))
      .toBe('Currency must be a 3-letter code (e.g. XAF).')
    expect(validateContentDraft(draft({ notice: { noticeType: 'general', noticeDate: 'nope' } }), false))
      .toBe('Notice date is invalid.')
    expect(validateContentDraft(draft({ notice: { noticeType: 'general', expiryDate: 'nope' } }), false))
      .toBe('Notice expiry date is invalid.')
    expect(validateContentDraft(draft({
      notice: { noticeType: 'general', noticeDate: '2026-10-10', expiryDate: '2026-10-01' },
    }), false)).toBe('Notice expiry must be after the notice date.')
    expect(validateContentDraft(draft({
      listing: { price: 5000, currency: 'XAF', contactEmail: 'seller@example.com', contactPhone: '+237 600 000 000' },
      notice: { noticeType: 'general', noticeDate: '2026-10-01', expiryDate: '2026-11-01' },
    }), false)).toBeNull()
  })
})
