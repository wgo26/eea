import { cn } from '@/lib/utils'

type PaginationCopy = {
  previous: string
  next: string
  showing: string
}

/**
 * Server-rendered pagination bar for admin tables. Rows are sliced per page
 * on the page (searchParams-driven) — this component renders the range
 * summary and prev/next links that preserve the rest of the query string.
 */
export function PaginationBar({
  page,
  pageSize,
  total,
  hrefFor,
  copy,
  className,
}: {
  page: number
  pageSize: number
  total: number
  hrefFor: (page: number) => string
  copy: PaginationCopy
  className?: string
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const from = total === 0 ? 0 : (safePage - 1) * pageSize + 1
  const to = Math.min(safePage * pageSize, total)

  const linkCls =
    'inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-40'

  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-3 pt-3', className)}>
      <span className="text-xs text-muted-foreground">
        {total > 0
          ? copy.showing
              .replace('{from}', String(from))
              .replace('{to}', String(to))
              .replace('{total}', String(total))
          : ''}
      </span>
      <div className="flex items-center gap-2">
        {safePage > 1 ? (
          <a href={hrefFor(safePage - 1)} className={linkCls}>
            {copy.previous}
          </a>
        ) : (
          <span className={linkCls} aria-disabled="true">
            {copy.previous}
          </span>
        )}
        <span className="px-1 text-xs tabular-nums text-muted-foreground">
          {safePage} / {totalPages}
        </span>
        {safePage < totalPages ? (
          <a href={hrefFor(safePage + 1)} className={linkCls}>
            {copy.next}
          </a>
        ) : (
          <span className={linkCls} aria-disabled="true">
            {copy.next}
          </span>
        )}
      </div>
    </div>
  )
}