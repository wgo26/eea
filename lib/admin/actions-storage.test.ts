import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const chains: Array<Record<string, ReturnType<typeof vi.fn>>> = []
  const deleteFromR2 = vi.fn().mockResolvedValue(undefined)
  const createAdminClient = vi.fn()
  function makeChain(data: unknown): Record<string, ReturnType<typeof vi.fn>> {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data, error: null }),
    }
    chains.push(chain)
    return chain
  }
  return { chains, makeChain, deleteFromR2, createAdminClient }
})

vi.mock('server-only', () => ({}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  // actions.ts imports lib/admin/queries.ts, which wraps module-level reads
  // in unstable_cache — pass the fetcher straight through like the other
  // action tests do.
  unstable_cache: (fn: unknown) => fn,
}))

vi.mock('./auth', () => ({
  assertAdmin: vi.fn(async () => ({ user: { id: 'admin-user-id' } })),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: mocks.createAdminClient,
}))

vi.mock('@/lib/storage/providers/r2', () => ({
  deleteFromR2: mocks.deleteFromR2,
}))

import { deleteMediaAsset } from './actions'

describe('deleteMediaAsset', () => {
  beforeEach(() => {
    mocks.chains.length = 0
    mocks.deleteFromR2.mockClear()
    // Default: the lookup finds nothing.
    mocks.createAdminClient.mockImplementation(() => ({
      from: () => mocks.makeChain([]),
    }))
  })

  it('returns an error when the asset does not exist', async () => {
    const res = await deleteMediaAsset('missing-id')
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe('Asset not found.')
    }
    expect(mocks.deleteFromR2).not.toHaveBeenCalled()
  })

  it('removes the R2 object then deletes the row and audits', async () => {
    mocks.createAdminClient.mockImplementation(() => ({
      from: () =>
        mocks.makeChain([
          { id: 'm1', provider: 'r2', storage_key: 'uploads/photo.png', content_item_id: null },
        ]),
    }))

    const res = await deleteMediaAsset('m1')
    expect(res.ok).toBe(true)
    expect(mocks.deleteFromR2).toHaveBeenCalledWith('uploads/photo.png')
    // Each from() call makes a new chain: [lookup, delete row, audit insert].
    // audit() is local to actions.ts and writes moderation_log through the
    // same service-role client — assert the insert payload on the last chain.
    const deleteChain = mocks.chains.at(-2)
    expect(deleteChain?.delete).toHaveBeenCalled()
    expect(deleteChain?.eq).toHaveBeenCalledWith('id', 'm1')
    expect(mocks.chains.at(-1)?.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'storage:asset:delete',
        entity_type: 'media_asset',
        notes: 'uploads/photo.png',
        actor_id: 'admin-user-id',
      }),
    )
  })

  it('skips provider deletion for link-only assets without a storage key', async () => {
    mocks.createAdminClient.mockImplementation(() => ({
      from: () =>
        mocks.makeChain([{ id: 'm2', provider: 'r2', storage_key: null, content_item_id: 'c1' }]),
    }))

    const res = await deleteMediaAsset('m2')
    expect(res.ok).toBe(true)
    expect(mocks.deleteFromR2).not.toHaveBeenCalled()
    expect(mocks.chains.at(-1)?.insert).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'storage:asset:delete', notes: 'm2' }),
    )
  })
})
