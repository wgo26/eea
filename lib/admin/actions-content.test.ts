import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { createContentItem, deleteContentItem } from './actions'

vi.mock('./auth', () => ({
  assertCapability: vi.fn().mockResolvedValue({
    supabase: mockSupabaseClient(),
    user: { id: 'staff-user-id' },
  }),
  assertAdmin: vi.fn().mockResolvedValue({
    supabase: mockSupabaseClient(),
    user: { id: 'admin-user-id' },
  }),
  assertStaff: vi.fn().mockResolvedValue({
    supabase: mockSupabaseClient(),
    user: { id: 'staff-user-id' },
  }),
  audit: vi.fn().mockResolvedValue(undefined),
  revalidateTaxonomy: vi.fn(),
  revalidateLocalized: vi.fn(),
}))

function mockSupabaseClient() {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'item-123' }, error: null }),
  }
  return {
    from: vi.fn().mockReturnValue(chain),
  }
}

describe('Content Lifecycle Actions', () => {
  describe('createContentItem validation & parameter checking', () => {
    it('rejects unknown content types', async () => {
      const res = await createContentItem({
        type: 'invalid_type',
        draft: {
          slugBase: 'invalid',
          translations: [
            { locale: 'en', title: 'Title', body: 'Body' },
            { locale: 'fr', title: 'Titre', body: 'Corps' },
          ],
        },
        publish: 'now',
      })
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.error).toBe('Unknown content type.')
      }
    })

    it('requires schedule date when publish mode is schedule', async () => {
      const res = await createContentItem({
        type: 'news',
        draft: {
          slugBase: 'news-item',
          translations: [
            { locale: 'en', title: 'News Title', body: 'News Body' },
            { locale: 'fr', title: 'Titre de Nouvelle', body: 'Corps' },
          ],
        },
        publish: 'schedule',
      })
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.error).toBe('A schedule date is required when scheduling.')
      }
    })
  })

  describe('deleteContentItem authorization & failure handling', () => {
    it('returns error if item is not found', async () => {
      const res = await deleteContentItem('non-existent-id')
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.error).toBe('Content item not found.')
      }
    })
  })
})
