import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => {
    throw new Error('no database in unit tests')
  },
}))

async function loadModule() {
  vi.resetModules()
  return await import('./audit-chain')
}

beforeEach(() => {
  delete process.env.AUDIT_CHAIN_KEY
  delete process.env.CREDENTIAL_ENCRYPTION_KEY
})

const ENTRY = {
  prevHash: null,
  action: 'credential.rotated',
  resourceType: 'api_credential',
  resourceId: 'id-1',
  actorId: 'actor-1',
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('chainEntryHash', () => {
  it('returns null without any chain key — the trail still writes', async () => {
    const { chainEntryHash } = await loadModule()
    expect(chainEntryHash(ENTRY)).toBeNull()
  })

  it('is deterministic and binds every field', async () => {
    process.env.AUDIT_CHAIN_KEY = 'chain-key'
    const { chainEntryHash } = await loadModule()
    const first = chainEntryHash(ENTRY)
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(chainEntryHash(ENTRY)).toBe(first)
    expect(chainEntryHash({ ...ENTRY, action: 'credential.revoked' })).not.toBe(first)
    expect(chainEntryHash({ ...ENTRY, prevHash: 'other' })).not.toBe(first)
    expect(chainEntryHash({ ...ENTRY, actorId: null })).not.toBe(first)
  })

  it('falls back to the credential encryption key', async () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = 'fallback-key'
    const { chainEntryHash } = await loadModule()
    expect(chainEntryHash(ENTRY)).toMatch(/^[0-9a-f]{64}$/)
  })

  it('chains: each entry commits to its predecessor', async () => {
    process.env.AUDIT_CHAIN_KEY = 'chain-key'
    const { chainEntryHash } = await loadModule()
    const genesis = chainEntryHash(ENTRY)
    const second = chainEntryHash({ ...ENTRY, prevHash: genesis, action: 'credential.validated' })
    expect(second).not.toBe(genesis)
    // Tampering with the stored predecessor breaks the recomputation.
    const tampered = chainEntryHash({ ...ENTRY, prevHash: 'forged', action: 'credential.validated' })
    expect(tampered).not.toBe(second)
  })
})

describe('latestChainHash', () => {
  it('resolves null when the database is unreachable (genesis assumption)', async () => {
    const { latestChainHash } = await loadModule()
    await expect(latestChainHash()).resolves.toBeNull()
  })
})
