'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard,
  BookOpen,
  ShoppingBag,
  Bell,
  User,
} from 'lucide-react'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { useLocaleFromPath } from '@/components/site-header'
import { cn } from '@/lib/utils'
import { splitAccountNav } from '@/lib/account/nav'
import type { AccountNavItem } from '@/lib/account/nav'

/**
 * Mobile bottom navigation bar for the Account area (checklist items 7 + 11).
 * Provides thumb-reachable access to the core account destinations plus
 * the profile/settings entry point. Only rendered on viewports < md (tablet/desktop
 * uses the topbar nav instead).
 *
 * Touch targets are >= 44×44 px, respects iOS safe-area-inset-bottom, and
 * the notifications item carries a live unread badge.
 */
export function AccountBottomNav({ groups }: { groups: ReturnType<typeof splitAccountNav> }) {
  const locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const pathname = usePathname() ?? ''
  const t = dict.account.topbar

  // Flatten all items for easy matching
  const allItems = [
    ...groups.tabs,
    ...groups.overflow.flatMap((g) => g.items),
  ]

  const navItems = [
    { key: 'dashboard', icon: LayoutDashboard, label: t.bottomNav?.dashboard ?? t.dashboard },
    { key: 'submissions', icon: BookOpen, label: t.bottomNav?.submissions ?? t.submissions },
    { key: 'listings', icon: ShoppingBag, label: t.bottomNav?.listings ?? t.listings },
    { key: 'notifications', icon: Bell, label: t.bottomNav?.notifications ?? t.notifications },
    { key: 'profile', icon: User, label: t.bottomNav?.profile ?? t.profile },
  ]

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 1rem)' }}
      aria-label={t.portal}
      role="navigation"
    >
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => {
          const match: AccountNavItem | undefined = allItems.find((i) => i.key === item.key)
          const href = match?.href ?? localePath(locale, `/account/${item.key}`)
          const active =
            pathname === href ||
            pathname.startsWith(`${href}/`) ||
            pathname === `/account/${item.key}` ||
            pathname.startsWith(`/account/${item.key}/`)

          const badge: number | undefined = match?.badge
          const hasBadge = item.key === 'notifications' && typeof badge === 'number' && badge > 0

          const Icon = item.icon
          return (
            <Link
              key={item.key}
              href={href}
              aria-current={active ? 'page' : undefined}
              aria-label={item.label}
              className={cn(
                'relative flex flex-col items-center justify-center min-h-[44px] min-w-[44px] px-3 py-1.5 rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              <Icon className="h-5 w-5" aria-hidden />
              {hasBadge ? (
                <span
                  className="absolute -top-0.5 -right-0.5 inline-flex h-4 min-w-[1.25rem] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold leading-none text-destructive-foreground ring-2 ring-card"
                  aria-label={t.unread.replace('{count}', String(badge))}
                >
                  {badge! > 99 ? '99+' : badge}
                </span>
              ) : null}
              <span className="mt-1 text-[10px] font-medium leading-none truncate max-w-[60px]">
                {item.label}
              </span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}