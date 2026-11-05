import { describe, expect, it } from 'vitest'
import {
  metricHasData,
  rankRows,
  shareRatePer100,
  unionRows,
  type LeaderboardRow,
} from './content-ranking'

/**
 * The leaderboard's whole job is making "ranked by views" and "ranked by
 * shares" visibly different lists. These rules are pure on purpose: a silent
 * tie-break regression is what made the two admin tables look identical.
 */

const row = (over: Partial<LeaderboardRow>): LeaderboardRow => ({
  id: 'id-1',
  title: 'Untitled',
  type: 'news',
  slug: null,
  views: 0,
  shares: 0,
  viewsPublic: false,
  sharesPublic: false,
  ...over,
})

describe('shareRatePer100', () => {
  it('reports shares per 100 views rounded to one decimal', () => {
    expect(shareRatePer100(200, 5)).toBe(2.5)
    expect(shareRatePer100(100, 4)).toBe(4)
  })

  it('is null with no views, and a flat zero when views exist but shares do not', () => {
    expect(shareRatePer100(0, 3)).toBeNull()
    expect(shareRatePer100(0, 0)).toBeNull()
    expect(shareRatePer100(50, 0)).toBe(0)
  })
})

describe('unionRows', () => {
  const a = row({ id: 'a', views: 10, shares: 1 })
  const b = row({ id: 'b', views: 5, shares: 4 })

  it('keeps one copy of an item that lands in both groups', () => {
    expect(unionRows([[a, b], [b]])).toEqual([a, b])
  })

  it('flattens empty groups without inventing rows', () => {
    expect(unionRows([[], [], []])).toEqual([])
  })
})

describe('rankRows', () => {
  const rows = [
    row({ id: 'views-wins', title: 'Zebra', views: 900, shares: 1 }),
    row({ id: 'shares-wins', title: 'Aardvark', views: 12, shares: 40 }),
    row({ id: 'middle', title: 'Mango', views: 400, shares: 9 }),
  ]

  it('puts views first on the views metric and shares first on shares', () => {
    expect(rankRows(rows, 'views').map((r) => r.id)).toEqual([
      'views-wins',
      'middle',
      'shares-wins',
    ])
    expect(rankRows(rows, 'shares').map((r) => r.id)).toEqual([
      'shares-wins',
      'middle',
      'views-wins',
    ])
  })

  it('never mutates the input array', () => {
    const copy = [...rows]
    rankRows(rows, 'shares')
    expect(rows).toEqual(copy)
  })

  it('breaks a tie on the other metric, then on the title', () => {
    const tied = [
      row({ id: 'low', title: 'B', views: 10, shares: 2 }),
      row({ id: 'high', title: 'A', views: 10, shares: 2 }),
      row({ id: 'mid', title: 'C', views: 10, shares: 5 }),
    ]
    expect(rankRows(tied, 'views').map((r) => r.id)).toEqual(['mid', 'high', 'low'])
    expect(rankRows(tied, 'shares').map((r) => r.id)).toEqual(['mid', 'high', 'low'])
  })

  it('resolves identical rows alphabetically so the order stays stable', () => {
    const identical = [
      row({ id: '2', title: 'Same', views: 5, shares: 1 }),
      row({ id: '1', title: 'Same', views: 5, shares: 1 }),
    ]
    expect(rankRows(identical, 'views').map((r) => r.id)).toEqual(['1', '2'])
  })
})

describe('metricHasData', () => {
  it('is false only when the whole board has zero on that metric', () => {
    const rows = [row({ views: 0, shares: 0 }), row({ views: 3, shares: 0 })]
    expect(metricHasData(rows, 'views')).toBe(true)
    expect(metricHasData(rows, 'shares')).toBe(false)
    expect(metricHasData([], 'views')).toBe(false)
  })
})