'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronDown, PenLine } from 'lucide-react'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import {
  splitAccountNav,
  type AccountNavGroup,
} from '@/lib/account/nav'
import { ACCOUNT_NAV_ICONS } from './account-nav-icons'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useLocaleFromPath } from '@/components/site-header'
import { cn } from '@/lib/utils'

/**
 * Grouped account navigation (Account audit §2.1). Four anchors sit flat on
 * the bar — Dashboard, Submissions, Reading list, Profile — and everything
 * else folds into one "More" menu headed by its group label. The old
 * implementation painted up to ten tabs in a scroll strip and hid the labels
 * under `hidden sm:inline`, which left a row of unexplained icons on laptops.
 */
export function AccountTopbarNav({ groups }: { groups: AccountNavGroup[] }) {
  const locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const pathname = usePathname() ?? ''
  const { tabs, overflow } = splitAccountNav(groups)

  const isActive = (href: string, path: string) =>
    pathname === href || pathname.startsWith(`${href}/`) || pathname === path || pathname.startsWith(`${path}/`)

  const overflowActive = overflow.some((group) => group.items.some((item) => isActive(item.href, item.path)))

  return (
    <nav className="flex min-w-0 flex-1 items-center gap-1" aria-label={dict.account.topbar.portal}>
      {tabs.map((tab) => {
        const Icon = ACCOUNT_NAV_ICONS[tab.key]
        const active = isActive(tab.href, tab.path)
        return (
          <Link
            key={tab.path}
            href={tab.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="hidden md:inline">{tab.label}</span>
          </Link>
        )
      })}

      {overflow.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  overflowActive
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {dict.account.topbar.more}
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </button>
            }
          />
          <DropdownMenuContent align="start" className="w-60">
            {overflow.map((group, gi) => (
              <div key={group.key}>
                {gi > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuLabel className="text-xs uppercase tracking-wider">{group.label}</DropdownMenuLabel>
                {group.items.map((item) => {
                  const Icon = ACCOUNT_NAV_ICONS[item.key]
                  return (
                    <DropdownMenuItem key={item.path} render={<Link href={item.href} />}>
                      <Icon />
                      {item.label}
                      {item.badge && item.badge > 0 ? (
                        <span className="ml-auto rounded-full bg-destructive px-1.5 text-xs font-semibold text-destructive-foreground">
                          {item.badge > 99 ? '99+' : item.badge}
                        </span>
                      ) : null}
                    </DropdownMenuItem>
                  )
                })}
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <Link
        href={localePath(locale, '/submit')}
        className="ml-1 hidden h-9 shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground lg:inline-flex"
      >
        <PenLine className="h-4 w-4" aria-hidden />
        {dict.account.topbar.submit}
      </Link>
    </nav>
  )
}

