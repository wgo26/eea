import 'server-only'

import { cache } from 'react'
import { formatDate, getDictionary } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n/config'
import { localePath } from '@/lib/i18n/urls'
import { getUserRoles, isStaffRoles } from '@/lib/auth/roles'
import type { AppRole } from '@/lib/auth/types'
import { createClient } from '@/lib/supabase/server'
import { getUnreadCount } from '@/lib/notify/queries'

/**
 * Identity facts for the account chrome (topbar) and the dashboard banner.
 *
 * `cache()` makes it one resolution per request: the layout renders the
 * topbar and the dashboard renders the banner, and both need the same name,
 * role and avatar — so the shell can never disagree with the page after a
 * profile edit (Account audit §2.2's "one surface, one truth"). The cache key
 * is the (userId, locale) pair passed as primitives, not the client object.
 */
export type AccountIdentity = {
  displayName: string
  email: string
  initials: string
  roleLabel: string
  roles: AppRole[]
  isStaff: boolean
  avatarUrl: string
  /** Present only when the member keeps a public contributor page. */
  publicProfileHref?: string
  joinedLabel?: string
  locationName?: string
  isVerified: boolean
  unreadNotifications: number
}

export const resolveAccountIdentity = cache(
  async (userId: string, email: string, locale: Locale): Promise<AccountIdentity> => {
    const supabase = await createClient()
    const dict = getDictionary(locale)
    const d = dict.account.dashboard

    const [{ data: profile }, roles, unreadNotifications] = await Promise.all([
      supabase
        .from('profiles')
        .select('display_name, full_name, avatar_url, is_public, is_verified, created_at, location:locations(name)')
        .eq('id', userId)
        .maybeSingle(),
      getUserRoles(supabase, userId),
      getUnreadCount(),
    ])

    const p = (profile ?? null) as {
      display_name?: string | null
      full_name?: string | null
      avatar_url?: string | null
      is_public?: boolean | null
      is_verified?: boolean | null
      created_at?: string | null
      location?: { name?: string | null } | { name?: string | null }[] | null
    } | null

    const displayName =
      p?.display_name ||
      p?.full_name ||
      (email ? email.split('@')[0] : '') ||
      d.member

    const roleLabel = roles.includes('admin')
      ? d.roleAdmin
      : roles.includes('editor')
        ? d.roleEditor
        : roles.includes('advertiser')
          ? d.roleAdvertiser
          : roles.includes('contributor')
            ? d.roleContributor
            : d.member

    const locationRow = Array.isArray(p?.location) ? p?.location[0] : p?.location

    return {
      displayName,
      email,
      initials: initialsOf(displayName),
      roleLabel,
      roles,
      isStaff: isStaffRoles(roles),
      avatarUrl: p?.avatar_url ?? '',
      publicProfileHref: p?.is_public === false ? undefined : localePath(locale, `/contributors/${userId}`),
      joinedLabel: p?.created_at ? formatDate(p.created_at, locale, { month: 'long', year: 'numeric' }) : undefined,
      locationName: locationRow?.name ?? undefined,
      isVerified: !!p?.is_verified,
      unreadNotifications,
    }
  },
)

/** Identity for the guard-returned session user. */
export function getAccountIdentity(
  user: { id: string; email?: string | null },
  locale: Locale,
): Promise<AccountIdentity> {
  return resolveAccountIdentity(user.id, user.email ?? '', locale)
}

/** Up to two uppercase initials for the avatar fallback. */
export function initialsOf(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase()
}