'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { getDictionary, type Locale } from '@/lib/i18n'
import { useLocaleFromPath } from '@/components/site-header'
import type { AppRole } from '@/lib/auth/types'
import {
  adminBackToSiteHref,
  adminHomeHref,
  buildAdminNavItems,
} from './nav-items'

/**
 * Admin sidebar (AppShell, desktop). Menu visibility comes from the
 * capability map via buildAdminNavItems â€” editors don't see users/ads/
 * storage/audit entries at all. Labels are localized; hrefs carry the
 * active locale.
 */
export function AdminSidebar({
  pendingCount = 0,
  roles,
}: {
  pendingCount?: number
  roles: AppRole[]
}) {
  const pathname = usePathname() ?? ''
  const locale: Locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const items = buildAdminNavItems(locale, dict, roles, pendingCount)

  return (
    <aside className="flex h-full w-64 flex-col border-r border-border bg-card">
      <div className="border-b border-border p-4">
        <Link href={adminHomeHref(locale)} className="flex items-center gap-2 text-lg font-semibold">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">E</span>
          <span>{dict.admin.sidebar.admin}</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3" aria-label={dict.admin.sidebar.admin}>
        {items.map((item) => {
          const isActive =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`) ||
            pathname === item.path ||
            pathname.startsWith(`${item.path}/`)
          const Icon = item.icon
          return (
            <Link
              key={item.path}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex min-h-[40px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <span className="h-4 w-4 shrink-0"><Icon /></span>
              <span className="flex-1">{item.label}</span>
              {item.badge != null && item.badge > 0 && (
                <span
                  className={cn(
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium',
                    isActive
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
