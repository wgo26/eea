'use client'

/**
 * Sort dropdown for admin list pages: a native GET `<select>` — changing it
 * submits the form so navigation is a plain SSR reload with a deep-linkable
 * URL (no client router). All current query params (tab, status, type, q)
 * travel as hidden fields so the dropdown only changes the sort.
 *
 * The `value` is a combined key like `published_desc` / `updated_asc`.
 */
export function SortFilter({
  value,
  options,
  action,
  ariaLabel,
  hidden,
  className,
}: {
  value: string
  options: { key: string; label: string }[]
  /** Locale-prefixed list URL. */
  action: string
  ariaLabel?: string
  /** Preserved query params (tab, status, type, q). */
  hidden?: Record<string, string | undefined>
  className?: string
}) {
  return (
    <form method="GET" action={action} className={className}>
      {Object.entries(hidden ?? {}).map(([name, val]) =>
        val ? <input key={name} type="hidden" name={name} value={val} /> : null,
      )}
      <select
        name="sort"
        defaultValue={value}
        aria-label={ariaLabel}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="h-9 min-w-[14rem] rounded-md border border-border bg-background px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
