'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft, ChevronRight, Eye, Menu } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { AdminNavGroup } from './nav-items'
import {
  ADMIN_NAV_ACTIVE_BAR_CLASS,
  ADMIN_NAV_BADGE_CLASS,
  ADMIN_NAV_DOMAIN_TOGGLE_CLASS,
  adminNavBadgeClass,
  adminNavRowClass,
} from './nav-styles'
import { useCollapsedDomains } from './nav-preferences'

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
 */
export function AdminMobileNav({
  groups,
  backToSiteHref,
  labels,
}: {
  groups: AdminNavGroup[]
  backToSiteHref: string
  labels: { menu: string; backToSite: string; brand: string; consoleLabel: string }
}) {
  const [open, setOpen] = useState(false)
  const { collapsed, toggleDomain } = useCollapsedDomains()
  const pathname = usePathname() ?? ''

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
        {/* Brand lockup. `pr-14` reserves the sheet's own close button, so the
            wordmark can never slide underneath it. */}
        <div className="flex h-14 shrink-0 items-center gap-2.5 border-b border-sidebar-border px-3 pr-14">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Eye className="h-5 w-5" aria-hidden />
          </span>
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold leading-5">{labels.brand}</span>
            <span className="truncate text-xs leading-4 text-muted-foreground">{labels.consoleLabel}</span>
          </span>
        </div>
        <nav
          className="admin-nav-scroll flex flex-1 flex-col overflow-y-auto overscroll-contain p-2"
          aria-label={labels.menu}
        >
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
                      const isActive =
                        pathname === item.href ||
                        pathname.startsWith(`${item.href}/`) ||
                        pathname === item.path ||
                        pathname.startsWith(`${item.path}/`)
                      const count = item.badge != null && item.badge > 0 ? item.badge : 0
                      return (
                        <Link
                          key={item.path}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={isActive ? 'page' : undefined}
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
          <Link
            href={backToSiteHref}
            onClick={() => setOpen(false)}
            className={cn(adminNavRowClass(false, 'mobile'), 'mt-auto')}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{labels.backToSite}</span>
          </Link>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
