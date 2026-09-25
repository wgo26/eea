'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, Menu, PenLine } from 'lucide-react'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { useLocaleFromPath } from '@/components/site-header'
import { cn } from '@/lib/utils'
import type { AccountNavGroup } from '@/lib/account/nav'
import { ACCOUNT_NAV_ICONS } from './account-nav-icons'

/**
 * Account navigation drawer (< md) — the same three groups the desktop bar
 * uses, so the mental map carries across breakpoints (Account audit §3
 * Phase 1: "drawer, not a shrunk tab strip"). Touch-sized rows, collapsible
 * group headers, submit shortcut and the public-site link at the bottom.
 */
export function AccountMobileNav({ groups }: { groups: AccountNavGroup[] }) {
  const locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const t = dict.account.topbar
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const pathname = usePathname() ?? ''

  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <button
            type="button"
            aria-label={t.menu}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:hidden"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>
        }
      />
      <SheetContent side="left" className="w-72 gap-0 p-0">
        <SheetTitle className="sr-only">{t.menu}</SheetTitle>
        <nav className="flex h-full flex-col overflow-y-auto p-3" aria-label={t.portal}>
          {groups.map((group, gi) => {
            const isCollapsed = collapsed.has(group.key)
            return (
              <div key={group.key} className={cn(gi > 0 && 'mt-3 border-t border-border/60 pt-3')}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
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
                      const Icon = ACCOUNT_NAV_ICONS[item.key]
                      const active =
                        pathname === item.href ||
                        pathname.startsWith(`${item.href}/`) ||
                        pathname === item.path ||
                        pathname.startsWith(`${item.path}/`)
                      return (
                        <Link
                          key={item.path}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          aria-current={active ? 'page' : undefined}
                          className={cn(
                            'flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                            active
                              ? 'bg-primary text-primary-foreground'
                              : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge != null && item.badge > 0 && (
                            <span
                              className={cn(
                                'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium',
                                active
                                  ? 'bg-primary-foreground/20 text-primary-foreground'
                                  : 'bg-destructive text-destructive-foreground',
                              )}
                            >
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
            href={localePath(locale, '/submit')}
            onClick={() => setOpen(false)}
            className="mt-3 flex min-h-[44px] items-center gap-3 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            <PenLine className="h-4 w-4 shrink-0" aria-hidden />
            {t.submit}
          </Link>
          <Link
            href={localePath(locale, '/')}
            onClick={() => setOpen(false)}
            className="mt-auto flex min-h-[44px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          >
            {t.viewSite}
          </Link>
        </nav>
      </SheetContent>
    </Sheet>
  )
}
