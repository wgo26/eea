/**
 * Spec §45 — environment awareness. The dashboard must state which environment
 * it operates on (`PRODUCTION` / `STAGING` / `DEVELOPMENT`) and dangerous
 * operations must name it explicitly.
 *
 * `NEXT_PUBLIC_APP_ENV` is inlined at build time, so this module is safe to
 * import from client components. When the variable is unset we fall back to
 * `NODE_ENV` — a production build never claims to be a safe sandbox, which
 * would silently drop the §45 confirmation on destructive actions.
 */
export type AppEnvironment = 'production' | 'staging' | 'development'

export type EnvironmentLabel = {
  /** Fixed spec §45 token rendered by the topbar indicator. */
  name: string
  /** Badge container: production is visually distinct, the rest stay quiet. */
  badge: string
  /** Status dot inside the badge. */
  dot: string
  /** Whether destructive operations must name this environment (spec §45). */
  guarded: boolean
}

export const ENVIRONMENT_LABELS: Record<AppEnvironment, EnvironmentLabel> = {
  production: {
    name: 'PRODUCTION',
    badge:
      'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-100',
    dot: 'bg-amber-500',
    guarded: true,
  },
  staging: {
    name: 'STAGING',
    badge: 'border-border bg-muted text-muted-foreground',
    dot: 'bg-sky-500',
    guarded: false,
  },
  development: {
    name: 'DEVELOPMENT',
    badge: 'border-dashed border-border bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/60',
    guarded: false,
  },
}

export function getEnvironment(): AppEnvironment {
  const raw = process.env.NEXT_PUBLIC_APP_ENV?.trim().toLowerCase()
  if (raw === 'production' || raw === 'staging' || raw === 'development') return raw
  return process.env.NODE_ENV === 'production' ? 'production' : 'development'
}

export function isProduction(): boolean {
  return getEnvironment() === 'production'
}

export function getEnvironmentLabel(env: AppEnvironment = getEnvironment()): EnvironmentLabel {
  return ENVIRONMENT_LABELS[env]
}
