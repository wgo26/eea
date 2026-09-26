import { describe, expect, it } from "vitest";

import {
  alertLabel,
  ALERT_SEVERITY_TONE,
  type AlertCopy,
} from "./labels";
import type { OperationalAlert } from "./queries/dashboard";

/**
 * The alert copy the AppShell and the dashboard widget share (spec §34.1).
 *
 * Two surfaces render the same alerts, so the labelling lives in one function.
 * These tests pin the two failure modes that matter: an alert rendering with its
 * count lost, and a new alert id rendering as blank text.
 */

const copy: AlertCopy = {
  alertIncident: "An incident is open",
  alertSla: "{count} submission(s) waiting past the 48h review target",
  alertFailedJobs: "{count} failed storage job(s) in the last 24h",
  alertFailedDeliveries: "{count} failed delivery(ies)",
  alertOpenReports: "{count} open report(s)",
  alertOldest: "oldest {hours}h",
}

const alert = (over: Partial<OperationalAlert>): OperationalAlert => ({
  id: "sla",
  severity: "warning",
  count: 3,
  oldestHours: 51,
  href: "/admin/moderation?status=pending",
  ...over,
})

describe("alertLabel", () => {
  it("interpolates the count into every templated alert", () => {
    expect(alertLabel(alert({ count: 7 }), copy)).toContain("7")
    expect(alertLabel(alert({ id: "failed-jobs", count: 12 }), copy)).toContain("12")
    expect(alertLabel(alert({ id: "failed-deliveries", count: 2 }), copy)).toContain("2")
    expect(alertLabel(alert({ id: "open-reports", count: 4 }), copy)).toContain("4")
  })

  it("leaves no unresolved placeholder behind", () => {
    for (const id of ["sla", "failed-jobs", "failed-deliveries", "open-reports"] as const) {
      expect(alertLabel(alert({ id }), copy)).not.toMatch(/\{[a-z]+\}/)
    }
  })

  it("renders the incident without a count, since one incident is one incident", () => {
    expect(alertLabel(alert({ id: "incident", count: 0 }), copy)).toBe(copy.alertIncident)
  })

  it("surfaces an unmapped alert id instead of rendering blank", () => {
    // A new AlertId must be visible-and-wrong rather than invisible-and-correct-
    // looking: blank text in the attention popover reads as "nothing to see".
    const future = alert({ id: "quota-exhausted" as OperationalAlert["id"] })
    expect(alertLabel(future, copy)).toBe("quota-exhausted")
  })
})

describe("ALERT_SEVERITY_TONE", () => {
  it("gives every severity a tone, including the text colour for contrast", () => {
    for (const severity of ["critical", "warning", "info"] as const) {
      expect(ALERT_SEVERITY_TONE[severity]).toMatch(/text-/)
    }
  })
})
