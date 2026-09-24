import 'server-only'

import {
  NOTIFICATION_CATEGORIES,
  isNotificationCategory,
  type NotificationCategory,
} from '@/lib/admin/notification-centre'
import { logger } from '@/lib/observability/logger'
import { db, hasDatabase, safe } from './shared'

/**
 * Notification centre reads (plan Phase 4.5, spec §38).
 *
 * The centre is per-recipient mail, so every function takes the reader's user
 * id — the page passes the session user, never a URL parameter. Rows are
 * service-role reads (the table is SELECT-own-row under RLS; the service client
 * is the same data either way and keeps a DB outage on the `safe()` fallback).
 *
 * Expired notifications (`expires_at` in the past) are invisible: a notice tied
 * to a resolved incident must vanish on its own, without a cleanup job. A NULL
 * `expires_at` means "no expiry", which is the common case.
 *
 * A notification whose `link_path` fails validation is still returned — the row
 * renders without a link. Dropping the whole row would hide the message because
 * of its footer.
 */

export type AdminNotificationRow = {
  id: string
  source: string
  category: NotificationCategory
  title: string
  body: string | null
  linkPath: string | null
  isRead: boolean
  createdAt: string | null
  expiresAt: string | null
}

export type AdminNotificationOptions = {
  limit?: number
  page?: number
  /** `'all'` (default) or one of the four spec §38 categories. */
  category?: NotificationCategory | 'all'
  unreadOnly?: boolean
}

export type UnreadNotificationCounts = {
  total: number
  byCategory: Record<NotificationCategory, number>
}

export function emptyUnreadCounts(): UnreadNotificationCounts {
  return {
    total: 0,
    byCategory: { info: 0, action_required: 0, warning: 0, critical: 0 },
  }
}

function expiryFilter() {
  return `expires_at.is.null,expires_at.gt.${new Date().toISOString()}`
}

export async function getAdminNotifications(
  userId: string,
  options: AdminNotificationOptions = {},
): Promise<{ rows: AdminNotificationRow[]; total: number }> {
  if (!hasDatabase()) return { rows: [], total: 0 }
  const limit = options.limit ?? 30
  const page = options.page ?? 1
  const offset = (page - 1) * limit
  try {
    let query = db()
      .from('admin_notifications')
      .select(
        'id, source, category, title, body, link_path, is_read, created_at, expires_at',
        { count: 'exact' },
      )
      .eq('user_id', userId)
      .or(expiryFilter())
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (options.category && options.category !== 'all') {
      query = query.eq('category', options.category)
    }
    if (options.unreadOnly) query = query.eq('is_read', false)

    const { data, count } = await safe(query)
    const rows = ((data ?? []) as unknown as Record<string, unknown>[]).flatMap((row) => {
      const category = row.category
      // The CHECK constraint and this union are the same list; a row that
      // somehow carries anything else is a bug, not a category to render.
      if (!isNotificationCategory(category)) return []
      return [
        {
          id: row.id as string,
          source: (row.source as string) ?? 'system',
          category,
          title: (row.title as string) ?? '',
          body: (row.body as string | null) ?? null,
          linkPath: (row.link_path as string | null) ?? null,
          isRead: row.is_read === true,
          createdAt: (row.created_at as string | null) ?? null,
          expiresAt: (row.expires_at as string | null) ?? null,
        },
      ]
    })
    return { rows, total: count ?? 0 }
  } catch (e) {
    logger.error('admin', 'getAdminNotifications failed', { error: e })
    return { rows: [], total: 0 }
  }
}

/**
 * Unread counts, one `head`-only count per category (spec §38 badges). Counts
 * drive the tab badges and the sidebar badge — a badge that lied about what is
 * waiting would be worse than no badge, so the counts are live reads, never a
 * cached counter.
 */
export async function getUnreadNotificationCounts(
  userId: string,
): Promise<UnreadNotificationCounts> {
  if (!hasDatabase()) return emptyUnreadCounts()
  try {
    const results = await Promise.all(
      NOTIFICATION_CATEGORIES.map(async (category) => {
        const { count } = await safe(
          db()
            .from('admin_notifications')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('category', category)
            .eq('is_read', false)
            .or(expiryFilter()),
        )
        return [category, count ?? 0] as const
      }),
    )
    const byCategory = { ...emptyUnreadCounts().byCategory }
    for (const [category, count] of results) byCategory[category] = count
    return {
      total: results.reduce((sum, [, count]) => sum + count, 0),
      byCategory,
    }
  } catch (e) {
    logger.error('admin', 'getUnreadNotificationCounts failed', { error: e })
    return emptyUnreadCounts()
  }
}

/** Sidebar badge count — one `head` query instead of the four the tab row needs. */
export async function getUnreadNotificationTotal(userId: string): Promise<number> {
  if (!hasDatabase()) return 0
  try {
    const { count } = await safe(
      db()
        .from('admin_notifications')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false)
        .or(expiryFilter()),
    )
    return count ?? 0
  } catch (e) {
    logger.error('admin', 'getUnreadNotificationTotal failed', { error: e })
    return 0
  }
}
