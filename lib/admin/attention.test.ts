import { describe, expect, it } from "vitest";

import {
  attentionCount,
  attentionTone,
  buildAttentionTopics,
  schedulerTone,
  sortAttentionTopics,
  type AttentionCopy,
  type AttentionTopic,
} from "./attention";
import type { OperationalAlert } from "./queries/dashboard";

/**
 * The AppShell attention model (spec §34.1).
 *
 * Pure functions, so the rules that make the badge trustworthy are testable
 * without a DOM. The rule that matters most is the de-duplication: the badge
 * shows one number, and if pending submissions and the SLA alert both rendered,
 * the same rows would be counted twice and the total would be a lie.
 */

const copy: AttentionCopy = {
  alertLabel: (alert) => `${alert.id}:${alert.count}`,
  workLabel: {
    submissions: "Submissions",
    approvals: "Approvals",
    mail: "Mail",
    "overdue-scheduled": "Overdue",
  },
  workHref: {
    submissions: "/admin/moderation",
    approvals: "/admin/approvals",
    mail: "/admin/inbox",
    "overdue-scheduled": "/admin/content?status=scheduled",
  },
}

const alert = (over: Partial<OperationalAlert>): OperationalAlert => ({
  id: "sla",
  severity: "warning",
  count: 4,
  oldestHours: 51,
  href: "/admin/moderation?status=pending",
  ...over,
})

const input = (over: Partial<Parameters<typeof buildAttentionTopics>[0]> = {}) => ({
  alerts: [] as OperationalAlert[],
  pendingSubmissions: 0,
  unreadNotifications: 0,
  actionableApprovals: 0,
  overdueScheduled: 0,
  ...over,
})

describe("buildAttentionTopics", () => {
  it("is empty when nothing waits", () => {
    expect(buildAttentionTopics(input(), copy)).toEqual([])
  })

  it("counts an open incident as one item even though its count is 0", () => {
    const topics = buildAttentionTopics(
      input({ alerts: [alert({ id: "incident", count: 0, severity: "critical", href: "/admin/incidents/1" })] }),
      copy,
    )
    expect(topics).toHaveLength(1)
    expect(topics[0].count).toBe(1)
    expect(topics[0].tone).toBe("urgent")
  })

  it("suppresses the submissions queue while the SLA alert reports the same rows", () => {
    const topics = buildAttentionTopics(
      input({ alerts: [alert({ id: "sla", count: 2 })], pendingSubmissions: 9 }),
      copy,
    )
    expect(topics.map((t) => t.id)).toEqual(["sla"])
  })

  it("keeps the submissions queue when no SLA alert is firing", () => {
    const topics = buildAttentionTopics(input({ pendingSubmissions: 9 }), copy)
    expect(topics.map((t) => t.id)).toEqual(["submissions"])
    expect(topics[0].href).toBe("/admin/moderation")
  })

  it("drops zero counts instead of rendering a row of zeros", () => {
    const topics = buildAttentionTopics(
      input({ pendingSubmissions: 3, unreadNotifications: 0, actionableApprovals: 0 }),
      copy,
    )
    expect(topics.map((t) => t.id)).toEqual(["submissions"])
  })

  it("orders urgent before notice, then by count", () => {
    const topics = buildAttentionTopics(
      input({
        alerts: [alert({ id: "incident", severity: "critical", count: 1 })],
        pendingSubmissions: 50,
        unreadNotifications: 2,
      }),
      copy,
    )
    expect(topics.map((t) => t.id)).toEqual(["incident", "submissions", "mail"])
  })

  it("carries the age only on facts that are age-based", () => {
    const topics = buildAttentionTopics(
      input({ alerts: [alert({ id: "open-reports", oldestHours: 30 })], unreadNotifications: 1 }),
      copy,
    )
    const reports = topics.find((t) => t.id === "open-reports")
    const mail = topics.find((t) => t.id === "mail")
    expect(reports?.oldestHours).toBe(30)
    expect(mail?.oldestHours).toBeNull()
  })
})

describe("badge aggregation", () => {
  const topic = (over: Partial<AttentionTopic>): AttentionTopic => ({
    id: "x",
    label: "X",
    href: "/admin/x",
    count: 1,
    tone: "notice",
    group: "work",
    oldestHours: null,
    severity: null,
    ...over,
  })

  it("turns red only when something is urgent", () => {
    expect(attentionTone([topic({})])).toBe("notice")
    expect(attentionTone([topic({ tone: "urgent" })])).toBe("urgent")
    expect(attentionTone([])).toBe("calm")
  })

  it("sums counts so the badge number matches the list", () => {
    expect(attentionCount([topic({ count: 3 }), topic({ count: 4 })])).toBe(7)
    expect(attentionCount([])).toBe(0)
  })

  it("sorts without mutating the caller's array", () => {
    const list = [topic({ tone: "notice" }), topic({ tone: "urgent" })]
    const sorted = sortAttentionTopics(list)
    expect(sorted[0].tone).toBe("urgent")
    expect(list[0].tone).toBe("notice")
  })
})

describe("schedulerTone", () => {
  it("escalates a failing job above a merely stale one", () => {
    expect(schedulerTone([])).toBe("calm")
    expect(schedulerTone([{ job: "notify", status: "stale", silenceHours: 5, graceHours: 1, href: "/admin/notifications" }])).toBe(
      "notice",
    )
    expect(schedulerTone([{ job: "notify", status: "failing", silenceHours: 1, graceHours: 1, href: "/admin/notifications" }])).toBe(
      "urgent",
    )
  })
})
