import { isLocalePrefixed, localePath } from '@/lib/i18n/urls'
import type { Locale } from '@/lib/i18n/config'

/**
 * Notification centre vocabulary (plan Phase 4.5, spec §38).
 *
 * The four categories, the link-path rule and the sizing caps are shared by
 * three places that must not depend on each other: the writer
 * (lib/admin/notification-writes.ts), the reads (lib/admin/queries/
 * notifications.ts) and the page/rows that render them. They live in a plain
 * module — no React, no `server-only` — so the 'use server' action module can
 * validate input without importing the component tree, and the rules stay
 * unit-testable.
 *
 * Categories are fixed by the spec (Informational, Action Required, Warning,
 * Critical) and mirrored by a CHECK constraint on the table: the union here is
 * the TypeScript side of the same contract, and `NOTIFICATION_CATEGORIES` is
 * also the display order of the tab strip.
 */

export const NOTIFICATION_CATEGORIES = ['info', 'action_required', 'warning', 'critical'] as const

export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number]

const CATEGORY_SET: ReadonlySet<string> = new Set(NOTIFICATION_CATEGORIES)

export function isNotificationCategory(value: unknown): value is NotificationCategory {
  return typeof value === 'string' && CATEGORY_SET.has(value)
}

/** Caps kept at the write boundary so one producer cannot fill the centre. */
export const NOTIFICATION_TITLE_MAX = 160
export const NOTIFICATION_BODY_MAX = 2000
const LINK_PATH_MAX = 300

/**
 * Validates a notification's `link_path`: the locale-free in-app path a row
 * links to. Same-origin only — scheme-relative ("//evil.com"), absolute,
 * backslash and control-character tricks are rejected, as are API/asset-like
 * targets that could never be a page. Locale-prefixed input is rejected too:
 * a stored notification must render in whichever language the reader is
 * using, so the locale is applied once, at render time (`notificationHref`).
 *
 * Returns the path, or null when the link must be dropped (the notification
 * itself still renders — only the link goes).
 */
export function safeNotificationPath(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const value = raw.trim()
  if (!value || value.length > LINK_PATH_MAX) return null
  if (!value.startsWith('/') || value.startsWith('//')) return null
  if (value.includes('\\')) return null
  if (/[\u0000-\u001f\u007f]/.test(value)) return null
  const pathOnly = value.split(/[?#]/)[0]
  if (pathOnly.startsWith('/api') || pathOnly.startsWith('/_next')) return null
  if (/\.[a-z0-9]{1,8}$/i.test(pathOnly)) return null
  if (isLocalePrefixed(value)) return null
  return value
}

/** Localized, validated href for a notification row — null when unusable. */
export function notificationHref(locale: Locale, linkPath: unknown): string | null {
  const path = safeNotificationPath(linkPath)
  return path ? localePath(locale, path) : null
}
