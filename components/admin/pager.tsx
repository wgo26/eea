import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * Shared prev/next + range footer for paginated admin tables. Links are
 * locale-prefixed by the caller via hrefFor (checklist: never a bare path).
 *
 * Server Component (no 'use client'): every paginated admin page renders
 * Pager from a Server Component and passes an `hrefFor` closure. If this
 * file were a Client Component, that function prop would cross the
 * server/client boundary → production React #441 ("An error occurred in
 * the Server Components render") on every paginated admin page (moderation,
 * audit-log, users, listings, content, storage). Link-only pagination needs
 * no client JS, so this stays a Server Component. Do NOT add 'use client'.
 */
export function Pager({
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
  copy: { previous: string; next: string; showing: string }
  className?: string
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)
  const linkCls =
    'inline-flex items-center rounded-md border border-border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-40 disabled:pointer-events-none'

  return (
    <nav className={cn('flex flex-wrap items-center justify-between gap-3', className)} aria-label="Pagination">
      <p className="text-xs text-muted-foreground">
        {copy.showing.replace('{from}', String(from)).replace('{to}', String(to)).replace('{total}', String(total))}
      </p>
      <div className="flex items-center gap-2">
        <Link
          href={hrefFor(Math.max(1, page - 1))}
          aria-disabled={page <= 1}
          className={cn(linkCls, page <= 1 && 'pointer-events-none opacity-40')}
        >
          ← {copy.previous}
        </Link>
        <span className="text-xs tabular-nums text-muted-foreground">
          {page} / {totalPages}
        </span>
        <Link
          href={hrefFor(Math.min(totalPages, page + 1))}
          aria-disabled={page >= totalPages}
          className={cn(linkCls, page >= totalPages && 'pointer-events-none opacity-40')}
        >
          {copy.next} →
        </Link>
      </div>
    </nav>
  )
}