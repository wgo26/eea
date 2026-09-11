'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import type { ComponentType } from 'react'

type Tab = {
  href: string
  label: string
  icon: ComponentType<{ className?: string }>
  badge?: number
}

export function AccountTopbarNav({ tabs }: { tabs: Tab[] }) {
  const pathname = usePathname() ?? ''

  return (
    <nav
      className="flex flex-1 items-center gap-1 overflow-x-auto"
      aria-label="Account"
    >
      {tabs.map((tab) => {
        const isActive = pathname === tab.href || pathname.startsWith(`${tab.href}/`)
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            <tab.icon className="h-4 w-4" aria-hidden />
            <span className="hidden sm:inline">{tab.label}</span>
            {tab.badge != null && tab.badge > 0 ? (
              <span
                aria-label={`${tab.badge} unread`}
                className="inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold tabular-nums text-primary-foreground"
              >
                {tab.badge > 99 ? '99+' : tab.badge}
              </span>
            ) : null}
          </Link>
        )
      })}
    </nav>
  )
}
