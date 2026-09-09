import { cn } from '@/lib/utils'

/**
 * Unified filter pill bar for admin pages. Server-rendered link pills
 * that carry query params — replaces the 4+ ad-hoc pill arrays across
 * content, moderation, trust-safety, polls, etc.
 */
export type FilterPill = {
  key: string
  label: string
  count?: number
  href: string
}

export function FilterPills({
  pills,
  active,
  className,
}: {
  pills: FilterPill[]
  active: string
  className?: string
}) {
  return (
    <div className={cn('flex flex-wrap gap-2', className)}>
      {pills.map((pill) => {
        const isActive = active === pill.key
        return (
          <a
            key={pill.key}
            href={pill.href}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium border transition-colors',
              isActive
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {pill.label}
            {pill.count != null && (
              <span className={cn(
                'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold',
                isActive ? 'bg-primary-foreground/20' : 'bg-muted',
              )}>
                {pill.count}
              </span>
            )}
          </a>
        )
      })}
    </div>
  )
}

/**
 * Server-rendered search form. GET-method so it deep-links and
 * crawls. Uses a debounced auto-submit on input (no client component
 * needed — the browser submits on Enter or when the debounce fires
 * via a tiny inline script).
 */
export function SearchBar({
  name = 'q',
  defaultValue,
  placeholder,
  action,
  className,
}: {
  name?: string
  defaultValue?: string
  placeholder?: string
  action?: string
  className?: string
}) {
  return (
    <form method="GET" action={action} className={cn('relative', className)}>
      <input
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="h-9 w-full rounded-md border border-border bg-background pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      <svg
        className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.3-4.3M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z" />
      </svg>
    </form>
  )
}
