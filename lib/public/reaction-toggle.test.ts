import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * W20 — content reaction toggle/state. The Supabase chain and the rate
 * limiter are mocked; validation + toggle semantics + race handling are real.
 */
const mocks = vi.hoisted(() => {
  const calls: { table: string; op: string; payload?: unknown }[] = []
  // Queue of canned query results, consumed in order by awaited chains.
  let results: unknown[] = []
  function makeChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockImplementation((payload: unknown) => {
        calls.push({ table, op: 'insert', payload });
        return chain;
      }),
      delete: vi.fn().mockImplementation(() => {
        calls.push({ table, op: 'delete' });
        return chain;
      }),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      // Awaiting the chain resolves the next queued result.
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve(results.length > 0 ? results.shift() : { data: [], error: null }).then(resolve),
    }
    return chain
  }
  return {
    calls,
    setResults: (r: unknown[]) => { results = [...r] },
    clearCalls: () => { calls.length = 0 },
    rateLimited: { value: false },
    createAdminClient: vi.fn(() => ({ from: (table: string) => makeChain(table) })),
  }
})

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/security/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => (mocks.rateLimited.value ? { ok: false } : { ok: true })),
}))

import { getContentReactionState, toggleContentReaction } from './actions'

const ID = '11111111-1111-1111-1111-111111111111'
const TOKEN = 'reader-token-123'

beforeEach(() => {
  mocks.clearCalls()
  mocks.setResults([])
  mocks.rateLimited.value = false
})

describe('content reactions (W20)', () => {
  it('rejects invalid ids, tokens and kinds before touching the DB', async () => {
    await expect(toggleContentReaction('', 'like', TOKEN)).resolves.toEqual({ ok: false, error: 'invalid' })
    await expect(toggleContentReaction(ID, 'love', TOKEN)).resolves.toEqual({ ok: false, error: 'invalid' })
    await expect(toggleContentReaction(ID, 'like', 'x')).resolves.toEqual({ ok: false, error: 'invalid' })
    await expect(getContentReactionState('', TOKEN)).resolves.toEqual({ likes: 0, helpful: 0, mine: [] })
    expect(mocks.createAdminClient).not.toHaveBeenCalled()
  })

  it('refuses writes when the limiter denies (fail-closed)', async () => {
    mocks.rateLimited.value = true
    await expect(toggleContentReaction(ID, 'like', TOKEN)).resolves.toEqual({ ok: false, error: 'rate_limited' })
  })

  it('inserts a tap when none exists and returns the fresh state', async () => {
    // Awaits in order: tap lookup → empty; insert → ok; like count → 1;
    // helpful count → 0; mine → like.
    mocks.setResults([
      { data: [], error: null },
      { data: [{ id: 'row-1' }], error: null },
      { count: 1, error: null },
      { count: 0, error: null },
      { data: [{ kind: 'like' }], error: null },
    ])
    const res = await toggleContentReaction(ID, 'like', TOKEN)
    expect(res).toEqual({ ok: true, state: { likes: 1, helpful: 0, mine: ['like'] } })
    expect(mocks.calls.some((c) => c.table === 'content_reactions' && c.op === 'insert')).toBe(true)
  })

  it('deletes the tap when it already exists', async () => {
    // Awaits in order: tap lookup → existing; delete → ok; counts; mine.
    mocks.setResults([
      { data: [{ id: 'row-1' }], error: null },
      { data: [], error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { data: [], error: null },
    ])
    const res = await toggleContentReaction(ID, 'helpful', TOKEN)
    expect(res.ok).toBe(true)
    expect(mocks.calls.some((c) => c.table === 'content_reactions' && c.op === 'delete')).toBe(true)
  })

  it('absorbs the double-tap unique violation by re-reading', async () => {
    // Awaits in order: tap lookup → empty; insert → 23505 race loss;
    // re-read like count → 2; helpful count → 0; mine → like.
    mocks.setResults([
      { data: [], error: null },
      { data: null, error: { code: '23505', message: 'duplicate' } },
      { count: 2, error: null },
      { count: 0, error: null },
      { data: [{ kind: 'like' }], error: null },
    ])
    const res = await toggleContentReaction(ID, 'like', TOKEN)
    expect(res).toEqual({ ok: true, state: { likes: 2, helpful: 0, mine: ['like'] } })
  })
})
