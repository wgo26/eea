import type { HeartbeatHealth } from '@/lib/automation/heartbeat'
import type { AlertSeverity, OperationalAlert } from '@/lib/admin/queries/dashboard'

/**
 * The AppShell's attention vocabulary — the shape of a topic plus the render
 * math over a list of them.
 *
 * Split deliberately from ./queries/shell.ts and ./shell-visibility.ts, which
 * are `server-only`: the server owns the capability set, so it decides WHICH
 * topics exist; this module owns what a resolved topic means on screen. The
 * client never receives a capability list and never decides visibility — it
 * renders what it is handed and resolves labels from the dictionary it already
 * loads.
 *
 * Why the model exists at all: "attention" used to be two numbers wired straight
 * into a bell (pending submissions + unread mail). A moderator with an empty
 * queue and three open reports saw a silent, content-free badge; a chief whose
 * nightly backup had died a week ago saw nothing. Both facts were already in the
 * data layer — nothing in the shell read them.
 */

/** Badge meaning. Red is reserved for `urgent`, matching the sidebar's one-red rule. */
export type AttentionTone = 'calm' | 'notice' | 'urgent'

/** Operational problems (an incident, a dead cron) vs. a person's own work queue. */
export type AttentionGroup = 'alerts' | 'work'

/**
 * Operational alerts keep their severity; a work queue is only ever `notice`.
 */
export function topicTone(severity: AlertSeverity | null): AttentionTone {
  return severity === 'critical' ? 'urgent' : 'notice'
}

/** One line in the attention popover, already filtered for the viewer. */
export type AttentionTopic = {
  /** Stable key — an AlertId or one of the work-queue ids below. */
  id: string
  /** Display text, resolved by the shell from the dictionary. */
  label: string
  /** Locale-free href; the topbar applies `localePath` at render time. */
  href: string
  count: number
  tone: AttentionTone
  group: AttentionGroup
  /** How long the oldest item has waited, when the fact is age-based. */
  oldestHours: number | null
  /** Severity beside operational alerts; null for the person's own queues. */
  severity: AlertSeverity | null
}

/** Scheduler health, resolved server-side, rendered as one compact row set. */
export type SchedulerIssue = {
  job: string
  status: HeartbeatHealth['status']
  /** Hours since the last successful run; null when it never reported. */
  silenceHours: number | null
  /** Tolerated silence for this job, from CRON_GRACE_HOURS. */
  graceHours: number
  href: string
}

const TONE_RANK: Record<AttentionTone, number> = { urgent: 0, notice: 1, calm: 2 }

/**
 * Most urgent first, then by how much is waiting. Sorting here — rather than at
 * each call site — is what keeps the popover order, the aria summary and the
 * badge agreeing with one another.
 */
export function sortAttentionTopics(topics: AttentionTopic[]): AttentionTopic[] {
  return [...topics].sort((a, b) => TONE_RANK[a.tone] - TONE_RANK[b.tone] || b.count - a.count)
}

/** Badge state: red only when something is urgent; amber while anything waits. */
export function attentionTone(topics: AttentionTopic[]): AttentionTone {
  if (topics.some((topic) => topic.tone === 'urgent')) return 'urgent'
  return topics.length > 0 ? 'notice' : 'calm'
}

export function attentionCount(topics: AttentionTopic[]): number {
  return topics.reduce((total, topic) => total + topic.count, 0)
}

/** A failing job outranks a silent one; silence outranks nothing. */
export function schedulerTone(issues: SchedulerIssue[]): AttentionTone {
  if (issues.some((issue) => issue.status === 'failing')) return 'urgent'
  return issues.length > 0 ? 'notice' : 'calm'
}

/* ------------------------------------------------------------------ */
/* Building the list from resolved facts                               */
/* ------------------------------------------------------------------ */

/** The work-queue ids — everything that is not a derived operational alert. */
export type AttentionWorkId = 'submissions' | 'approvals' | 'mail' | 'overdue-scheduled'

/** Counts the shell already has; `alerts` arrive pre-filtered for the viewer. */
export type AttentionInput = {
  alerts: OperationalAlert[]
  pendingSubmissions: number
  unreadNotifications: number
  actionableApprovals: number
  overdueScheduled: number
}

/** Localized strings, injected so this module stays free of the dictionary. */
export type AttentionCopy = {
  alertLabel: (alert: OperationalAlert) => string
  workLabel: Record<AttentionWorkId, string>
  workHref: Record<AttentionWorkId, string>
}

/**
 * The viewer's attention list, most urgent first.
 *
 * Lives here rather than in the topbar so the ordering rules are testable
 * without rendering. The one rule worth stating: pending submissions is dropped
 * while the SLA alert is firing. Both describe the same rows, and showing one
 * problem twice at two urgencies would make the badge lie about its total.
 */
export function buildAttentionTopics(
  input: AttentionInput,
  copy: AttentionCopy,
): AttentionTopic[] {
  const topics: AttentionTopic[] = input.alerts.map((alert) => ({
    id: alert.id,
    label: copy.alertLabel(alert),
    href: alert.href,
    // An incident is one row by definition and its count is 0 there.
    count: alert.count > 0 ? alert.count : 1,
    tone: topicTone(alert.severity),
    group: 'alerts',
    oldestHours: alert.oldestHours,
    severity: alert.severity,
  }))

  const slaFiring = input.alerts.some((alert) => alert.id === 'sla')
  const work: { id: AttentionWorkId; count: number }[] = [
    { id: 'submissions', count: input.pendingSubmissions },
    { id: 'approvals', count: input.actionableApprovals },
    { id: 'mail', count: input.unreadNotifications },
    { id: 'overdue-scheduled', count: input.overdueScheduled },
  ]

  for (const line of work) {
    if (line.count <= 0) continue
    if (line.id === 'submissions' && slaFiring) continue
    topics.push({
      id: line.id,
      label: copy.workLabel[line.id],
      href: copy.workHref[line.id],
      count: line.count,
      tone: 'notice',
      group: 'work',
      oldestHours: null,
      severity: null,
    })
  }

  return sortAttentionTopics(topics)
}

