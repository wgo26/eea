'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bell, PanelLeftClose, PanelLeftOpen, Rows3, Table2 } from 'lucide-react'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import type { AppRole } from '@/lib/auth/types'
import type { AdminRole } from '@/lib/auth/admin-roles'
import { useLocaleFromPath } from '@/components/site-header'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { AdminMobileNav } from './admin-mobile-nav'
import { AdminCommandPalette } from './admin-command-palette'
import { AdminUserMenu } from './admin-user-menu'
import { SystemStateIndicator } from './system-state-indicator'
import { useSystemState } from './state-provider'
import { useSidebarRail, useTableDensity } from './nav-preferences'
import { EnvIndicator } from './env-indicator'
import { buildAdminNavGroups, findAdminNavLocation } from './nav-items'
import { SHORTCUT_ATTR, SHORTCUT_KEY_LABEL, SHORTCUT_MODIFIER } from './nav-styles'

/**
 * Admin topbar (AppShell). Client component so the capability-filtered nav
 * groups (which carry icon component references) are built on the client.
 * Building them in a Server Component and passing them to AdminMobileNav or
 * AdminCommandPalette would pass functions across the server/client boundary
 * → React #441.
 *
 * Three zones (Phase B): left = mobile drawer trigger, desktop rail toggle
 * and active-page breadcrumbs; center = the ⌘K global search; right =
 * environment + system-state indicators, the pending-attention bell and the
 * compact profile menu. Sticky, localized, reachable from every admin page
 * (checklist item 11). The system-state pill reads `SystemStateProvider` —
 * the layout resolves the state once per request, so no page threads it down.
 */
export function AdminTopbar({
  pendingCount,
  roles,
  adminRoles = [],
  displayName,
  email,
  unreadNotifications = 0,
  logoUrl = null,
}: {
  pendingCount: number
  roles: AppRole[]
  adminRoles?: AdminRole[]
  displayName: string
  email: string
  unreadNotifications?: number
  logoUrl?: string | null
}) {
  const locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const pathname = usePathname() ?? ''
  const groups = buildAdminNavGroups(locale, dict, roles, pendingCount, adminRoles, unreadNotifications)
  const location = findAdminNavLocation(groups, pathname)
  const systemState = useSystemState()
  const { rail, toggleRail } = useSidebarRail()
  const { density, setDensity } = useTableDensity()
  const canModerate = groups.some((g) => g.items.some((i) => i.key === 'moderation'))
  const attention = [
    pendingCount > 0 && canModerate
      ? { href: localePath(locale, '/admin/moderation'), label: `${pendingCount} ${dict.admin.topbar.pending}` }
      : null,
    unreadNotifications > 0
      ? { href: localePath(locale, '/admin/inbox'), label: `${unreadNotifications} ${dict.admin.sidebar.inbox}` }
      : null,
  ].filter((entry): entry is { href: string; label: string } => entry !== null)
  const totalAttention = (canModerate ? pendingCount : 0) + unreadNotifications

  return (
    <header className="sticky top-0 z-30 border-b border-border bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/60">
      <div className="flex h-14 items-center gap-2 px-3 md:gap-3 md:px-4 lg:px-6">
        {/* Left zone — navigation affordances + active context. */}
        <AdminMobileNav
          groups={groups}
          backToSiteHref={localePath(locale, '/')}
          logoUrl={logoUrl}
          labels={{
            menu: dict.admin.topbar.menu,
            backToSite: dict.admin.sidebar.backToSite,
            brand: dict.admin.sidebar.brand,
            consoleLabel: dict.admin.sidebar.consoleLabel,
          }}
        />

        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                onClick={toggleRail}
                aria-label={rail ? dict.admin.sidebar.expandNav : dict.admin.sidebar.collapseNav}
                aria-keyshortcuts={SHORTCUT_ATTR}
                className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:inline-flex"
              >
                {rail ? <PanelLeftOpen className="h-4 w-4" aria-hidden /> : <PanelLeftClose className="h-4 w-4" aria-hidden />}
              </button>
            }
          />
          <TooltipContent side="bottom">
            {rail ? dict.admin.sidebar.expandNav : dict.admin.sidebar.collapseNav}
            <Kbd>{SHORTCUT_MODIFIER}</Kbd>
            <Kbd>{SHORTCUT_KEY_LABEL}</Kbd>
          </TooltipContent>
        </Tooltip>

        <nav aria-label={dict.admin.sidebar.admin} className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
          <Link
            href={localePath(locale, '/admin/dashboard')}
            className="shrink-0 font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {dict.admin.sidebar.admin}
          </Link>
          {location && (
            <>
              <span className="shrink-0 text-muted-foreground/50" aria-hidden>/</span>
              <span className="hidden shrink-0 text-muted-foreground/70 sm:inline">{location.groupLabel}</span>
              <span className="hidden shrink-0 text-muted-foreground/50 sm:inline" aria-hidden>/</span>
              <span className="min-w-0 truncate font-medium text-foreground" aria-current="page">
                {location.itemLabel}
              </span>
            </>
          )}
        </nav>

        {/* Center zone — global quick search (⌘K works everywhere). */}
        <AdminCommandPalette groups={groups} />

        {/* Right zone — status, attention, identity. */}
        <div className="flex shrink-0 items-center gap-2">
          <EnvIndicator locale={locale} className="hidden xl:inline-flex" />
          {systemState && (
            <SystemStateIndicator
              label={dict.admin.states.label}
              name={systemState.name}
              tone={systemState.tone}
              href={systemState.href}
            />
          )}

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={`${dict.admin.dashboard.alertsHeading}: ${totalAttention}`}
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Bell className="h-4 w-4" aria-hidden />
                  {attention.length > 0 && (
                    <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground ring-2 ring-card">
                      {totalAttention > 99 ? '99+' : totalAttention}
                    </span>
                  )}
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>{dict.admin.dashboard.alertsHeading}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {attention.length > 0 ? (
                attention.map((entry) => (
                  <DropdownMenuItem key={entry.href} render={<Link href={entry.href} />}>
                    {entry.label}
                  </DropdownMenuItem>
                ))
              ) : (
                <p className="px-2 py-1.5 text-xs text-muted-foreground">{dict.admin.dashboard.alertsClear}</p>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <span className="hidden h-6 w-px shrink-0 bg-border sm:block" aria-hidden />

          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
                  aria-label={dict.admin.common.density}
                  aria-pressed={density === 'compact'}
                  className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
                >
                  {density === 'compact' ? <Rows3 className="h-4 w-4" aria-hidden /> : <Table2 className="h-4 w-4" aria-hidden />}
                </button>
              }
            />
            <TooltipContent side="bottom">
              {dict.admin.common.density} · {density === 'compact' ? dict.admin.common.densityCompact : dict.admin.common.densityComfortable}
            </TooltipContent>
          </Tooltip>

          <AdminUserMenu displayName={displayName} email={email} roles={roles} />
        </div>
      </div>
    </header>
  )
}
