'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { type ComponentType } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getDictionary, type Locale } from '@/lib/i18n'
import { useLocaleFromPath } from '@/components/site-header'
import type { AppRole } from '@/lib/auth/types'
import type { AdminRole } from '@/lib/auth/admin-roles'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  adminBackToSiteHref,
  adminHomeHref,
  buildAdminNavGroups,
  type AdminNavItem,
} from './nav-items'
import { useCollapsedDomains, useRecentPaths, useSidebarRail } from './nav-preferences'

function isActiveItem(pathname: string, item: AdminNavItem): boolean {
  return (
    pathname === item.href ||
    pathname.startsWith(`${item.href}/`) ||
    pathname === item.path ||
    pathname.startsWith(`${item.path}/`)
  )
}

function Badge({ count, active }: { count: number; active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium',
        active
          ? 'bg-primary-foreground/20 text-primary-foreground'
          : 'bg-destructive text-destructive-foreground',
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  )
}

function NavRow({
  item,
  pathname,
  rail,
  Icon,
  onNavigate,
}: {
  item: AdminNavItem
  pathname: string
  rail: boolean
  Icon: ComponentType
  onNavigate?: (item: AdminNavItem) => void
}) {
  const active = isActiveItem(pathname, item)
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate ? () => onNavigate(item) : undefined}
      aria-current={active ? 'page' : undefined}
      aria-label={rail ? item.label : undefined}
      className={cn(
        'flex min-h-[40px] items-center gap-3 rounded-md text-sm font-medium transition-colors',
        rail ? 'justify-center px-0' : 'px-3 py-2',
        active
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
      )}
    >
      <span className="relative h-4 w-4 shrink-0">
        <Icon />
        {/* Rail mode hides the text, so the count survives as a corner dot. */}
        {rail && item.badge != null && item.badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 h-2.5 w-2.5 rounded-full bg-destructive ring-2 ring-card" />
        )}
      </span>
      {!rail && <span className="flex-1 truncate">{item.label}</span>}
      {!rail && item.badge != null && item.badge > 0 && <Badge count={item.badge} active={active} />}
    </Link>
  )

  if (!rail) return link
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="block" />}>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Admin sidebar (AppShell, desktop). Menu visibility comes from the
 * capability map via `buildAdminNavGroups` — editors don't see users/ads/
 * storage/audit entries at all, and an empty domain disappears with them.
 *
 * Two widths (Phase B): the expanded 240px view renders the four operational
 * domains as collapsible sections with badges; the 64px icon rail drops the
 * group chrome, keeps a divider per domain, and surfaces labels as tooltips.
 * Both the rail toggle (also in the topbar) and the collapsed-domain set are
 * per-device preferences read through `nav-preferences.ts`, so a reload lands
 * on the layout the staff member chose.
 */
export function AdminSidebar({
  pendingCount = 0,
  roles,
  adminRoles = [],
  unreadNotifications = 0,
}: {
  pendingCount?: number
  roles: AppRole[]
  adminRoles?: AdminRole[]
  unreadNotifications?: number
}) {
  const pathname = usePathname() ?? ''
  const locale: Locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const groups = buildAdminNavGroups(locale, dict, roles, pendingCount, adminRoles, unreadNotifications)
  const { rail, toggleRail } = useSidebarRail()
  const { collapsed, toggleDomain } = useCollapsedDomains()
  const { paths: recentPaths, pushPath } = useRecentPaths()

  const navLabel = dict.admin.sidebar.admin

  // Recents are stored as plain paths and resolved against the current
  // capability-filtered nav, so a revoked entry or a language switch can
  // never surface a stale or unauthorized shortcut.
  const allItems = groups.flatMap((g) => g.items)
  const recents = recentPaths
    .map((p) => allItems.find((i) => i.path === p))
    .filter((i): i is AdminNavItem => i != null)

  const recordRecent = (item: AdminNavItem) => pushPath(item.path)

  if (rail) {
    return (
      <aside className="flex h-full w-16 flex-col border-r border-border bg-card">
        <div className="flex items-center justify-center border-b border-border p-3">
          <Link
            href={adminHomeHref(locale)}
            aria-label={navLabel}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground"
          >
            E
          </Link>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-2" aria-label={navLabel}>
          {groups.map((group, gi) => (
            <div key={group.domain} className={cn('space-y-1', gi > 0 && 'mt-2 border-t border-border/60 pt-2')}>
              {group.items.map((item) => (
                <NavRow key={item.path} item={item} pathname={pathname} rail Icon={item.icon} onNavigate={recordRecent} />
              ))}
            </div>
          ))}
        </nav>
        <div className="space-y-1 border-t border-border p-2">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={toggleRail}
                  aria-label={dict.admin.sidebar.expandNav}
                  className="flex min-h-[40px] w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ChevronDown className="h-4 w-4 -rotate-90" aria-hidden />
                </button>
              }
            />
            <TooltipContent side="right">{dict.admin.sidebar.expandNav}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Link
                  href={adminBackToSiteHref(locale)}
                  aria-label={dict.admin.sidebar.backToSite}
                  className="flex min-h-[40px] w-full items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                />
              }
            >
              <span className="h-4 w-4">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                  <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
                </svg>
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">{dict.admin.sidebar.backToSite}</TooltipContent>
          </Tooltip>
        </div>
      </aside>
    )
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border p-4">
        <Link href={adminHomeHref(locale)} className="flex flex-1 items-center gap-2 text-lg font-semibold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">E</span>
          <span>{navLabel}</span>
        </Link>
        <button
          type="button"
          onClick={toggleRail}
          aria-label={dict.admin.sidebar.collapseNav}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <ChevronDown className="h-4 w-4 rotate-90" aria-hidden />
        </button>
      </div>
      <nav className="flex-1 overflow-y-auto p-3" aria-label={navLabel}>
        {recents.length > 0 && (
          <div className="mb-4">
            <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {dict.admin.sidebar.recents}
            </p>
            <div className="mt-1 space-y-1">
              {recents.map((item) => {
                const active = isActiveItem(pathname, item)
                return (
                  <Link
                    key={`recent-${item.path}`}
                    href={item.href}
                    onClick={() => recordRecent(item)}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex min-h-[36px] items-center gap-3 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <span className="h-4 w-4 shrink-0">
                      <item.icon />
                    </span>
                    <span className="flex-1 truncate">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )}
        {groups.map((group, gi) => {
          const isCollapsed = collapsed.includes(group.domain)
          return (
            <div key={group.domain} className={cn(gi > 0 && 'mt-4')}>
              <button
                type="button"
                onClick={() => toggleDomain(group.domain)}
                aria-expanded={!isCollapsed}
                className="flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {group.label}
                <ChevronDown
                  className={cn('h-3.5 w-3.5 shrink-0 transition-transform', isCollapsed && '-rotate-90')}
                  aria-hidden
                />
              </button>
              {!isCollapsed && (
                <div className="mt-1 space-y-1" role="group" aria-label={group.label}>
                  {group.items.map((item) => (
                    <NavRow key={item.path} item={item} pathname={pathname} rail={false} Icon={item.icon} onNavigate={recordRecent} />
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </nav>
      <div className="border-t border-border p-3">
        <Link
          href={adminBackToSiteHref(locale)}
          className="flex min-h-[40px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <span className="h-4 w-4">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <line x1="19" y1="12" x2="5" y2="12" /><polyline points="12 19 5 12 12 5" />
            </svg>
          </span>
          <span>{dict.admin.sidebar.backToSite}</span>
        </Link>
      </div>
    </aside>
  )
}
