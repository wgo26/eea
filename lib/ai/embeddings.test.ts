import { describe, expect, it } from 'vitest'
import { cosine, embeddingText } from './embeddings'
import { offlineBullets, type MorningStats } from './briefing'

describe('cosine', () => {
  it('scores identical vectors 1 and orthogonal 0', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1)
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0)
  })
  it('returns 0 on mismatched or empty input', () => {
    expect(cosine([], [])).toBe(0)
    expect(cosine([1, 2], [1])).toBe(0)
  })
})

describe('embeddingText', () => {
  it('strips markup and caps length', () => {
    const t = embeddingText({ title: 'Fire', excerpt: '', body: '<p>Hello  world</p>' })
    expect(t).toContain('Fire')
    expect(t).not.toContain('<p>')
    expect(t.length).toBeLessThanOrEqual(8000)
  })
})

describe('offlineBullets', () => {
  const stats: MorningStats = {
    pendingModeration: 4,
    scheduledDue: 0,
    idleDrafts: 2,
    expiring14d: 0,
    translationQueue: 3,
    seoGaps: -1,
    mediaGaps: 1,
    published7d: 9,
  }
  it('always returns exactly 5 verb-led bullets', () => {
    const b = offlineBullets(stats)
    expect(b).toHaveLength(5)
    expect(b[0]).toContain('4')
  })
  it('celebrates a clear queue instead of inventing work', () => {
    const b = offlineBullets({ ...stats, pendingModeration: 0 })
    expect(b[0]).toContain('clear')
  })
})
