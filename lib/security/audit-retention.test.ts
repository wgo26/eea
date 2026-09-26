import { describe, expect, it } from "vitest";

import {
  AUDIT_RETENTION_DEFAULT_DAYS,
  AUDIT_RETENTION_MAX_DAYS,
  AUDIT_RETENTION_MIN_DAYS,
  getAuditRetentionDays,
} from "./audit-retention";

/**
 * Retention window parsing.
 *
 * The behaviour worth pinning is the clamp, because the three consumers of this
 * number disagree catastrophically if it is missing: the nightly sweeper would
 * delete `audit_events` older than a mistyped `AUDIT_RETENTION_DAYS=1`, and the
 * admin footer + audit screen would have cheerfully displayed "1 day" as if that
 * were the policy. The clamp makes the displayed number the enforced number.
 */

describe("getAuditRetentionDays", () => {
  it("falls back to the documented default when unset", () => {
    expect(getAuditRetentionDays(undefined)).toBe(AUDIT_RETENTION_DEFAULT_DAYS)
    expect(getAuditRetentionDays('')).toBe(AUDIT_RETENTION_DEFAULT_DAYS)
  })

  it("honours a valid setting verbatim", () => {
    expect(getAuditRetentionDays('90')).toBe(90)
    expect(getAuditRetentionDays('365')).toBe(365)
  })

  it("clamps a too-small window instead of honoring a mass purge", () => {
    expect(getAuditRetentionDays('1')).toBe(AUDIT_RETENTION_MIN_DAYS)
    expect(getAuditRetentionDays('0')).toBe(AUDIT_RETENTION_MIN_DAYS)
    expect(getAuditRetentionDays('-30')).toBe(AUDIT_RETENTION_MIN_DAYS)
  })

  it("clamps a too-large window to the documented ceiling", () => {
    expect(getAuditRetentionDays('99999')).toBe(AUDIT_RETENTION_MAX_DAYS)
  })

  it("rejects junk rather than producing NaN", () => {
    // A NaN here would reach `new Date(Date.now() - NaN)` in the sweeper and
    // silently delete nothing — the worst outcome for a retention job.
    expect(getAuditRetentionDays('forever')).toBe(AUDIT_RETENTION_DEFAULT_DAYS)
    expect(Number.isNaN(getAuditRetentionDays('abc'))).toBe(false)
  })

  it("floors a fractional setting", () => {
    expect(getAuditRetentionDays('45.7')).toBe(45)
  })

  it("reads the live environment when no argument is given", () => {
    const previous = process.env.AUDIT_RETENTION_DAYS
    try {
      process.env.AUDIT_RETENTION_DAYS = '120'
      expect(getAuditRetentionDays()).toBe(120)
    } finally {
      if (previous === undefined) delete process.env.AUDIT_RETENTION_DAYS
      else process.env.AUDIT_RETENTION_DAYS = previous
    }
  })

  it("keeps the documented 30–3650 band", () => {
    expect(AUDIT_RETENTION_MIN_DAYS).toBe(30)
    expect(AUDIT_RETENTION_MAX_DAYS).toBe(3650)
    expect(AUDIT_RETENTION_DEFAULT_DAYS).toBe(365)
  })
})
