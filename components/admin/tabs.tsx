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
   * Server Component (no 'use client'): every admin page renders Tabs from a
   * Server Component and passes an `hrefFor` closure. If this file were a
   * Client Component, that function prop would cross the server/client
   * boundary → production React #441 ("An error occurred in the Server
   * Components render") on every tabbed admin page. Link-only tabs need no
   * client JS, so this stays a Server Component. Do NOT add 'use client' or
   * an onChange callback without switching callers to precomputed hrefs.
   */
  hrefFor: (key: string) => string
  className?: string
}

export function Tabs({ tabs, active, hrefFor, className }: TabsProps) {
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
            <Link
              href={hrefFor(tab.key)}
              aria-current={active === tab.key ? 'page' : undefined}
              scroll={false}
              className={state}
            >
              {inner}
            </Link>
            {active === tab.key && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t" />
            )}
          </span>
        )
      })}
    </div>
  )
}
