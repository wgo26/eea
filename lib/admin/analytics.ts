import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/observability/logger'

/**
 * W13 — aggregate-only insights queries (service-role reads).
 *
 * Privacy contract: `analytics_daily` stores counters keyed by
 * (UTC day, surface, locale, place) only — no PII, no per-user rows.
 * The table has RLS enabled with ZERO policies, so only the service
 * role (this module, the beacon route, the cron) can read it.
 *
 * The funnel joins two operational tables with plain timestamp ranges
 * (submissions.submitted_at / content_items.published_at) — counts
 * only, never row data.
 */

export type DayCount = { day: string; count: number }
export type BreakdownRow = { key: string; count: number }
export type FunnelCounts = {
  submitPageViews: number
  submissionsReceived: number
  published: number
}

export type Insights = {
  daily: DayCount[] // last 14 days, zero-filled
  views14d: number
  views7d: number
  viewsPrior7d: number
  /** percent change 7d vs prior 7d; null when prior7 = 0 */
  deltaPct: number | null
  bySurface: BreakdownRow[]
  byLocale: BreakdownRow[]
  byPlace: BreakdownRow[] // top 10, place-agnostic rows excluded
  funnel: FunnelCounts
}

const EMPTY: Insights = {
  daily: [],
  views14d: 0,
  views7d: 0,
  viewsPrior7d: 0,
  deltaPct: null,
  bySurface: [],
  byLocale: [],
  byPlace: [],
  funnel: { submitPageViews: 0, submissionsReceived: 0, published: 0 },
}

const DAY_MS = 86_400_000
const WINDOW_DAYS = 14

/** 'YYYY-MM-DD' for UTC (analytics_daily.day is a `date` column). */
function utcDay(offsetDays: number): string {
  return new Date(Date.now() - offsetDays * DAY_MS).toISOString().slice(0, 10)
}

function sum(rows: { count: number }[]): number {
  return rows.reduce((acc, r) => acc + r.count, 0)
}

function group(rows: { key: string; count: number }[], limit?: number): BreakdownRow[] {
  const totals = new Map<string, number>()
  for (const r of rows) totals.set(r.key, (totals.get(r.key) ?? 0) + r.count)
  const sorted = [...totals.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
  return limit ? sorted.slice(0, limit) : sorted
}

export async function getInsights(): Promise<Insights> {
  try {
    const since = utcDay(WINDOW_DAYS - 1) // inclusive → 14 UTC days incl. today
    const db = createAdminClient()

    const { data, error } = await db
      .from('analytics_daily')
      .select('day, surface, locale, place, count')
      .gte('day', since)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as {
      day: string
      surface: string
      locale: string
      place: string
      count: number
    }[]

    // Zero-fill the 14-day series so the chart has a stable x-axis.
    const byDay = new Map<string, number>()
    for (const r of rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.count)
    const daily: DayCount[] = []
    for (let offset = WINDOW_DAYS - 1; offset >= 0; offset--) {
      const day = utcDay(offset)
      daily.push({ day, count: byDay.get(day) ?? 0 })
    }

    const sevenAgo = utcDay(6) // last 7 days: [today-6 … today]
    const priorFrom = utcDay(13)
    const priorTo = utcDay(7)
    const views14d = sum(rows)
    const views7d = sum(rows.filter((r) => r.day >= sevenAgo))
    const viewsPrior7d = sum(
      rows.filter((r) => r.day >= priorFrom && r.day <= priorTo),
    )
    const deltaPct =
      viewsPrior7d > 0 ? Math.round(((views7d - viewsPrior7d) / viewsPrior7d) * 100) : null
