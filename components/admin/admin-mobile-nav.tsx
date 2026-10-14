'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, ChevronRight, Menu } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { SiteMark } from '@/components/site-mark'
import { useLocaleFromPath } from '@/components/site-header'
import {
  adminHomeHref,
  type AdminNavGroup,
  type AdminNavItem,
} from './nav-items'
import {
  ADMIN_NAV_ACTIVE_BAR_CLASS,
  ADMIN_NAV_BADGE_CLASS,
  ADMIN_NAV_DOMAIN_TOGGLE_CLASS,
  ADMIN_NAV_SECTION_LABEL_CLASS,
  adminNavBadgeClass,
  adminNavRowClass,
} from './nav-styles'
import { useCollapsedDomains, useRecentPaths } from './nav-preferences'
import { isActiveItem } from './sidebar'

/**
 * Admin navigation drawer (AppShell, < lg) — checklist item 8: admin on
 * mobile is a drawer over a sticky topbar, not a shrunk sidebar. Items are
 * the same capability-filtered, localized, domain-grouped entries the desktop
 * sidebar uses, rendered as collapsible sections so the mental map matches —
 * and sharing the desktop sidebar's persisted collapse preference, so one
 * layout choice carries across viewports.
 *
 * Row metrics, active treatment, badge tones and domain headers all come from
 * `nav-styles.ts`, the module the desktop sidebar renders from, so the drawer is
 * the same menu on a smaller screen rather than a second design.
 *
 * Parity checklist with the desktop sidebar (keep these in step):
 *   - recents (same store, resolved against the same groups);
 *   - brand lockup links home; back-to-site is a pinned footer, never a row
 *     that scrolls away with a long domain;
 *   - active matching is the shared `isActiveItem`, not a local copy.
 */
export function AdminMobileNav({
  groups,
  backToSiteHref,
  labels,
  logoUrl = null,
}: {
  groups: AdminNavGroup[]
  backToSiteHref: string
  labels: { menu: string; backToSite: string; brand: string; consoleLabel: string; recents: string }
  logoUrl?: string | null
}) {
  const [open, setOpen] = useState(false)
  const { collapsed, toggleDomain } = useCollapsedDomains()
  const { paths: recentPaths, pushPath } = useRecentPaths()
  const pathname = usePathname() ?? ''
  const locale = useLocaleFromPath()

  // Same resolution rule as the desktop sidebar: plain stored paths matched
  // against the current capability-filtered nav, so a revoked entry or a
  // language switch can never surface a stale shortcut.
  const allItems = groups.flatMap((g) => g.items)
  const recents = recentPaths
    .map((p) => allItems.find((i) => i.path === p))
    .filter((i): i is AdminNavItem => i != null)

  const navigate = (item: AdminNavItem) => {
    pushPath(item.path)
    setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label={labels.menu}
            className="inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
        }
      />
      <SheetContent
        side="left"
        className="w-72 gap-0 border-sidebar-border bg-sidebar p-0 text-sidebar-foreground"
      >
        <SheetTitle className="sr-only">{labels.menu}</SheetTitle>
        {/* Brand lockup links home, like the desktop sidebar — a dead brand
            block on mobile was a navigation affordance that went nowhere. The
            `pr-14` reserves the sheet's own close button, so the wordmark can
            never slide underneath it. */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3 pr-14">
          <Link
            href={adminHomeHref(locale)}
            onClick={() => setOpen(false)}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <SiteMark
              logoUrl={logoUrl}
              alt={labels.brand}
              badgeClassName="h-9 w-9 rounded-xl"
              iconClassName="h-5 w-5"
              imgClassName="h-9 w-auto max-w-14 rounded-lg object-contain"
            />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-sm font-semibold leading-5">{labels.brand}</span>
              <span className="truncate text-xs leading-4 text-muted-foreground">{labels.consoleLabel}</span>
            </span>
          </Link>
        </div>
        <nav
          className="admin-nav-scroll flex-1 overflow-y-auto overscroll-contain p-2"
          aria-label={labels.menu}
        >
          {recents.length > 0 && (
            <div className="mb-3">
              <p className={cn(ADMIN_NAV_SECTION_LABEL_CLASS, 'px-3 py-1.5')}>{labels.recents}</p>
              <div className="space-y-0.5">
                {recents.map((item) => {
                  const active = isActiveItem(pathname, item)
                  const Icon = item.icon
                  return (
                    <Link
                      key={`recent-${item.path}`}
                      href={item.href}
                      onClick={() => navigate(item)}
                      aria-current={active ? 'page' : undefined}
                      data-active={active ? 'true' : undefined}
                      className={adminNavRowClass(active, 'mobile')}
                    >
                      {active && <span aria-hidden className={ADMIN_NAV_ACTIVE_BAR_CLASS} />}
                      <Icon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="flex-1 truncate">{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}
          {groups.map((group, gi) => {
            const isCollapsed = collapsed.includes(group.domain)
            const listId = `admin-mobile-nav-${group.domain}`
            return (
              <div key={group.domain} className={cn(gi > 0 && 'mt-3 border-t border-sidebar-border/70 pt-2')}>
                <button
                  type="button"
                  onClick={() => toggleDomain(group.domain)}
                  aria-expanded={!isCollapsed}
                  aria-controls={listId}
                  className={ADMIN_NAV_DOMAIN_TOGGLE_CLASS}
                >
                  {group.label}
                  <ChevronRight
                    className={cn('ml-auto h-3.5 w-3.5 shrink-0 transition-transform', !isCollapsed && 'rotate-90')}
                    aria-hidden
                  />
                </button>
                {!isCollapsed && (
                  <div id={listId} className="mt-0.5 space-y-0.5">
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const isActive = isActiveItem(pathname, item)
                      const count = item.badge != null && item.badge > 0 ? item.badge : 0
                      return (
                        <Link
                          key={item.path}
                          href={item.href}
                          onClick={() => navigate(item)}
                          aria-current={isActive ? 'page' : undefined}
                          data-active={isActive ? 'true' : undefined}
                          className={adminNavRowClass(isActive, 'mobile')}
                        >
                          {isActive && <span aria-hidden className={ADMIN_NAV_ACTIVE_BAR_CLASS} />}
                          <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="flex-1 truncate">{item.label}</span>
                          {count > 0 && (
                            <span className={cn(ADMIN_NAV_BADGE_CLASS, adminNavBadgeClass(item.badgeTone))}>
                              {count > 99 ? '99+' : count}
                            </span>
                          )}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>
        {/* Pinned footer, outside the scroll region: on a long domain list the
            exit affordance used to scroll below the fold. Matches the desktop
            sidebar's fixed back-to-site row. */}
        <div className="shrink-0 border-t border-sidebar-border p-2">
          <Link
            href={backToSiteHref}
            onClick={() => setOpen(false)}
            className={cn(adminNavRowClass(false, 'mobile'))}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{labels.backToSite}</span>
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  )
}
