import { describe, expect, it } from 'vitest'
import { computeNextRun, isPlanDue, parseRunTime, scheduledForForRun, type PlanSchedule } from './plans'

const utc = (iso: string) => new Date(iso)

describe('parseRunTime', () => {
  it('accepts valid UTC wall-clock times', () => {
    expect(parseRunTime('06:00')).toEqual({ hour: 6, minute: 0 })
    expect(parseRunTime('23:59')).toEqual({ hour: 23, minute: 59 })
  })
  it('rejects malformed times', () => {
    expect(parseRunTime('24:00')).toBeNull()
    expect(parseRunTime('6:00')).toBeNull()
    expect(parseRunTime('06:60')).toBeNull()
    expect(parseRunTime('noon')).toBeNull()
  })
})

describe('computeNextRun â€” daily', () => {
  const daily: PlanSchedule = { horizon: 'daily', dayOfWeek: null, runTime: '17:00' }
  it('stays today when the slot has not passed', () => {
    const next = computeNextRun(daily, utc('2026-09-25T09:00:00Z'))
    expect(next?.toISOString()).toBe('2026-09-25T17:00:00.000Z')
  })
  it('rolls to tomorrow once passed', () => {
    const next = computeNextRun(daily, utc('2026-09-25T17:00:00Z'))
    expect(next?.toISOString()).toBe('2026-09-26T17:00:00.000Z')
  })
  it('is strictly after `from` (exactly at the slot counts as passed)', () => {
    const next = computeNextRun(daily, utc('2026-09-25T16:59:59.999Z'))
    expect(next?.toISOString()).toBe('2026-09-25T17:00:00.000Z')
  })
  it('rejects a malformed time', () => {
    expect(computeNextRun({ ...daily, runTime: '99:99' }, utc('2026-09-25T09:00:00Z'))).toBeNull()
  })
})

describe('computeNextRun â€” weekly', () => {
  const monday: PlanSchedule = { horizon: 'weekly', dayOfWeek: 1, runTime: '07:00' }
  it('finds the next Monday when mid-week and time is upcoming', () => {
    // 2026-09-25 is a Friday.
    const next = computeNextRun(monday, utc('2026-09-25T04:00:00Z'))
    expect(next?.getUTCDay()).toBe(1)
    expect(next?.toISOString()).toBe('2026-09-28T07:00:00.000Z')
  })
  it('skips to next week when this Monday already passed', () => {
    // 2026-09-28 is a Monday, 08:00 â€” after the 07:00 slot.
    const next = computeNextRun(monday, utc('2026-09-28T08:00:00Z'))
    expect(next?.toISOString()).toBe('2026-10-05T07:00:00.000Z')
  })
  it('requires dayOfWeek', () => {
    expect(computeNextRun({ horizon: 'weekly', dayOfWeek: null, runTime: '07:00' }, utc('2026-09-25T04:00:00Z'))).toBeNull()
  })
  it('wraps the weekend correctly', () => {
    // Sunday runTime, from a Tuesday â†’ 5 days to Sunday.
    const sunday: PlanSchedule = { horizon: 'weekly', dayOfWeek: 0, runTime: '09:00' }
    const next = computeNextRun(sunday, utc('2026-09-22T00:00:00Z')) // Tue
    expect(next?.getUTCDay()).toBe(0)
    expect(next?.toISOString()).toBe('2026-09-27T09:00:00.000Z')
  })
})

describe('isPlanDue', () => {
  it('treats a missing next_run_at as due', () => {
    expect(isPlanDue({ nextRunAt: null }, utc('2026-09-25T00:00:00Z'))).toBe(true)
  })
  it('is due at or after the scheduled instant', () => {
    expect(isPlanDue({ nextRunAt: '2026-09-25T07:00:00Z' }, utc('2026-09-25T07:00:00Z'))).toBe(true)
    expect(isPlanDue({ nextRunAt: '2026-09-25T07:00:00Z' }, utc('2026-09-25T06:59:00Z'))).toBe(false)
  })
})

describe('scheduledForForRun', () => {
  it('offsets the run slot by the lead minutes', () => {
    const runAt = utc('2026-09-28T07:00:00Z')
    const target = scheduledForForRun({ horizon: 'weekly', dayOfWeek: 1, runTime: '07:00' }, runAt, 60)
    expect(target.toISOString()).toBe('2026-09-28T08:00:00.000Z')
  })
})
