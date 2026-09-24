'use server'

/**
 * Notification centre actions (plan Phase 4.5, spec §38).
 *
 * These are the reader's own mutations — mark read, mark all read, dismiss —
 * and every one of them is scoped to the session user in the WHERE clause
 * rather than trusting the row id alone: the service-role client bypasses the
 * table's SELECT-own-row RLS, so an id from a client would otherwise let any
 * admin silently clear another admin's centre. Deviation from the plan's
 * literal `markAllNotificationsRead(userId)` for the same reason: the id comes
 * from the session, never from the caller.
 *
 * Capability is `viewDashboard` (the plan's guard for this page), matching
 * lib/admin/actions/widgets.ts: curating your own inbox is not a privileged
 * act, so it needs no administrative capability on top of the one that opens
 * the page.
 *
 * Deliberately NOT audited (spec §19 covers privileged actions): marking your
 * own mail read is not one, and an audit row per read would bury the trail in
 * personal-display noise. The events the notifications describe — approval
 * requests, incidents, credential lifecycle — already have their own audit
 * entries.
 *
 * The write side lives in lib/admin/notification-writes.ts (producers); these
 * actions are the only recipient-side mutations.
 */

import { assertCapability } from '@/lib/admin/auth'
import {
  isNotificationCategory,
  type NotificationCategory,
} from '@/lib/admin/notification-centre'
import { createAdminClient, type UpdateOf } from '@/lib/supabase/admin'
import { fail, revalidateLocalized, type ActionResult } from './_shared'

const INBOX_PATH = '/admin/inbox'

async function markRead(
  scope: 'one' | 'all',
  id?: string,
  category?: NotificationCategory,
): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('viewDashboard')
    const admin = createAdminClient()
    let query = admin
      .from('admin_notifications')
      .update({ is_read: true } as UpdateOf<'admin_notifications'>)
      .eq('user_id', ctx.user.id)
      .eq('is_read', false)
    if (scope === 'one') query = query.eq('id', id ?? '')
    if (category) query = query.eq('category', category)
    const { error } = await query
    if (error) return { ok: false, error: error.message }
    revalidateLocalized(INBOX_PATH)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function markNotificationRead(id: string): Promise<ActionResult> {
  return markRead('one', id)
}

/**
 * Marks the whole centre read, or one category when the page is filtered
 * (the "mark all read" button sits on the active tab).
 */
export async function markAllNotificationsRead(category?: string): Promise<ActionResult> {
  if (category && category !== 'all' && !isNotificationCategory(category)) {
    return { ok: false, error: 'Unknown notification category.' }
  }
  return markRead('all', undefined, isNotificationCategory(category) ? category : undefined)
}

async function dismiss(ids: string[]): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('viewDashboard')
    const clean = ids.filter((id) => typeof id === 'string' && id.length > 0)
    if (clean.length === 0) return { ok: false, error: 'Nothing to dismiss.' }
    const admin = createAdminClient()
    const { error } = await admin
      .from('admin_notifications')
      .delete()
      .eq('user_id', ctx.user.id)
      .in('id', clean)
    if (error) return { ok: false, error: error.message }
    revalidateLocalized(INBOX_PATH)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function dismissNotification(id: string): Promise<ActionResult> {
  return dismiss([id])
}

/** Bulk dismiss — the selection the page's checkbox column sends. */
export async function dismissNotifications(ids: string[]): Promise<ActionResult> {
  return dismiss(Array.isArray(ids) ? ids : [])
}
