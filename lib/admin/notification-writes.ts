import 'server-only'

import {
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_TITLE_MAX,
  safeNotificationPath,
  type NotificationCategory,
} from '@/lib/admin/notification-centre'
import { logger } from '@/lib/observability/logger'
import { createAdminClient, type InsertOf } from '@/lib/supabase/admin'
import type { AppRole } from '@/lib/auth/types'

/**
 * Notification producers (plan Phase 4.5, spec §38).
 *
 * The centre's *writes* live here rather than in a 'use server' module: plan
 * Phase 4.5 calls `createAdminNotification` a "system action", and a
 * module-level action directive would make it a callable endpoint any signed-in
 * user could POST — every admin's inbox as a spam and phishing surface. These
 * are internal producer primitives, called by the platform code that owns the
 * event (approval requests, the incident console); the user-facing mutations
 * (read / dismiss) are the real actions and live in lib/admin/actions/
 * notifications.ts. Same precedent as lib/admin/state-writes.ts: a plain module
 * cannot become an endpoint.
 *
 * Every write here is best-effort. A notification is a courtesy copy of an
 * event that is already durable elsewhere (the approval row, the incident, the
 * audit trail) — failing to deliver it must never fail the primary action, so
 * callers await the result but do not branch on it.
 *
 * `source` is deliberately a closed union matching the seeded
 * `admin_notification_sources` registry: a new producer must be registered in a
 * migration first, so notification streams are deliberate and reviewable.
 */

export type AdminDb = ReturnType<typeof createAdminClient>

export type NotificationSource = 'system' | 'incidents' | 'credentials' | 'approvals' | 'automation'

export type NotificationInput = {
  source: NotificationSource
  category: NotificationCategory
  title: string
  body?: string | null
  /** Locale-free in-app path; dropped when it fails validation. */
  linkPath?: string | null
  expiresAt?: string | null
  /**
   * Groups copies of one critical alert (D2). When a whole group goes unread
   * for ESCALATION_WINDOW_HOURS, escalateUnacknowledged() files one follow-up.
   * Only meaningful for `critical`.
   */
  escalationKey?: string | null
}

export type NotificationWriteResult = { ok: true; delivered: number } | { ok: false; error: string }

function normalize(input: NotificationInput): { row: Omit<InsertOf<'admin_notifications'>, 'user_id'> } | { error: string } {
  const title = (input.title ?? '').trim()
  if (!title) return { error: 'A notification needs a title.' }
  if (title.length > NOTIFICATION_TITLE_MAX) {
    return { error: `Notification titles are capped at ${NOTIFICATION_TITLE_MAX} characters.` }
  }
  const body = (input.body ?? '').trim()
  if (body.length > NOTIFICATION_BODY_MAX) {
    return { error: `Notification bodies are capped at ${NOTIFICATION_BODY_MAX} characters.` }
  }
  return {
    row: {
      source: input.source,
      category: input.category,
      title,
      body: body || null,
      link_path: safeNotificationPath(input.linkPath ?? null),
      expires_at: input.expiresAt ?? null,
      // Only criticals carry an escalation group; anything else is stripped so
      // a lower-priority alert can never ride the ack-timeout loop (D2).
      escalation_key:
        input.category === 'critical' && input.escalationKey ? input.escalationKey.slice(0, 120) : null,
    },
  }
}

/** One notification to one admin. */
export async function createAdminNotification(
  admin: AdminDb,
  userId: string,
  input: NotificationInput,
): Promise<NotificationWriteResult> {
  const normalized = normalize(input)
  if ('error' in normalized) {
    logger.warn('admin', 'notification rejected', { error: normalized.error })
    return { ok: false, error: normalized.error }
  }
  const { error } = await admin
    .from('admin_notifications')
    .insert({ ...normalized.row, user_id: userId } as InsertOf<'admin_notifications'>)
  if (error) {
    logger.warn('admin', 'notification insert failed', { error: error.message })
    return { ok: false, error: error.message }
  }
  return { ok: true, delivered: 1 }
}

/**
 * Broadcast to every holder of a role (plan Phase 4.5: `sendNotificationToRole`).
 * Recipients come from `user_roles` — the same table the authorization model
 * reads. `excludeUserId` keeps the person who caused the event out of the
 * fan-out: the requester does not need a reminder of their own request.
 */
export async function sendNotificationToRole(
  admin: AdminDb,
  role: AppRole,
  input: NotificationInput,
  options: { excludeUserId?: string | null } = {},
): Promise<NotificationWriteResult> {
  const normalized = normalize(input)
  if ('error' in normalized) {
    logger.warn('admin', 'notification rejected', { error: normalized.error })
    return { ok: false, error: normalized.error }
  }
  const { data, error } = await admin.from('user_roles').select('user_id').eq('role', role)
  if (error) {
    logger.warn('admin', 'notification recipients lookup failed', { error: error.message })
    return { ok: false, error: error.message }
  }
  const recipients = (data ?? [])
    .map((row) => row.user_id)
    .filter((id): id is string => Boolean(id) && id !== options.excludeUserId)
  if (recipients.length === 0) return { ok: true, delivered: 0 }

  const { error: insertError } = await admin
    .from('admin_notifications')
    .insert(recipients.map((user_id) => ({ ...normalized.row, user_id })))
  if (insertError) {
    logger.warn('admin', 'notification broadcast failed', { error: insertError.message })
    return { ok: false, error: insertError.message }
  }
  return { ok: true, delivered: recipients.length }
}

/* ------------------------------------------------------------------ */
/* D2 — unacknowledged critical escalation                             */
/* ------------------------------------------------------------------ */

/** How long a critical alert may sit fully unread before it escalates. */
export const ESCALATION_WINDOW_HOURS = 4
const MAX_ESCALATION_GROUPS = 20

/**
 * Critical alerts are the ones where silence costs something (a takedown
 * request, a disabled release plan, a broken scheduler). This pass groups
 * unread critical rows by escalation_key; a group where at least one admin
 * read a copy counts as acknowledged (the group is stamped and left alone).
 * A group still fully unread after the window gets exactly one follow-up
 * broadcast — no repeat spam, because the stamp removes it from the scan.
 *
 * Pure enough to test: the grouping decision lives in `groupsToEscalate`,
 * the DB plumbing below just applies it. Called by /api/cron/notify (every
 * 15 minutes), so the window is only ever overshot by one tick.
 */
export function groupsToEscalate(
  rows: { escalation_key: string | null; is_read: boolean; created_at: string }[],
  now: Date,
  windowHours = ESCALATION_WINDOW_HOURS,
): { escalate: string[]; acknowledge: string[] } {
  const cutoff = now.getTime() - windowHours * 3_600_000
  const byKey = new Map<string, { read: boolean; old: boolean }>()
  for (const row of rows) {
    if (!row.escalation_key) continue
    const entry = byKey.get(row.escalation_key) ?? { read: false, old: false }
    entry.read = entry.read || row.is_read
    entry.old = entry.old || Date.parse(row.created_at) <= cutoff
    byKey.set(row.escalation_key, entry)
  }
  const escalate: string[] = []
  const acknowledge: string[] = []
  for (const [key, entry] of byKey) {
    if (!entry.old) continue
    ;(entry.read ? acknowledge : escalate).push(key)
  }
  return { escalate, acknowledge }
}

export type EscalationSummary = { escalated: number; acknowledged: number }

export async function escalateUnacknowledged(admin: AdminDb): Promise<EscalationSummary> {
  const summary: EscalationSummary = { escalated: 0, acknowledged: 0 }
  const cutoff = new Date(Date.now() - ESCALATION_WINDOW_HOURS * 3_600_000).toISOString()
  const { data, error } = await admin
    .from('admin_notifications')
    .select('escalation_key, is_read, created_at, title, link_path')
    .eq('category', 'critical')
    .not('escalation_key', 'is', null)
    .is('escalated_at', null)
    .lte('created_at', cutoff)
    .limit(200)
  if (error) {
    logger.warn('admin', 'escalation scan failed', { error: error.message })
    return summary
  }
  const rows = (data ?? []) as {
    escalation_key: string | null
    is_read: boolean
    created_at: string
    title: string
    link_path: string | null
  }[]
  if (rows.length === 0) return summary

  const { escalate, acknowledge } = groupsToEscalate(rows, new Date())
  if (acknowledge.length > 0) {
    const { error: stampError } = await admin
      .from('admin_notifications')
      .update({ escalated_at: new Date().toISOString() })
      .in('escalation_key', acknowledge)
      .is('escalated_at', null)
    if (!stampError) summary.acknowledged = acknowledge.length
  }

  for (const key of escalate.slice(0, MAX_ESCALATION_GROUPS)) {
    const source = rows.find((r) => r.escalation_key === key)
    const result = await sendNotificationToRole(admin, 'admin', {
      source: 'automation',
      category: 'critical',
      title: `No response yet: ${(source?.title ?? 'a critical alert').slice(0, 120)}`,
      body: `The alert below has gone unread by every admin for ${ESCALATION_WINDOW_HOURS} hours. Whoever picks it up owns it — acknowledge by opening it.`,
      linkPath: source?.link_path ?? '/admin/notifications',
    })
    // Stamp regardless of delivery: a notification failure must not create a
    // re-escalation loop every 15 minutes.
    await admin
      .from('admin_notifications')
      .update({ escalated_at: new Date().toISOString() })
      .eq('escalation_key', key)
      .is('escalated_at', null)
    if (result.ok) summary.escalated += 1
  }
  return summary
}
