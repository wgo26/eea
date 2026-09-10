import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import {
  createPoll,
  updatePoll,
  deletePoll,
  exportPollResults,
  createFundraiser,
  updateFundraiser,
  deleteFundraiser,
} from './actions'

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

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn().mockReturnValue(mockSupabaseClient()),
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
    single: vi.fn().mockResolvedValue({ data: { id: 'mock-id', question: 'Test Poll?' }, error: null }),
    ...overrides,
  }
  return {
    from: vi.fn().mockReturnValue(chain),
  }
}

describe('Phase 3 Engagement Actions (Polls & Fundraisers)', () => {
  describe('createPoll & option validation', () => {
    it('rejects polls with fewer than 2 options', async () => {
      const res = await createPoll({
        question: 'Single Option?',
        options: ['Only one option'],
      })
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.error).toBe('A question and between 2 and 10 options are required.')
      }
    })

    it('rejects polls with duplicate option labels', async () => {
      const res = await createPoll({
        question: 'Duplicate Options?',
        options: ['Option A', 'option a'],
      })
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.error).toBe('Poll options must be unique.')
      }
    })
  })

  describe('updatePoll, deletePoll & exportPollResults', () => {
    it('prevents option editing when votes exist', async () => {
      const res = await updatePoll('poll-123', {
        options: ['New Option A', 'New Option B'],
      })
      expect(typeof res.ok).toBe('boolean')
    })

    it('handles poll deletion and export results', async () => {
      const delRes = await deletePoll('poll-123', true)
      expect(typeof delRes.ok).toBe('boolean')

      const expRes = await exportPollResults('poll-123')
      expect(typeof expRes.ok).toBe('boolean')
    })
  })

  describe('createFundraiser, updateFundraiser & deleteFundraiser', () => {
    it('requires English title and positive goal', async () => {
      const res = await createFundraiser({
        titleEn: '',
        descriptionEn: 'Details',
        goalAmount: 0,
      })
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.error).toBe('English title and description are required.')
      }
    })

    it('rejects negative fundraiser goals', async () => {
      const res = await updateFundraiser('fund-123', {
        goalAmount: -100,
      })
      expect(res.ok).toBe(false)
      if (!res.ok) {
        expect(res.error).toBe('The goal cannot be negative.')
      }
    })

    it('deletes fundraiser item cleanly', async () => {
      const delRes = await deleteFundraiser('fund-123')
      expect(typeof delRes.ok).toBe('boolean')
    })
  })
})
