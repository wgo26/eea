import { cn } from '@/lib/utils'
import { getDictionary, type Locale } from '@/lib/i18n'
import { getEnvironmentLabel, isProduction } from '@/lib/config/env'

/**
 * Spec §45 — environment indicator for the admin topbar. Environment names are
 * fixed tokens (`PRODUCTION` / `STAGING` / `DEVELOPMENT`), never translated;
 * only the surrounding copy is localized. Hook-free so the badge renders in
 * both the server and client trees.
 */
export function EnvIndicator({ locale, className }: { locale: Locale; className?: string }) {
  const label = getEnvironmentLabel()
  const dict = getDictionary(locale)

  return (
    <span
      className={cn(
        'inline-flex min-h-[32px] items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium tracking-wide',
        label.badge,
        className,
      )}
      title={dict.admin.env.hint.replace('{env}', label.name)}
      aria-label={`${dict.admin.env.label}: ${label.name}`}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full', label.dot)} aria-hidden />
      {label.name}
    </span>
  )
}

/**
 * Spec §45 — dangerous operations must explicitly say which environment they
 * touch. Rendered inside the shared destructive-action dialog, so every
 * archive/delete/revoke confirmation carries the warning without each caller
 * remembering to add it. Nothing renders outside production.
 */
export function ProductionWarning({ locale, className }: { locale: Locale; className?: string }) {
  if (!isProduction()) return null
  const dict = getDictionary(locale)

  return (
    <p
      role="alert"
      className={cn(
        'rounded-md border border-amber-400 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100',
        className,
      )}
    >
      {dict.admin.env.productionWarning}
    </p>
  )
}
