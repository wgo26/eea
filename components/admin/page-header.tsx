import Link from 'next/link'
import { cn } from '@/lib/utils'

type PageHeaderProps = {
  title: string
  description?: string
  breadcrumb?: { label: string; href?: string }[]
  actions?: React.ReactNode
  className?: string
}

/**
 * Standard admin/account page header.
 *
 * The breadcrumb renders as real list semantics (`nav > ol > li`) with
 * `aria-current="page"` on the final crumb. It used to be a bare run of spans,
 * which announced nothing about position — a screen-reader user could not tell
 * they were at the end of the trail — and linked the current page to itself.
 *
 * No built-in bottom margin: every page wraps content in space-y-5/6, so an
 * extra mb-6 here double-spaced the header (~48px gap).
 */
export function PageHeader({ title, description, breadcrumb, actions, className }: PageHeaderProps) {
  const crumbCount = breadcrumb?.length ?? 0
  return (
    <div className={cn('flex flex-col gap-3 md:flex-row md:items-start md:justify-between', className)}>
      <div className="min-w-0">
        {crumbCount > 0 && (
          <nav aria-label="Breadcrumb" className="mb-1.5">
            <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              {breadcrumb!.map((crumb, i) => {
                const isLast = i === crumbCount - 1
                return (
                  <li key={`${crumb.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
                    {i > 0 && (
                      <span aria-hidden className="text-muted-foreground/50">
                        /
                      </span>
                    )}
                    {isLast ? (
                      <span aria-current="page" className="truncate font-medium text-foreground">
                        {crumb.label}
                      </span>
                    ) : crumb.href ? (
                      <Link href={crumb.href} className="truncate transition-colors hover:text-foreground">
                        {crumb.label}
                      </Link>
                    ) : (
                      <span className="truncate font-medium text-foreground">{crumb.label}</span>
                    )}
                  </li>
                )
              })}
            </ol>
          </nav>
        )}
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground max-w-2xl">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  )
}
