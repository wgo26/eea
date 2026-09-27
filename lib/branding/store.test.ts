import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * createThemeRow's version-slot handling.
 *
 * `brand_themes` is unique on (name, version), and every "create a draft"
 * surface seeds its tokens FROM an existing theme — so the draft arrives
 * already carrying a version that name owns. That used to surface Postgres'
 * raw `brand_themes_name_version_key` text to the admin; the store now claims
 * the next free minor and retries. The Supabase chain is mocked; the version
 * maths and the retry/stop decisions are real.
 */
const mocks = vi.hoisted(() => {
  const inserts: { table: string; row: Record<string, unknown> }[] = []
  // Per-table queues of canned results, consumed in call order.
  const queues: Record<string, unknown[]> = {}
  const UNIQUE_VIOLATION = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "brand_themes_name_version_key"',
  }

  function makeChain(table: string): Record<string, unknown> {
    let pending: Record<string, unknown> | null = null
    function next(): unknown {
      const queued = queues[table]?.shift()
      if (queued !== undefined) return queued
      const version = (pending as { version?: string } | null)?.version ?? '1.0'
      return { data: { id: 'theme-1', version }, error: null }
    }
    const chain: Record<string, unknown> = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockImplementation((row: Record<string, unknown>) => {
        pending = row
        inserts.push({ table, row })
        return chain
      }),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockImplementation(() => Promise.resolve(next())),
      single: vi.fn().mockImplementation(() => Promise.resolve(next())),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(next()).then(resolve),
    }
    return chain
  }

  return {
    inserts,
    UNIQUE_VIOLATION,
    setQueue: (table: string, results: unknown[]) => { queues[table] = [...results] },
    reset: () => { inserts.length = 0; for (const key of Object.keys(queues)) delete queues[key] },
    createAdminClient: vi.fn(() => ({ from: (table: string) => makeChain(table) })),
  }
})

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))

import { createThemeRow } from './store'
import { DEFAULT_BRAND_THEME } from './tokens'

const ACTOR = '11111111-1111-1111-1111-111111111111'

/** Tokens as they arrive from a clone/colour editor: carrying the source's version. */
function tokensAt(version: string) {
  return { ...DEFAULT_BRAND_THEME, version }
}

function insertedRows(table: string) {
  return mocks.inserts.filter((i) => i.table === table).map((i) => i.row)
}

beforeEach(() => {
  mocks.reset()
  mocks.createAdminClient.mockClear()
})


describe('createThemeRow version slots (brand_themes_name_version_key)', () => {
  it('inserts at the requested version when the slot is free', async () => {
    const result = await createThemeRow({ name: 'Fresh', tokens: tokensAt('1.0'), createdBy: ACTOR })
    expect(result.ok).toBe(true)
    expect(insertedRows('brand_themes')[0]).toMatchObject({
      name: 'Fresh',
      version: '1.0',
      status: 'draft',
      is_active: false,
    })
  })

  it('steps to the next free minor instead of surfacing the unique violation', async () => {
    // Name "EEA Default" already exists at 1.0, so a draft seeded from it must
    // not ask for that slot twice — this is the exact state the admin hit.
    mocks.setQueue('brand_themes', [{ data: null, error: mocks.UNIQUE_VIOLATION }])
    const result = await createThemeRow({ name: 'EEA Default', tokens: tokensAt('1.0'), createdBy: ACTOR })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.version).not.toBe('1.0')
    expect(insertedRows('brand_themes').map((r) => r.version)).toEqual(['1.0', '1.1'])
  })

  it('keeps stepping through a name that already iterated several times', async () => {
    mocks.setQueue('brand_themes', [
      { data: null, error: mocks.UNIQUE_VIOLATION },
      { data: null, error: mocks.UNIQUE_VIOLATION },
      { data: null, error: mocks.UNIQUE_VIOLATION },
    ])
    const result = await createThemeRow({ name: 'EEA Default', tokens: tokensAt('1.0'), createdBy: ACTOR })
    expect(result.ok).toBe(true)
    expect(insertedRows('brand_themes').map((r) => r.version)).toEqual(['1.0', '1.1', '1.2', '1.3'])
  })

  it('absorbs a lost insert race against another admin', async () => {
    // Both drafts ask for 1.1; the later one must still get a row, not an error.
    mocks.setQueue('brand_themes', [{ data: null, error: mocks.UNIQUE_VIOLATION }])
    const result = await createThemeRow({ name: 'Shared', tokens: tokensAt('1.1'), createdBy: ACTOR })
    expect(result.ok).toBe(true)
    expect(insertedRows('brand_themes')[1]).toMatchObject({ version: '1.2' })
  })

  it('surfaces a non-uniqueness failure immediately rather than looping', async () => {
    mocks.setQueue('brand_themes', [
      { data: null, error: { code: '42501', message: 'permission denied for table brand_themes' } },
    ])
    const result = await createThemeRow({ name: 'Blocked', tokens: tokensAt('1.0'), createdBy: ACTOR })
    expect(result).toEqual({ ok: false, error: 'permission denied for table brand_themes' })
    expect(insertedRows('brand_themes')).toHaveLength(1)
  })

  it('writes the history snapshot at the version actually claimed', async () => {
    // A snapshot recorded under the version that lost the race would mislabel
    // the theme's history, which is the audit trail spec §9 promises.
    mocks.setQueue('brand_themes', [{ data: null, error: mocks.UNIQUE_VIOLATION }])
    const result = await createThemeRow({ name: 'EEA Default', tokens: tokensAt('1.0'), createdBy: ACTOR })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    const [snapshot] = insertedRows('brand_theme_versions')
    expect(snapshot).toMatchObject({ version: '1.1', created_by: ACTOR })
    expect(snapshot.version).toBe(result.version)
  })

  it('trims the name before writing', async () => {
    await createThemeRow({ name: '  Padded  ', tokens: tokensAt('1.0'), createdBy: ACTOR })
    expect(insertedRows('brand_themes')[0].name).toBe('Padded')
  })
})
