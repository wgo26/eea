import 'server-only'

import { unstable_cache } from 'next/cache'

import { getPendingSubmissionCount } from './content-ops'
import { getUnreadNotificationTotal } from './notifications'
import { getApprovalsAdmin } from './approvals'
import { getOperationalAlerts, type OperationalAlert } from './dashboard'
import { CACHE_TAGS } from '@/lib/cache/tags'
import { db, safe } from './shared'
import { isTwoPersonAction, twoPersonActionCapability } from '../two-person-control'
import { canViewerOpenAlert, schedulerIssuesForViewer } from '../shell-visibility'
import { getCronHeartbeatHealth } from '@/lib/automation/heartbeat'
import type { SchedulerIssue } from '../attention'
import { effectiveCapabilities, type AdminRole } from '@/lib/auth/admin-roles'
import type { Capability } from '@/lib/auth/capabilities'
import type { AppRole } from '@/lib/auth/types'

/**
 * Admin AppShell read model (checklist item 11).
 *
 * The shell — identity chip, attention centre, quick actions — mixes facts that
 * are per-user (their capabilities, their unread mail) with facts that are
 * platform-wide and therefore SHARED (what is stuck, what is failing, how many
 * approvals are open). This module resolves both in one pass so the layout makes
 * a single round-trip rather than one query per widget.
 *
 * Cost discipline is the reason this file exists: the shell renders on every
 * admin screen, so a naive implementation taxes every page view. Here the
 * org-wide reads collapse into ONE round-trip of `count(head: true)` selects,
 * wrapped in `safe()` so each degrades to 0 rather than throwing — the shell
 * that reports an outage must keep rendering during one, which is the same
 * contract ./dashboard.ts documents.
 *
 * Nothing here gates anything. Authorization stays in lib/auth/guards.ts and
 * lib/admin/auth.ts; `capabilities` is computed so the shell KNOWS what it may
 * render, never so it can decide what is allowed.
 */

/* ------------------------------------------------------------------ */
/* Shared org-wide facts                                               */
/* ------------------------------------------------------------------ */

/**
 * Scheduler heartbeats, cached briefly and SHARED across every admin.
 *
 * This is the one org-wide shell read that is safe to cache, and the reason is
 * about who writes it: `cron_heartbeats` is stamped ONLY through
 * `stampHeartbeat`/`recordCronHeartbeat`, and every call site of those lives in
 * `app/api/cron/*`. That was checked rather than assumed, because the one
 * in-app manual trigger the admin area has — `runDuePlansNow()` in
 * lib/admin/actions/publish-plans.ts, which calls the same runner the cron does
 * — deliberately does NOT stamp, so no operator action writes this table at all.
 * A cached read therefore cannot contradict something the operator just did; it
 * is at most 45 seconds behind a job that finished during the window, against
 * grace windows measured in hours (CRON_GRACE_HOURS). No admin mutation needs to
 * bust it, which is exactly the property `getOperationalAlerts()` does NOT have.
 *
 * Why the alerts are NOT cached here: they are derived counts over queues an
 * operator clears by hand, and NOTHING in the mutation layer invalidates them.
 * That was checked, not assumed — lib/admin makes 25 `revalidateTag()` calls and
 * every single one names a PUBLIC content tag (`news`, `home`, `locations`,
 * `listings`, `site`, `brand`, ...); none touches an operational read. So there
 * is no tag to attach the alert cache to that anyone would ever bust, and the
 * only expiry available would be a TTL. A TTL on a live queue is the bug: clear
 * the last pending submission and the bell keeps shouting for the whole window,
 * which breaks the property ./dashboard.ts documents ("alerts are derived, never
 * stored... the list empties itself") and the refresh control in
 * admin-attention.tsx exists to protect. One indexed count query is a cheap
 * price for a badge that cannot lie; the heartbeats carry no such guarantee, so
 * only they are cached.
 *
 * The corollary, since it is a real constraint on future work: if the alert read
 * is ever cached, the mutation paths that change a queue (moderation, publish,
 * delivery retry, storage) must be taught to bust it, and `operations` is the tag
 * to bust. Until someone does that work, caching it is a correctness regression
 * dressed as a performance win.
 */
const HEARTBEAT_CACHE_SECONDS = 45

export const getCachedHeartbeatHealth = unstable_cache(
  async () => getCronHeartbeatHealth(),
  ['admin-shell-heartbeats'],
  { tags: [CACHE_TAGS.operations], revalidate: HEARTBEAT_CACHE_SECONDS },
)

export type OrgFacts = {
  /** Two-person requests still pending (a work queue, not a notification). */
  pendingApprovals: number
  /** Scheduled posts past their publish time that the plan job did not run.
   *  Same definition of "overdue" as getScheduledQueue() in ./publish-plans. */
  overdueScheduled: number
}

export const EMPTY_ORG_FACTS: OrgFacts = {
  pendingApprovals: 0,
  overdueScheduled: 0,
}

/**
 * The two org-wide counts `getOperationalAlerts()` does NOT already answer.
 *
 * Failed storage jobs, failed deliveries and open reports deliberately do not
 * live here: ./dashboard.ts computes all three *with a severity* and an age, so
 * re-counting them in the shell would cost a second query and render the same
 * problem twice in one list with two different urgency levels. Anything added
 * here must be something the alert feed cannot express.
 */
async function getOrgFacts(): Promise<OrgFacts> {
  const now = new Date().toISOString()
  const [approvals, overdue] = await Promise.all([
    safe(
      db()
        .from('two_person_approvals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .gte('expires_at', now),
    ),
    safe(
      db()
        .from('content_items')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'scheduled')
        .not('scheduled_for', 'is', null)
        .lte('scheduled_for', now),
    ),
  ])
  return {
    pendingApprovals: approvals.count ?? 0,
    overdueScheduled: overdue.count ?? 0,
  }
}

/* ------------------------------------------------------------------ */
/* Pure decision layer — unit-tested, no I/O                           */
/* ------------------------------------------------------------------ */

/**
 * Two-person requests THIS user may decide: pending, not their own request, and
 * carrying the action's capability. Mirrors the per-row rule the approvals
 * screen applies, so the shell never counts a request the viewer must not touch.
 * (A count of the whole queue would tell a moderator their approval is needed on
 * a state escalation only a chief can approve.)
 */
export function countActionableApprovals(
  rows: { action: string; actorId: string }[],
  capabilities: Set<Capability>,
  userId: string,
): number {
  return rows.filter(
    (row) =>
      row.actorId !== userId &&
      isTwoPersonAction(row.action) &&
      capabilities.has(twoPersonActionCapability(row.action)),
  ).length
}

/* ------------------------------------------------------------------ */
/* The resolved shell context                                          */
/* ------------------------------------------------------------------ */

export type ShellContext = {
  /** Legacy app_role ∪ fine-grained admin roles — what the shell may render. */
  capabilities: Set<Capability>
  /** Spec §17 roles as resolved by the caller (already aliased). */
  adminRoles: AdminRole[]
  pendingSubmissions: number
  unreadNotifications: number
  org: OrgFacts
  /** Two-person requests THIS viewer may decide — never the whole queue. */
  actionableApprovals: number
  /** Cron jobs not reporting `ok`, already narrowed to what the viewer may open. */
  schedulerIssues: SchedulerIssue[]
  /** Operational alerts the viewer can actually act on. */
  alerts: OperationalAlert[]
}

/**
 * Everything the AppShell renders, resolved once per request by the layout.
 *
 * `roles` and `adminRoles` arrive from the caller because the layout has already
 * read them for its own decisions — re-reading would double the per-user queries
 * for zero benefit. No client is needed: every read here is org-wide and goes
 * through the service-role `db()` helper like the rest of the data layer.
 *
 * The approvals read is conditional on something actually being pending, which
 * keeps the common case (a quiet platform) at a single round-trip.
 */
export async function getShellContext(options: {
  userId: string
  roles: AppRole[]
  adminRoles: AdminRole[]
}): Promise<ShellContext> {
  const { userId, roles, adminRoles } = options
  const capabilities = effectiveCapabilities(roles, adminRoles)

  const [pendingSubmissions, unreadNotifications, org, alerts, heartbeats] = await Promise.all([
    getPendingSubmissionCount(),
    getUnreadNotificationTotal(userId),
    getOrgFacts(),
    getOperationalAlerts(),
    // Cached: the only org-wide shell read that no operator action ever mutates.
    getCachedHeartbeatHealth(),
  ])

  let actionableApprovals = 0
  if (org.pendingApprovals > 0) {
    const { rows } = await getApprovalsAdmin({ status: 'pending' })
    actionableApprovals = countActionableApprovals(rows, capabilities, userId)
  }

  return {
    capabilities,
    adminRoles,
    pendingSubmissions,
    unreadNotifications,
    org,
    actionableApprovals,
    schedulerIssues: schedulerIssuesForViewer(heartbeats, capabilities),
    alerts: alerts.filter((alert) => canViewerOpenAlert(alert, capabilities)),
  }
}