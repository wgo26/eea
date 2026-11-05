/**
 * Pure ranking behind the Insights content leaderboard.
 *
 * The board used to be two copies of one table fed with a different sort —
 * identical chrome, only the ordering moving — and a shares sort full of ties
 * silently collapsed back into the views order, so "shares" looked frozen.
 * Everything here is pure so the unit gate owns the tie-break rules, and so
 * the client component only has to pick a metric and render.
 *
 * Kept in `lib/` rather than beside the component because the vitest include
 * list only collects `lib/**`, `scripts/**` and `tests/**`.
 */

export type LeaderboardMetric = 'views' | 'shares'

/** Structural mirror of `TopContentRow` (lib/admin/analytics) minus its doc
 *  fields — no `server-only` module is imported into the client bundle. */
export type LeaderboardRow = {
  id: string
  title: string
  type: string
  slug: string | null
  views: number
  shares: number
  viewsPublic: boolean
  sharesPublic: boolean
}

/** Share taps per 100 views, or null when nothing has been seen yet. */
export function shareRatePer100(views: number, shares: number): number | null {
  if (views <= 0) return null
  if (shares <= 0) return 0
  return Math.round((shares / views) * 1000) / 10
}

/**
 * Flattens the by-views and by-shares groups into one deduped candidate set
 * (first occurrence wins). Both rankings then draw from the same pool, so
 * switching the metric reorders rows instead of swapping to a different list.
 */
export function unionRows(groups: LeaderboardRow[][]): LeaderboardRow[] {
  const seen = new Set<string>()
  const out: LeaderboardRow[] = []
  for (const group of groups) {
    for (const row of group) {
      if (seen.has(row.id)) continue
      seen.add(row.id)
      out.push(row)
    }
  }
  return out
}

/**
 * Rank by the active metric, then the other metric, then title, then id —
 * never by arrival order. The explicit secondary + title + id legs keep a
 * fully-tied ranking deterministic (same order on every render) instead of
 * silently falling back to arrival order.
 */
export function rankRows(
  rows: LeaderboardRow[],
  metric: LeaderboardMetric,
): LeaderboardRow[] {
  const secondary: LeaderboardMetric = metric === 'views' ? 'shares' : 'views'
  return [...rows].sort(
    (a, b) =>
      b[metric] - a[metric] ||
      b[secondary] - a[secondary] ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
  )
}

/** False when every row scores zero on the metric (all bars would be empty). */
export function metricHasData(
  rows: LeaderboardRow[],
  metric: LeaderboardMetric,
): boolean {
  return rows.some((row) => row[metric] > 0)
}