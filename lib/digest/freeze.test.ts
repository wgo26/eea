import { describe, expect, it } from 'vitest'
import { hasFrozenStories, parseDigestFreeze } from './freeze'

const story = (overrides: Record<string, unknown> = {}) => ({
  title: 'Market fire reopens',
  type: 'news',
  path: '/news/market-fire',
  shareText: 'Market don open again',
  ...overrides,
})

describe('parseDigestFreeze', () => {
  it('accepts the digest_freeze shape and preserves order', () => {
    const parsed = parseDigestFreeze({
      en: [story(), story({ title: 'Second', path: '/notices/second' })],
      fr: [story({ title: 'Incendie', path: '/news/incendie' })],
    })
    expect(parsed.en).toHaveLength(2)
    expect(parsed.en?.[0].title).toBe('Market fire reopens')
    expect(parsed.en?.[1].path).toBe('/notices/second')
    expect(parsed.fr?.[0].title).toBe('Incendie')
    expect(parsed.fr?.[0].shareText).toBe('Market don open again')
  })

  it('carries taxonomy ids for follow filtering', () => {
    const parsed = parseDigestFreeze({
      en: [story({ locationId: 'loc-1', categoryId: 'cat-1' })],
    })
    expect(parsed.en?.[0].locationId).toBe('loc-1')
    expect(parsed.en?.[0].categoryId).toBe('cat-1')
  })

  it('treats missing locales and null as absent lists', () => {
    expect(parseDigestFreeze({})).toEqual({})
    expect(parseDigestFreeze({ en: null })).toEqual({})
    expect(parseDigestFreeze(null)).toEqual({})
    expect(parseDigestFreeze('nope')).toEqual({})
  })

  it('fails closed on a malformed row', () => {
    // An absolute path would double the site origin when the brief renders links.
    expect(parseDigestFreeze({ en: [story({ path: 'https://x.dev/a' })] })).toEqual({})
    expect(parseDigestFreeze({ en: [story({ title: '' })] })).toEqual({})
    expect(parseDigestFreeze({ en: 'not-an-array' })).toEqual({})
  })

  it('clamps oversized fields rather than rejecting the issue', () => {
    const parsed = parseDigestFreeze({ en: [story({ title: 'a'.repeat(500) })] })
    expect(parsed.en?.[0].title).toHaveLength(240)
  })
})

describe('hasFrozenStories', () => {
  it('is true when either locale has at least one story', () => {
    expect(hasFrozenStories({ en: [story()], fr: [] })).toBe(true)
    expect(hasFrozenStories({ en: [], fr: [story()] })).toBe(true)
    expect(hasFrozenStories({ en: [], fr: [] })).toBe(false)
    expect(hasFrozenStories({})).toBe(false)
  })
})
