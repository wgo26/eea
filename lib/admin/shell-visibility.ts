import 'server-only'

import { CRON_GRACE_HOURS, type HeartbeatHealth } from '@/lib/automation/heartbeat'
import { navCapabilitiesForPath } from './nav-integrity'
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

/**
 * The screen that owns each job, so a row is actionable rather than alarming.
 * `state-watchdog` and `audit-archive` deliberately have no entry: their failure
 * is best read on the generic automations screen (the fallback), which is the
 * destination every staff member with content rights can already open.
 */
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

const JOB_FALLBACK_HREF = '/admin/automations'

/**
 * True when this viewer can reach `path` through the nav. A path no section owns
 * passes: absence from the nav is not a denial, and the page's own guard still
 * runs — failing closed here would hide rows behind a map entry nobody
 * maintained, which is the opposite of the point.
 */
export function viewerOpensPath(capabilities: Set<Capability>, path: string): boolean {
  const needs = navCapabilitiesForPath(path)
  if (!needs) return true
  return needs.some((capability) => capabilities.has(capability))
}

/** Hours since a job last reported successfully; null when it never has. */
function silenceHours(row: HeartbeatHealth): number | null {
  if (!row.lastSuccess) return null
  const then = Date.parse(row.lastSuccess)
  if (Number.isNaN(then)) return null
  return Math.max(0, Math.floor((Date.now() - then) / 3_600_000))
}

/**
 * Scheduler rows worth surfacing: anything not `ok`, minus the rows whose
 * DESTINATION this viewer cannot open.
 *
 * This is the check docs/system/storage.md and credentials.md send an operator to
 * `/api/ready` to perform ("if it says Never while assets exist, the nightly job
 * is not running — check `CRON_SECRET`"). Hoisting it into the shell makes a dead
 * scheduler visible from whatever page you are already on, to the people who have
 * a screen to act on it.
 *
 * Visibility is derived from the nav pairing in ./nav-integrity rather than from
 * a list of job names, and the difference is not cosmetic: the name list asserted
 * who may see `storage-backup`, when what matters is whether the operator can
 * open `/admin/storage-backup` — which the nav already decides, and decides for
 * every other surface too.
 *
 * Exactly one row was misjudged under the old rule, and it was the interesting
 * one: `state-schedules` points at `/admin/states`, the supreme-tier ladder, but
 * was left out of the chief-only list, so every non-chief got a row that bounced
 * them to not-authorized. Deriving from the nav also narrows a few rows that were
 * previously shown to everyone — `notify` now requires `manageNotifications`,
 * `publish-plans`/`reminders`/the digests `manageContent` — which is the same
 * rule `canViewerOpenAlert()` already applies to the `failed-deliveries` alert,
 * so the bell and the scheduler rows can no longer disagree about one audience.
 *
 * A job retargeted to another screen now inherits the right audience with no edit
 * here at all; under the name list it silently kept its old one.
 */
export function schedulerIssuesForViewer(
  rows: HeartbeatHealth[],
  capabilities: Set<Capability>,
): SchedulerIssue[] {
  return rows
    .filter((row) => row.status !== 'ok')
    .map((row) => ({
      job: row.job,
      status: row.status,
      silenceHours: silenceHours(row),
      graceHours: CRON_GRACE_HOURS[row.job] ?? 36,
      href: JOB_HREF[row.job] ?? JOB_FALLBACK_HREF,
    }))
    .filter((issue) => viewerOpensPath(capabilities, issue.href))
    // A failing job is a worse signal than a silent one.
    .sort((a, b) => Number(b.status === 'failing') - Number(a.status === 'failing'))
}
