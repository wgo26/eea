import 'server-only'

import { CRON_GRACE_HOURS, type HeartbeatHealth } from '@/lib/automation/heartbeat'
import type { OperationalAlert } from '@/lib/admin/queries/dashboard'
import type { SchedulerIssue } from '@/lib/admin/attention'
import type { Capability } from '@/lib/auth/capabilities'

/**
 * Shell visibility — the one place that decides what a SPECIFIC viewer may see.
 *
 * The seam is deliberate: `queries/shell.ts` reads facts (no locale, no
 * opinion), this module filters those facts by capability (it holds the set,
 * which is server-only), and the client topbar localizes and renders. That order
 * means no capability map ever crosses into the browser bundle, and a topic that
 * resolves to a route the viewer cannot reach is never produced at all.
 */

/** Capability each alert's target screen is guarded by, keyed by AlertId. */
const ALERT_CAPABILITIES: Record<string, Capability[]> = {
  incident: ['incidents.manage'],
  sla: ['moderate'],
  'failed-jobs': ['system.owner'],
  'failed-deliveries': ['manageNotifications'],
  'open-reports': ['moderate'],
}

/**
 * An alert is a link, and a link to a screen the viewer cannot open is a lie —
 * so one survives only if the capability guarding its target is held. Unknown
 * ids pass through: a new alert fails LOUD (visible) rather than quietly hiding
 * a fire behind an unmaintained map entry.
 */
export function canViewerOpenAlert(alert: OperationalAlert, capabilities: Set<Capability>): boolean {
  const needs = ALERT_CAPABILITIES[alert.id]
  return !needs || needs.some((capability) => capabilities.has(capability))
}

/** Jobs whose failure is chief-tier business, matching the nav's `system.owner` gate. */
const CHIEF_ONLY_JOBS = new Set(['storage-backup', 'db-dump', 'db-maintenance', 'credential-hygiene'])

/** The screen that owns each job, so a row is actionable rather than alarming. */
const JOB_HREF: Record<string, string> = {
  'storage-backup': '/admin/storage-backup',
  'db-dump': '/admin/storage-backup',
  'db-maintenance': '/admin/storage-backup',
  'credential-hygiene': '/admin/secrets',
  'state-schedules': '/admin/states',
  'publish-plans': '/admin/automations',
  'ops-digest': '/admin/digest',
  'weekly-digest': '/admin/digest',
  reminders: '/admin/automations',
  notify: '/admin/notifications',
}

/** Hours since a job last reported successfully; null when it never has. */
function silenceHours(row: HeartbeatHealth): number | null {
  if (!row.lastSuccess) return null
  const then = Date.parse(row.lastSuccess)
  if (Number.isNaN(then)) return null
  return Math.max(0, Math.floor((Date.now() - then) / 3_600_000))
}

/**
 * Scheduler rows worth surfacing: anything not `ok`, minus the storage/DB jobs
 * for viewers who cannot open the System tabs.
 *
 * This is the check docs/system/storage.md and credentials.md currently send an
 * operator to `/api/ready` to perform ("if it says Never while assets exist, the
 * nightly job is not running — check CRON_SECRET"). Hoisting it into the shell
 * makes a dead scheduler visible from whatever page you are already on, to the
 * people who have a screen to act on it.
 */
export function schedulerIssuesForViewer(
  rows: HeartbeatHealth[],
  capabilities: Set<Capability>,
): SchedulerIssue[] {
  const canSeeChief = capabilities.has('system.owner')
  return rows
    .filter((row) => row.status !== 'ok' && (canSeeChief || !CHIEF_ONLY_JOBS.has(row.job)))
    .map((row) => ({
      job: row.job,
      status: row.status,
      silenceHours: silenceHours(row),
      graceHours: CRON_GRACE_HOURS[row.job] ?? 36,
      href: JOB_HREF[row.job] ?? '/admin/automations',
    }))
    // A failing job is a worse signal than a silent one.
    .sort((a, b) => Number(b.status === 'failing') - Number(a.status === 'failing'))
}
