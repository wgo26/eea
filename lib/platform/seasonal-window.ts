/**
 * Recurring month/day windows (spec §22/§28).
 *
 * A seasonal window is stored as month+day, never as dates: the platform's
 * states recur annually, so a schedule row that hardcoded a year would silently
 * stop matching after twelve months. Month/day membership also makes a window
 * that wraps the new year (Dec 20 – Jan 10) fall out of the same comparison.
 *
 * Pure and dependency-free — the Back to School plugin
 * (`lib/platform/back-to-school.ts`) and the `state-schedules` cron share it.
 */

export type SeasonalWindow = {
  startMonth: number
  startDay: number
  endMonth: number
  endDay: number
}

function monthDay(date: Date): number {
  return (date.getUTCMonth() + 1) * 100 + date.getUTCDate()
}

function bound(month: number, day: number): number {
  return month * 100 + day
}

/** Inclusive on both ends; a wrap-around window matches on either side of the year boundary. */
export function isWithinWindow(date: Date, window: SeasonalWindow): boolean {
  const value = monthDay(date)
  const start = bound(window.startMonth, window.startDay)
  const end = bound(window.endMonth, window.endDay)
  if (start <= end) return value >= start && value <= end
  return value >= start || value <= end
}

/** Concrete instants for one year — the window's start, and its last second. */
export function getWindowInstants(
  year: number,
  window: SeasonalWindow,
): { startsAt: string; endsAt: string } {
  const at = (month: number, day: number, endOfDay: boolean) =>
    new Date(
      Date.UTC(year, month - 1, day, endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0),
    ).toISOString()
  return {
    startsAt: at(window.startMonth, window.startDay, false),
    endsAt: at(window.endMonth, window.endDay, true),
  }
}
