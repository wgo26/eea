'use client'

import Link from 'next/link'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { signOutAction } from '@/lib/auth/actions'
import type { AppRole } from '@/lib/auth/types'
import { useLocaleFromPath } from '@/components/site-header'
import { AdminMobileNav } from './admin-mobile-nav'
import { buildAdminNavItems } from './nav-items'

/**
 * Admin topbar (AppShell). Client component so the capability-filtered nav
 * items (which carry icon component references) are built on the client.
 * Building them in a Server Component and passing to AdminMobileNav would
 * pass functions across the server/client boundary → React #441.
 * Sticky, localized, with the mobile drawer trigger (item 8), the
 * pending-moderation shortcut, the staff identity area and a sign-out
 * control on every admin page (item 11).
 */
export function AdminTopbar({
  pendingCount,
  roles,
  displayName,
  email,
}: {
  pendingCount: number
  roles: AppRole[]
  displayName: string
  email: string
}) {
  const locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const items = buildAdminNavItems(locale, dict, roles, pendingCount)
  const isAdmin = roles.includes('admin')

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        <AdminMobileNav
          items={items}
          backToSiteHref={localePath(locale, '/')}
          labels={{ menu: dict.admin.topbar.menu, backToSite: dict.admin.sidebar.backToSite }}
        />

        <div className="flex-1" />

        <nav className="flex items-center gap-2">
          {pendingCount > 0 && (
            <Link
              href={localePath(locale, '/admin/moderation')}
              className="relative inline-flex min-h-[32px] items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-200"
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
              {pendingCount} {dict.admin.topbar.pending}
            </Link>
          )}

          {isAdmin && (
            <span className="inline-flex items-center rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {dict.admin.topbar.admin}
            </span>
          )}

          <div className="flex items-center gap-2 border-l border-border pl-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <div className="hidden text-right leading-tight md:block">
              <div className="text-sm font-medium">{displayName}</div>
              <div className="text-xs leading-tight text-muted-foreground">{email}</div>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                className="inline-flex min-h-[36px] items-center rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {dict.admin.topbar.signOut}
              </button>
            </form>
          </div>
        </nav>
      </div>
    </header>
  )
}
