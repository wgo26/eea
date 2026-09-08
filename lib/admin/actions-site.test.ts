import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const chains: Array<Record<string, ReturnType<typeof vi.fn>>> = []
  function makeChain(): Record<string, ReturnType<typeof vi.fn>> {
    const chain: Record<string, ReturnType<typeof vi.fn>> = {
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }
    chains.push(chain)
    return chain
  }
  return { chains, makeChain }
})

vi.mock('server-only', () => ({}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}))

vi.mock('./auth', () => ({
  assertCapability: vi.fn(async () => ({
    supabase: { from: vi.fn().mockReturnValue(mocks.makeChain()) },
    user: { id: 'staff-user-id' },
  })),
  assertAdmin: vi.fn(),
  assertStaff: vi.fn(),
  assertReauth: vi.fn(),
  audit: vi.fn().mockResolvedValue(undefined),
}))

import { saveAdvertiseSection, saveSiteSetting } from './actions'

describe('Advertise override actions', () => {
  it('rejects unknown sections', async () => {
    const res = await saveAdvertiseSection({ sectionKey: 'nope', locale: 'en', heading: 'X' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe('Unknown section.')
    }
  })

  it('upserts the override when a field is set', async () => {
    const res = await saveAdvertiseSection({
      sectionKey: 'pricing',
      locale: 'en',
      heading: 'Pricing',
      body: 'From XAF 25,000 / week.',
    })
    expect(res.ok).toBe(true)
    const chain = mocks.chains.at(-1)
    expect(chain?.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ section_key: 'pricing', locale: 'en' }),
      expect.objectContaining({ onConflict: 'section_key,locale' }),
    )
  })

  it('deletes the override when every field is empty (dictionary returns)', async () => {
    const res = await saveAdvertiseSection({ sectionKey: 'pricing', locale: 'fr', heading: '  ', body: null })
    expect(res.ok).toBe(true)
    const chain = mocks.chains.at(-1)
    expect(chain?.delete).toHaveBeenCalled()
    expect(chain?.eq).toHaveBeenCalledWith('section_key', 'pricing')
    expect(chain?.eq).toHaveBeenCalledWith('locale', 'fr')
  })
})

describe('Site setting actions', () => {
  it('rejects unknown setting keys', async () => {
    const res = await saveSiteSetting({ key: 'admin_password', value: 'hunter2' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe('Unknown setting.')
    }
  })

  it('rejects values that are not absolute http(s) URLs', async () => {
    const res = await saveSiteSetting({ key: 'social_facebook_url', value: 'javascript:alert(1)' })
    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.error).toBe('Enter a full URL starting with https://.')
    }
  })

  it('upserts a validated https URL', async () => {
    const res = await saveSiteSetting({
      key: 'social_facebook_url',
      value: 'https://facebook.com/EagleEyeAfrica',
    })
    expect(res.ok).toBe(true)
    const chain = mocks.chains.at(-1)
    expect(chain?.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'social_facebook_url', value: 'https://facebook.com/EagleEyeAfrica' }),
      expect.objectContaining({ onConflict: 'key' }),
    )
  })

  it('deletes the setting when the value is empty (icon hides, defaults return)', async () => {
    const res = await saveSiteSetting({ key: 'social_youtube_url', value: '' })
    expect(res.ok).toBe(true)
    const chain = mocks.chains.at(-1)
    expect(chain?.delete).toHaveBeenCalled()
    expect(chain?.eq).toHaveBeenCalledWith('key', 'social_youtube_url')
  })
})
