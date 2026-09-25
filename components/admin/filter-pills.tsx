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
                'inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-xs font-semibold',
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
 * Active-filter summary chips (Phase D): every non-default filter/search the
 * current listing view applies, each removable with one click (the href drops
 * just that param), plus a Clear-all chip when more than one is active.
 * Server-rendered like the pills — pages already build locale-prefixed hrefs
 * for every state combination.
 */
export type ActiveFilterChip = {
  key: string
  /** Localized "Field: value" label, e.g. "Type: Notices". */
  label: string
  /** Listing URL with just this filter dropped — the chip's one-click undo. */
  removeHref: string
}

export function ActiveFilters({
  chips,
  clearAllHref,
  labels,
}: {
  chips: ActiveFilterChip[]
  clearAllHref?: string
  labels: { activeFilters: string; removeFilter: string; clearAll: string }
}) {
  if (chips.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={labels.activeFilters}>
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {labels.activeFilters}
      </span>
      {chips.map((chip) => (
        <a
          key={chip.key}
          href={chip.removeHref}
          aria-label={`${labels.removeFilter}: ${chip.label}`}
          title={chip.label}
          className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 py-0.5 pr-1 pl-2.5 text-xs font-medium text-foreground transition-colors hover:bg-primary/20"
        >
          <span className="max-w-[14rem] truncate">{chip.label}</span>
          <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary-foreground" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" className="h-2.5 w-2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </span>
        </a>
      ))}
      {chips.length > 1 && clearAllHref && (
        <a
          href={clearAllHref}
          className="text-xs font-medium text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          {labels.clearAll}
        </a>
      )}
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
