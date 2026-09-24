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

export type NotificationSource = 'system' | 'incidents' | 'credentials' | 'approvals'

export type NotificationInput = {
  source: NotificationSource
  category: NotificationCategory
  title: string
  body?: string | null
  /** Locale-free in-app path; dropped when it fails validation. */
  linkPath?: string | null
  expiresAt?: string | null
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
