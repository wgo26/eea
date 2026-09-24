/**
 * Dashboard insight helpers — the pure derivations behind the overview band
 * and the widget visualisations (plan "command centre UX" upgrade).
 *
 * Everything here is a plain function over data the dashboard has already
 * fetched: no queries, no React, no `server-only`, so the same code runs in
 * the server render, in unit tests, and (if ever needed) in a client island.
 * The SLA thresholds live here so the alert query (`queries/dashboard.ts`,
 * which re-exports them) and the SLA-toned UI can never drift apart.
 */

/** Submissions pending longer than this are past the editorial SLA. */
export const SLA_WARNING_HOURS = 48
/** …and longer than this are an escalation, not a reminder. */
export const SLA_CRITICAL_HOURS = 96

/** Visual tone for the oldest-pending SLA clock. */
export type SlaTone = 'ok' | 'warning' | 'critical'

/**
 * Age in whole hours of the oldest pending submission — `null` when there is
 * nothing pending (or the timestamp is unparseable). `now` is injectable for
 * tests; the default keeps component renders free of inline `Date` calls
 * (react-hooks/purity).
 */
export function oldestPendingHours(value: string | null, now: Date = new Date()): number | null {
  if (!value) return null
  const then = new Date(value).getTime()
  if (Number.isNaN(then)) return null
  return Math.max(0, Math.floor((now.getTime() - then) / 3_600_000))
}

/** How the SLA clock should read at a glance. `null` = no clock to show. */
export function slaTone(hours: number | null): SlaTone | null {
  if (hours == null) return null
  if (hours >= SLA_CRITICAL_HOURS) return 'critical'
  if (hours >= SLA_WARNING_HOURS) return 'warning'
  return 'ok'
}

export type TrendDelta = {
  /** Sum of the most recent window. */
  current: number
  /** Sum of the window before it. */
  previous: number
  /** Percent change previous → current; `null` when the previous window is 0. */
  deltaPct: number | null
  positive: boolean
}

/**
 * Compare the last `windowDays` of a zero-filled daily series against the
 * `windowDays` before them — the publishing widget's "vs previous 7 days"
 * chip. Series shorter than one window compare against "nothing before", so
 * the delta is `null` rather than a misleading +∞%.
 */
export function publishingTrend(
  days: readonly { date: string; count: number }[],
  windowDays = 7,
): TrendDelta {
  const window = Math.max(1, windowDays)
  const split = Math.max(0, days.length - window)
  const currentDays = days.slice(split)
  const previousDays = days.slice(Math.max(0, split - window), split)
  const sum = (slice: readonly { count: number }[]) => slice.reduce((total, day) => total + Math.max(0, day.count), 0)
  const current = sum(currentDays)
  const previous = sum(previousDays)
  const deltaPct = previous === 0 ? null : Math.round(((current - previous) / previous) * 100)
  return { current, previous, deltaPct, positive: current >= previous }
}

/**
 * One value's share of a total as a 0–100 number, clamped — the width driver
 * for every meter and stacked segment. Zero totals yield 0, never NaN.
 */
export function pctOf(value: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.max(0, (value / total) * 100))
}
