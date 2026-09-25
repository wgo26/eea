'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, Menu } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { AdminNavGroup } from './nav-items'
import { useCollapsedDomains } from './nav-preferences'

/**
 * Admin navigation drawer (AppShell, < lg) — checklist item 8: admin on
 * mobile is a drawer over a sticky topbar, not a shrunk sidebar. Items are
 * the same capability-filtered, localized, domain-grouped entries the desktop
 * sidebar uses, rendered as collapsible sections so the mental map matches —
 * and sharing the desktop sidebar's persisted collapse preference, so one
 * layout choice carries across viewports.
 */
export function AdminMobileNav({
  groups,
  backToSiteHref,
  labels,
}: {
  groups: AdminNavGroup[]
  backToSiteHref: string
  labels: { menu: string; backToSite: string }
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
      <SheetContent side="left" className="w-72 gap-0 p-0">
        <SheetTitle className="sr-only">{labels.menu}</SheetTitle>
        <nav className="flex h-full flex-col overflow-y-auto p-3" aria-label={labels.menu}>
          {groups.map((group, gi) => {
            const isCollapsed = collapsed.includes(group.domain)
            return (
              <div key={group.domain} className={cn(gi > 0 && 'mt-3 border-t border-border/60 pt-3')}>
                <button
                  type="button"
                  onClick={() => toggleDomain(group.domain)}
                  aria-expanded={!isCollapsed}
                  className="flex w-full items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                >
                  {group.label}
                  <ChevronDown
                    className={cn('h-3.5 w-3.5 shrink-0 transition-transform', isCollapsed && '-rotate-90')}
                    aria-hidden
                  />
                </button>
                {!isCollapsed && (
                  <div className="mt-1 space-y-0.5" role="group" aria-label={group.label}>
                    {group.items.map((item) => {
                      const Icon = item.icon
                      const isActive =
                        pathname === item.href ||
                        pathname.startsWith(`${item.href}/`) ||
                        pathname === item.path ||
                        pathname.startsWith(`${item.path}/`)
                      return (
                        <Link
                          key={item.path}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={isActive ? 'page' : undefined}
                          className={cn(
                            'flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                            isActive
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                          )}
                        >
                          <span className="h-4 w-4 shrink-0"><Icon /></span>
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge != null && item.badge > 0 && (
                            <span className={cn(
                              'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium',
                              isActive
                                ? 'bg-primary-foreground/20 text-primary-foreground'
                                : 'bg-destructive text-destructive-foreground',
                            )}>
                              {item.badge > 99 ? '99+' : item.badge}
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
            className="mt-auto flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {labels.backToSite}
          </Link>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
