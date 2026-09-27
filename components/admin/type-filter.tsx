'use client'

/**
 * Generic GET `<select>` filter for admin list pages — changing it submits
 * the form so navigation is a plain SSR reload with a deep-linkable URL (no
 * client router). The other active params (tab, status, q, sort…) travel as
 * hidden fields so the dropdown only changes its own `name` (page resets
 * to 1). `TypeFilter` is the historic name; `SortFilter` is an alias — same
 * component, no copy-paste.
 */
export function TypeFilter({
  value,
  options,
  action,
  ariaLabel,
  hidden,
  className,
  name = 'type',
}: {
  value: string
  options: { key: string; label: string }[]
  /** Locale-prefixed list URL (dynamic string — safe for the bare-href audit). */
  action: string
  ariaLabel?: string
  /** Preserved query params (tab, status, q, sort…). */
  hidden?: Record<string, string | undefined>
  className?: string
  /** Query-param name this select controls. Defaults to `type`. */
  name?: string
}) {
  return (
    <form method="GET" action={action} className={className}>
      {Object.entries(hidden ?? {}).map(([field, val]) =>
        val ? <input key={field} type="hidden" name={field} value={val} /> : null,
      )}
      <select
        name={name}
        defaultValue={value}
        aria-label={ariaLabel}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </form>
  )
}

/**
 * Sort dropdown — same GET-select as {@link TypeFilter} with `name="sort"`.
 * Kept as an alias so call sites read `<SortFilter …>` instead of a generic
 * select with a magic string.
 */
export function SortFilter(props: Omit<React.ComponentProps<typeof TypeFilter>, 'name'>) {
  return <TypeFilter {...props} name="sort" />
}
