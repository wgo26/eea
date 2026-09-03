'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'

type Tab = {
  key: string
  label: string
  count?: number
}

type TabsProps = {
  tabs: Tab[]
  active: string
  /**
   * Preferred: give each tab a locale-prefixed href and the tab renders as a
   * Next.js Link (prefetched, no full reload). Falls back to onChange +
   * window navigation only for callers that cannot build hrefs.
   */
  hrefFor?: (key: string) => string
  onChange?: (key: string) => void
  className?: string
}

export function Tabs({ tabs, active, hrefFor, onChange, className }: TabsProps) {
  return (
    <div className={cn('flex items-center gap-1 border-b border-border overflow-x-auto', className)}>
      {tabs.map((tab) => {
        const inner = (
          <>
            {tab.label}
            {tab.count != null && (
              <span className={cn(
                'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium',
                active === tab.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}>
                {tab.count}
              </span>
            )}
          </>
        )
        const state = cn(
          'relative flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium whitespace-nowrap transition-colors',
          active === tab.key
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )
        return (
          <span key={tab.key} className="relative">
            {hrefFor ? (
              <Link
                href={hrefFor(tab.key)}
                aria-current={active === tab.key ? 'page' : undefined}
                scroll={false}
                className={state}
              >
                {inner}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onChange?.(tab.key)}
                className={state}
              >
                {inner}
              </button>
            )}
            {active === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />
            )}
          </span>
        )
      })}
    </div>
  )
}
