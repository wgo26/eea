import Link from 'next/link'
import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'
import type { AccountBreadcrumb } from '@/lib/account/nav'

/**
 * Shared account page shell (Account audit §2.3). Every page in the member
 * area gets the same width, header, breadcrumbs and card rhythm so the area
 * reads as one portal instead of ten utility pages. Breadcrumb rendering is
 * local here (rather than reusing the admin PageHeader) so the account chrome
 * never depends on admin components for its structure.
 */

export function AccountBreadcrumbTrail({
  breadcrumb,
  className,
}: {
  breadcrumb: AccountBreadcrumb[]
  className?: string
}) {
  if (breadcrumb.length === 0) return null
  return (
    <nav
      aria-label="Breadcrumb"
      className={cn('flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground', className)}
    >
      {breadcrumb.map((crumb, i) => (
        <span key={`${crumb.label}-${i}`} className="flex items-center gap-1.5">
          {i > 0 ? (
            <span className="text-muted-foreground/50" aria-hidden>
              /
            </span>
          ) : null}
          {crumb.href ? (
            <Link href={crumb.href} className="transition-colors hover:text-foreground">
              {crumb.label}
            </Link>
          ) : (
            <span aria-current="page" className="font-medium text-foreground">
              {crumb.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  )
}

/** Small pill used for roles, statuses and counts across the area. */
export function AccountBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'primary' | 'success' | 'warning' | 'danger'
  className?: string
}) {
  const tones = {
    neutral: 'bg-muted text-muted-foreground',
    primary: 'bg-primary/10 text-primary',
    success: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    warning: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
    danger: 'bg-destructive/10 text-destructive',
  } as const
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function AccountPageShell({
  title,
  description,
  breadcrumb = [],
  actions,
  children,
  size = 'default',
  className,
}: {
  title: string
  description?: string
  breadcrumb?: AccountBreadcrumb[]
  /** Primary/secondary actions shown in the header row. */
  actions?: ReactNode
  children: ReactNode
  /** "wide" = lists and grids, "narrow" = single-column forms. */
  size?: 'default' | 'wide' | 'narrow'
  className?: string
}) {
  const widths = {
    default: 'max-w-5xl',
    wide: 'max-w-6xl',
    narrow: 'max-w-3xl',
  } as const
  return (
    <div className={cn('mx-auto w-full space-y-6 px-4 py-8 md:px-6 lg:py-10', widths[size], className)}>
      <AccountBreadcrumbTrail breadcrumb={breadcrumb} />
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      {children}
    </div>
  )
}

/** Consistent card surface for grouped content inside a shell. */
export function AccountCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string
  description?: string
  action?: ReactNode
  children?: ReactNode
  className?: string
}) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6', className)}>
      {title || action ? (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? <h2 className="text-base font-semibold tracking-tight">{title}</h2> : null}
            {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      {children ? (title || action ? <div className="mt-4">{children}</div> : children) : null}
    </section>
  )
}

/**
 * Tile-style quick action (replaces the raw `border bg-muted/20 p-3` links
 * scattered across the dashboard). Always icon + label + optional hint, so
 * every action dock in the area reads as one component.
 */
export function AccountActionTile({
  href,
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  href?: string
  icon?: ComponentType<{ className?: string }>
  label: string
  hint?: string
  onClick?: () => void
}) {
  const cls =
    'flex w-full items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground'
  const inner = (
    <>
      <span className="flex min-w-0 items-center gap-2.5">
        {Icon ? (
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
        ) : null}
        <span className="min-w-0">
          <span className="block truncate">{label}</span>
          {hint ? <span className="mt-0.5 block truncate text-xs font-normal text-muted-foreground">{hint}</span> : null}
        </span>
      </span>
      <span className="shrink-0 text-muted-foreground" aria-hidden>
        →
      </span>
    </>
  )
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} className={cn(cls, 'cursor-pointer')}>
      {inner}
    </button>
  )
}

/**
 * Warm empty state (Account audit §2.4): a visual anchor, what is missing,
 * why filling it is worth the member's time, and one primary tap plus an
 * optional secondary route. Replaces the bare "No saved items" paragraphs.
 */
export function AccountEmptyState({
  icon: Icon,
  title,
  body,
  actionLabel,
  actionHref,
  secondaryLabel,
  secondaryHref,
  className,
}: {
  icon: ComponentType<{ className?: string }>
  title: string
  body?: string
  actionLabel?: string
  actionHref?: string
  secondaryLabel?: string
  secondaryHref?: string
  className?: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-muted/20 p-8 text-center',
        className,
      )}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Icon className="h-6 w-6" aria-hidden />
      </span>
      <p className="mt-4 text-sm font-semibold">{title}</p>
      {body ? <p className="mt-1 max-w-sm text-sm leading-relaxed text-muted-foreground">{body}</p> : null}
      {actionLabel && actionHref ? (
        <Link
          href={actionHref}
          className="mt-5 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          {actionLabel}
        </Link>
      ) : null}
      {secondaryLabel && secondaryHref ? (
        <Link
          href={secondaryHref}
          className="mt-2 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          {secondaryLabel}
        </Link>
      ) : null}
    </div>
  )
}

