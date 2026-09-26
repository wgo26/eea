import { describe, expect, it } from "vitest";

import { canViewerOpenAlert, schedulerIssuesForViewer } from "./shell-visibility";
import { countActionableApprovals } from "@/lib/admin/queries/shell";
import { CRON_GRACE_HOURS, type HeartbeatHealth } from "@/lib/automation/heartbeat";
import type { OperationalAlert } from "@/lib/admin/queries/dashboard";
import type { Capability } from "@/lib/auth/capabilities";

/**
 * What the AppShell may show a given viewer (spec §17 / §34.1).
 *
 * The shell renders on every admin screen, so a visibility mistake is not
 * cosmetic: it is either a link that bounces the user to not-authorized, or a
 * leak of infrastructure detail to someone with no screen to act on it. These
 * are the invariants that keep the bell honest.
 */

const caps = (...list: Capability[]) => new Set(list)

const alert = (over: Partial<OperationalAlert>): OperationalAlert => ({
  id: "sla",
  severity: "warning",
  count: 1,
  oldestHours: null,
  href: "/admin/moderation",
  ...over,
})

describe("canViewerOpenAlert", () => {
  it("hides the incident alert from staff who cannot run the incident console", () => {
    const a = alert({ id: "incident", href: "/admin/incidents/1" })
    expect(canViewerOpenAlert(a, caps("moderate"))).toBe(false)
    expect(canViewerOpenAlert(a, caps("incidents.manage"))).toBe(true)
  })

  it("routes failed jobs to the chief tier only", () => {
    const a = alert({ id: "failed-jobs", href: "/admin/storage-backup" })
    // The storage tab is `system.owner`-gated in the nav, so an alert linking
    // there must agree with the nav or it points at a dead end.
    expect(canViewerOpenAlert(a, caps("manageStorage", "viewAuditLog"))).toBe(false)
    expect(canViewerOpenAlert(a, caps("system.owner"))).toBe(true)
  })

  it("keeps queue alerts with the moderators", () => {
    expect(canViewerOpenAlert(alert({ id: "sla" }), caps("moderate"))).toBe(true)
    expect(canViewerOpenAlert(alert({ id: "open-reports" }), caps("moderate"))).toBe(true)
    expect(canViewerOpenAlert(alert({ id: "open-reports" }), caps("viewDashboard"))).toBe(false)
  })

  it("shows delivery failures to whoever owns the notification centre", () => {
    const a = alert({ id: "failed-deliveries", href: "/admin/notifications" })
    expect(canViewerOpenAlert(a, caps("manageNotifications"))).toBe(true)
    expect(canViewerOpenAlert(a, caps("moderate"))).toBe(false)
  })

  it("shows an unmapped alert id rather than silently hiding a new fire", () => {
    // Failing loud is safer: a future AlertId added to the query layer without a
    // map entry must not become invisible in the shell.
    const future = alert({ id: "quota-exhausted" as OperationalAlert["id"] })
    expect(canViewerOpenAlert(future, new Set<Capability>())).toBe(true)
  })
})

const beat = (over: Partial<HeartbeatHealth>): HeartbeatHealth => ({
  job: "notify",
  status: "ok",
  lastSuccess: new Date().toISOString(),
  ...over,
})

describe("schedulerIssuesForViewer", () => {
  it("surfaces only jobs that are not healthy", () => {
    const rows = [beat({}), beat({ job: "reminders", status: "stale" })]
    expect(schedulerIssuesForViewer(rows, caps("viewDashboard")).map((i) => i.job)).toEqual([
      "reminders",
    ])
  })

  it("withholds storage and DB jobs from non-chief staff", () => {
    const rows = [
      beat({ job: "storage-backup", status: "failing" }),
      beat({ job: "db-dump", status: "stale" }),
      beat({ job: "notify", status: "failing" }),
    ]
    expect(schedulerIssuesForViewer(rows, caps("moderate")).map((i) => i.job)).toEqual(["notify"])
    const chief = schedulerIssuesForViewer(rows, caps("system.owner")).map((i) => i.job)
    expect(chief.sort()).toEqual(["db-dump", "notify", "storage-backup"])
  })

  it("escalates failing rows above merely stale ones", () => {
    const rows = [beat({ job: "notify", status: "stale" }), beat({ job: "reminders", status: "failing" })]
    expect(schedulerIssuesForViewer(rows, caps("viewDashboard")).map((i) => i.job)).toEqual([
      "reminders",
      "notify",
    ])
  })

  it("links each job to the screen that owns it", () => {
    const issues = schedulerIssuesForViewer(
      [beat({ job: "storage-backup", status: "stale" }), beat({ job: "credential-hygiene", status: "stale" })],
      caps("system.owner"),
    )
    expect(issues.find((i) => i.job === "storage-backup")?.href).toBe("/admin/storage-backup")
    expect(issues.find((i) => i.job === "credential-hygiene")?.href).toBe("/admin/secrets")
  })

  it("reports the grace window the runbooks tell operators to watch", () => {
    const issues = schedulerIssuesForViewer([beat({ job: "notify", status: "stale" })], caps("viewDashboard"))
    expect(issues[0].graceHours).toBe(CRON_GRACE_HOURS.notify)
  })

  it("measures silence from the last success, and null when a job never ran", () => {
    const twoDaysAgo = new Date(Date.now() - 48 * 3_600_000).toISOString()
    const issues = schedulerIssuesForViewer(
      [
        beat({ job: "notify", status: "stale", lastSuccess: twoDaysAgo }),
        beat({ job: "reminders", status: "unknown", lastSuccess: null }),
      ],
      caps("viewDashboard"),
    )
    expect(issues.find((i) => i.job === "notify")?.silenceHours).toBeGreaterThanOrEqual(47)
    expect(issues.find((i) => i.job === "reminders")?.silenceHours).toBeNull()
  })
})

describe("countActionableApprovals", () => {
  it("excludes the viewer's own requests — two-person control", () => {
    const rows = [{ action: "secret.revoke", actorId: "u1" }]
    expect(countActionableApprovals(rows, caps("secrets.revoke"), "u1")).toBe(0)
    expect(countActionableApprovals(rows, caps("secrets.revoke"), "u2")).toBe(1)
  })

  it("excludes actions whose capability the viewer does not hold", () => {
    const rows = [{ action: "incident.critical_mode", actorId: "u1" }]
    // Holding secrets.revoke does not make you an incident approver.
    expect(countActionableApprovals(rows, caps("secrets.revoke"), "u2")).toBe(0)
    expect(countActionableApprovals(rows, caps("incidents.manage"), "u2")).toBe(1)
  })

  it("ignores action keys outside the two-person registry", () => {
    const rows = [{ action: "not_a_gated_action", actorId: "u1" }]
    expect(countActionableApprovals(rows, caps("system.owner", "manageUsers"), "u2")).toBe(0)
  })

  it("counts only what this viewer can decide, never the whole queue", () => {
    const rows = [
      { action: "secret.revoke", actorId: "someone-else" },
      { action: "branding.publish", actorId: "someone-else" },
      { action: "auth.configure", actorId: "someone-else" },
    ]
    // A senior editor decides none of these; the capability map decides, not the
    // size of the queue — otherwise every admin is told the whole backlog is theirs.
    expect(countActionableApprovals(rows, caps("manageContent", "moderate"), "me")).toBe(0)
    expect(
      countActionableApprovals(rows, caps("secrets.revoke", "branding.publish", "system.configure"), "me"),
    ).toBe(3)
  })
})

