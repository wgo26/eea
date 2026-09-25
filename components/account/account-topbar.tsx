'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, Eye } from 'lucide-react'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { useLocaleFromPath } from '@/components/site-header'
import type { AppRole } from '@/lib/auth/types'
import { AccountTopbarNav } from './account-topbar-nav'
import { AccountMobileNav } from './account-mobile-nav'
import { AccountUserMenu } from './account-user-menu'
import { buildAccountNavGroups, findAccountNavLocation } from '@/lib/account/nav'

/**
 * Account AppShell topbar (checklist items 7 + 11; Account audit §3 Phase 1).
 *
 * Three zones instead of one unbounded tab strip:
 *   left   — mobile drawer trigger + brand mark + active breadcrumb
 *   center — grouped navigation (four flat anchors + a "More" menu)
 *   right  — notification bell + the member avatar menu
 *
 * Client component because the nav groups carry icon component references —
 * building them in a Server Component and passing them down trips React #441
 * (the same reason AdminTopbar exists). The layout resolves identity + counts
 * once per request and threads plain data in.
 */
export function AccountTopbar({
  displayName,
  email,
  roleLabel,
  roles,
  avatarUrl,
  publicProfileHref,
  unreadNotifications = 0,
}: {
  displayName: string
  email: string
  roleLabel: string
  roles: AppRole[]
  avatarUrl?: string | null
  publicProfileHref?: string
  unreadNotifications?: number
}) {
  const locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const t = dict.account.topbar
  const pathname = usePathname() ?? ''

  const groups = buildAccountNavGroups(locale, dict, { unreadNotifications })
  const location = findAccountNavLocation(groups, pathname)
  const initials = displayName
    .split(/\s+/)
    .map((part) => part.charAt(0))
    .slice(0, 2)
    .join('')
    .toUpperCase()
  const isStaff = roles.some((role) => role === 'admin' || role === 'editor')

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-2 px-4 md:gap-3 md:px-6">
        {/* Left zone — drawer, brand, active context. */}
        <AccountMobileNav groups={groups} />

        <Link
          href={localePath(locale, '/account/dashboard')}
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg md:inline-flex"
          aria-label={t.accountHome}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Eye className="h-4 w-4" aria-hidden />
          </span>
        </Link>

        <nav aria-label={t.portal} className="flex min-w-0 items-center gap-1.5 text-sm">
          <Link
            href={localePath(locale, '/account/dashboard')}
            className="shrink-0 font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {t.portal}
          </Link>
          {location ? (
            <>
              <span className="shrink-0 text-muted-foreground/50" aria-hidden>
                /
              </span>
              <span className="hidden shrink-0 text-muted-foreground/70 lg:inline">{location.group.label}</span>
              <span className="hidden shrink-0 text-muted-foreground/50 lg:inline" aria-hidden>
                /
              </span>
              <span className="min-w-0 truncate font-medium text-foreground" aria-current="page">
                {location.item.label}
              </span>
            </>
          ) : null}
        </nav>

        {/* Center zone — grouped navigation (md+). */}
        <div className="hidden min-w-0 flex-1 md:block">
          <AccountTopbarNav groups={groups} />
        </div>
        <span className="flex-1 md:hidden" aria-hidden />

        {/* Right zone — attention + identity. */}
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={localePath(locale, '/account/notifications')}
            aria-label={t.unread.replace('{count}', String(unreadNotifications))}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Bell className="h-4 w-4" aria-hidden />
            {unreadNotifications > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground ring-2 ring-card">
                {unreadNotifications > 99 ? '99+' : unreadNotifications}
              </span>
            ) : null}
          </Link>

          <span className="hidden h-6 w-px shrink-0 bg-border sm:block" aria-hidden />

          <AccountUserMenu
            displayName={displayName}
            email={email}
            initials={initials}
            roleLabel={roleLabel}
            isStaff={isStaff}
            avatarUrl={avatarUrl}
            publicProfileHref={publicProfileHref}
          />
        </div>
      </div>
    </header>
  )
}