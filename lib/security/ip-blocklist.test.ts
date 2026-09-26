import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  return {
    rows: [] as { ip: string; expires_at: string | null }[],
    failReads: false,
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () =>
        mocks.failReads
          ? Promise.reject(new Error('database is down'))
          : Promise.resolve({ data: mocks.rows, error: null }),
    }),
  }),
}))

async function loadModule() {
  vi.resetModules()
  return await import('./ip-blocklist')
}

const FUTURE = new Date(Date.now() + 86_400_000).toISOString()
const PAST = new Date(Date.now() - 86_400_000).toISOString()

beforeEach(async () => {
  mocks.rows = []
  mocks.failReads = false
  const { clearIpBlockCache } = await loadModule()
  clearIpBlockCache()
})

describe('isIpBlocked', () => {
  it('matches listed addresses case-insensitively', async () => {
    mocks.rows = [{ ip: '203.0.113.7', expires_at: null }]
    const { isIpBlocked } = await loadModule()
    expect(await isIpBlocked('203.0.113.7')).toBe(true)
    expect(await isIpBlocked('203.0.113.8')).toBe(false)
  })

  it('ignores expired rows and empty input', async () => {
    mocks.rows = [{ ip: '203.0.113.7', expires_at: PAST }]
    const { isIpBlocked } = await loadModule()
    expect(await isIpBlocked('203.0.113.7')).toBe(false)
    expect(await isIpBlocked(null)).toBe(false)
    expect(await isIpBlocked('unknown')).toBe(false)
  })

  it('honours unexpired rows', async () => {
    mocks.rows = [{ ip: '2001:db8::1', expires_at: FUTURE }]
    const { isIpBlocked } = await loadModule()
    expect(await isIpBlocked('2001:DB8::1')).toBe(true)
  })

  it('fails open when the database is unreachable', async () => {
    mocks.failReads = true
    const { isIpBlocked } = await loadModule()
    expect(await isIpBlocked('203.0.113.7')).toBe(false)
  })
})
