import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createCategory,
  deleteCategory,
  createLocation,
} from './actions'

vi.mock('./auth', () => ({
  assertCapability: vi.fn().mockResolvedValue({
    supabase: mockSupabaseClient(),
    user: { id: 'test-user-id' },
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

function mockSupabaseClient(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: { id: 'mock-id' }, error: null }),
    ...overrides,
  }
  return {
    from: vi.fn().mockReturnValue(chain),
  }
}

describe('Taxonomy Actions', () => {
  describe('createCategory & updateCategory validation', () => {
    it('validates category content type', async () => {
      const result = await createCategory({
        slug: 'test-cat',
        contentType: 'invalid_type',
        nameEn: 'Test',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('Unknown content type.')
      }
    })

    it('requires English name for category', async () => {
      const result = await createCategory({
        slug: 'test-cat',
        contentType: 'news',
        nameEn: '',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('An English name is required.')
      }
    })
  })

  describe('deleteCategory reassignment enforcement', () => {
    it('prevents self-reassignment', async () => {
      const result = await deleteCategory('cat-123', 'cat-123')
      expect(result.ok).toBe(false)
    })
  })

  describe('createLocation & updateLocation validation', () => {
    it('requires location name', async () => {
      const result = await createLocation({
        name: '   ',
      })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toBe('A name is required.')
      }
    })
  })
})
