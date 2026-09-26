import { describe, expect, it } from 'vitest'
import { heroScore, rankForHero, type HeroRankedItem } from './hero-rank'

const NOW = Date.parse('2026-09-26T12:00:00.000Z')
const recent = (overrides: Partial<HeroRankedItem> = {}): HeroRankedItem => ({
  id: 'a',
  publishedAt: new Date(NOW - 86_400_000).toISOString(),
  ...overrides,
})

describe('heroScore', () => {
  it('rewards the earned featured flag', () => {
    expect(heroScore(recent({ isFeatured: true }), NOW)).toBeGreaterThan(
      heroScore(recent(), NOW),
    )
  })

  it('rewards engagement with diminishing returns', () => {
    const low = heroScore(recent({ viewCount: 100 }), NOW)
    const mid = heroScore(recent({ viewCount: 1_000 }), NOW)
    const huge = heroScore(recent({ viewCount: 500_000 }), NOW)
    expect(mid).toBeGreaterThan(low)
    expect(huge - mid).toBeLessThan(mid - low)
  })

  it('rewards verified and official sources, and a cover image', () => {
    const plain = heroScore(recent(), NOW)
    expect(heroScore(recent({ verification: 'verified' }), NOW)).toBe(plain + 20)
    expect(heroScore(recent({ verification: 'official_source' }), NOW)).toBe(plain + 30)
    expect(heroScore(recent({ imageUrl: 'x' }), NOW)).toBe(plain + 10)
  })

  it('decays freshness to zero after the window', () => {
    const fresh = heroScore(recent({ publishedAt: new Date(NOW).toISOString() }), NOW)
    const old = heroScore(
      recent({ publishedAt: new Date(NOW - 30 * 86_400_000).toISOString() }),
      NOW,
    )
    expect(fresh).toBe(40)
    expect(old).toBe(0)
  })

  it('survives missing counters and bad dates', () => {
    expect(heroScore({ id: 'x' }, NOW)).toBe(0)
    expect(heroScore({ id: 'x', publishedAt: 'nope' }, NOW)).toBe(0)
  })
})

describe('rankForHero', () => {
  it('puts the strongest story first and keeps ties stable by id', () => {
    const ranked = rankForHero(
      [
        recent({ id: 'plain' }),
        recent({ id: 'hot', viewCount: 4_000, imageUrl: 'x' }),
        recent({ id: 'curated-lead', isFeatured: true, verification: 'verified' }),
      ],
      NOW,
    )
    expect(ranked.map((i) => i.id)).toEqual(['curated-lead', 'hot', 'plain'])
  })
})
