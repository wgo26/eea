/**
 * Publish-plan scheduling math (Stream C, C2) — pure half; the runner is
 * ./publish-plans-run.ts.
 *
 * A plan is (horizon daily|weekly, UTC HH:MM, optional day_of_week). The cron
 * wakes every 30 minutes and asks: is this plan due (next_run_at reached)?
 * After running, computeNextRun advances to the next slot strictly after
 * `from`, so overlapping or retried runs can never fire the same slot twice.
 *
 * No I/O — lib/automation/plans.test.ts pins it.
 */

export type PlanSchedule = {
  horizon: 'daily' | 'weekly'
  /** 0 = Sunday … 6 = Saturday. Required for weekly plans. */
  dayOfWeek: number | null
  /** UTC wall-clock "HH:MM". */
  runTime: string
}

const TIME_RE = /^([01][0-9]|2[0-3]):([0-5][0-9])$/

export function parseRunTime(value: string): { hour: number; minute: number } | null {
  const m = TIME_RE.exec(value)
  if (!m) return null
  return { hour: Number(m[1]), minute: Number(m[2]) }
}

/**
 * Next UTC instant strictly after `from` matching the plan. Daily plans land
 * on the same day (if the time has not passed) or tomorrow; weekly plans on
 * the matching weekday, next week when this week's slot has passed. Returns
 * null for a malformed schedule — callers must not guess.
 */
export function computeNextRun(plan: PlanSchedule, from: Date): Date | null {
  const time = parseRunTime(plan.runTime)
  if (!time) return null
  if (plan.horizon === 'weekly' && (plan.dayOfWeek === null || plan.dayOfWeek < 0 || plan.dayOfWeek > 6)) return null

  const dayMs = 24 * 3_600_000
  const candidateBase = new Date(from.getTime() + 1000) // strictly after `from`
  let day = new Date(Date.UTC(candidateBase.getUTCFullYear(), candidateBase.getUTCMonth(), candidateBase.getUTCDate()))

  if (plan.horizon === 'weekly') {
    const target = plan.dayOfWeek as number
    let diff = (target - day.getUTCDay() + 7) % 7
    // If today matches but the time already passed, go to next week.
    const todayAt = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), time.hour, time.minute)
    if (diff === 0 && todayAt <= from.getTime()) diff = 7
    day = new Date(day.getTime() + diff * dayMs)
  }

  const at = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), time.hour, time.minute)
  if (plan.horizon === 'daily' && at <= from.getTime()) {
    return new Date(at + dayMs)
  }
  return new Date(at)
}

/** Whether a plan row is due at `now` (missing next_run_at is treated as due once). */
export function isPlanDue(plan: { nextRunAt: string | null }, now: Date): boolean {
  if (!plan.nextRunAt) return true
  const at = Date.parse(plan.nextRunAt)
  return Number.isNaN(at) ? true : at <= now.getTime()
}

/**
 * The publish target for an auto-schedule run: run_time + lead_minutes, so
 * the item goes live a little after its recap draft exists and the digest
 * can pick it up. Computed off the SAME date as the compile (from the slot,
 * not wall-clock now) to stay deterministic across retried runs.
 */
export function scheduledForForRun(plan: PlanSchedule, runAt: Date, leadMinutes: number): Date {
  const time = parseRunTime(plan.runTime)
  const base = time
    ? new Date(Date.UTC(runAt.getUTCFullYear(), runAt.getUTCMonth(), runAt.getUTCDate(), time.hour, time.minute))
    : runAt
  return new Date(base.getTime() + leadMinutes * 60_000)
}
