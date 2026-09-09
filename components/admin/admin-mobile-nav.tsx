'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { AdminNavItem } from './nav-items'

/**
 * Admin navigation drawer (AppShell, < lg) — checklist item 8: admin on
 * mobile is a drawer over a sticky topbar, not a shrunk sidebar. Items are
 * the same capability-filtered, localized entries the desktop sidebar uses.
 */
export function AdminMobileNav({
  items,
  backToSiteHref,
  labels,
}: {
  items: AdminNavItem[]
  backToSiteHref: string
  labels: { menu: string; backToSite: string }
}) {
  const [open, setOpen] = useState(false)
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
          {items.map((item) => {
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
                <span className="flex-1">{item.label}</span>
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