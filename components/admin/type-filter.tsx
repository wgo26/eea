'use client'

/**
 * Type filter for admin list pages: a native GET `<select>` — changing it
 * submits the form so navigation is a plain SSR reload with a deep-linkable
 * URL (no client router). Status, tab, and search travel as hidden fields so
 * the dropdown only changes the type (page resets to 1).
 */
export function TypeFilter({
  value,
  options,
  action,
  ariaLabel,
  hidden,
  className,
}: {
  value: string
  options: { key: string; label: string }[]
  /** Locale-prefixed list URL (dynamic string — safe for the bare-href audit). */
  action: string
  ariaLabel?: string
  /** Preserved query params (tab, status, q). */
  hidden?: Record<string, string | undefined>
  className?: string
}) {
  return (
    <form method="GET" action={action} className={className}>
      {Object.entries(hidden ?? {}).map(([name, val]) =>
        val ? <input key={name} type="hidden" name={name} value={val} /> : null,
      )}
      <select
        name="type"
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
