import Link from 'next/link'

import { cn } from '@/lib/utils'
import { fillCopy, formatRelative } from '@/lib/admin/format'
import { oldestPendingHours, slaTone, type SlaTone } from '@/lib/admin/insights'
import type { SeverityCopy } from '@/lib/admin/labels'
import type { DashboardStats, OperationalAlert, SystemHealth } from '@/lib/admin/queries'
import type { SystemStatus } from '@/lib/observability/metrics'
import { localePath } from '@/lib/i18n/urls'
import type { Dictionary, Locale } from '@/lib/i18n'
import { StatusDot, type VizTone } from '@/components/admin/viz'

type Copy = Pick<
  Dictionary['admin']['dashboard'],
  | 'glanceLabel'
  | 'glanceAlerts'
  | 'glanceAllClear'
  | 'pending'
  | 'publishedToday'
  | 'healthOperational'
  | 'healthDegraded'
  | 'healthDown'
  | 'healthUnknown'
  | 'healthChecked'
  | 'alertOldest'
  | 'alertIncident'
>

const HEALTH_TONE: Record<SystemStatus, VizTone> = {
  healthy: 'emerald',
  degraded: 'amber',
  unavailable: 'red',
  unknown: 'muted',
}

const SLA_CHIP_TONE: Record<SlaTone, string> = {
  ok: 'text-emerald-700 dark:text-emerald-300',
  warning: 'text-amber-700 dark:text-amber-300',
  critical: 'text-red-700 dark:text-red-300',
}

const ALERT_CHIP_TONE: Record<'critical' | 'warning' | 'calm', { chip: string; dot: VizTone }> = {
  critical: { chip: 'border-red-200 dark:border-red-900/60', dot: 'red' },
  warning: { chip: 'border-amber-200 dark:border-amber-900/60', dot: 'amber' },
  calm: { chip: 'border-border', dot: 'emerald' },
}

/**
 * The dashboard's "is everything OK right now?" row — one scannable strip
 * under the page header (plan §glance), built entirely from data the page
 * already fetched: platform health, open alerts, the SLA clock on the oldest
 * pending submission, and today's publishing count.
 *
 * Server-rendered like the rest of the page; every chip that leads somewhere
 * is a plain Link, so there is no client state to drift.
 */
export function GlanceStrip({
  health,
  alerts,
  stats,
  copy,
  severity,
  locale,
}: {
  health: SystemHealth
  alerts: OperationalAlert[]
  stats: DashboardStats
  copy: Copy
  severity: SeverityCopy
  locale: Locale
}) {
  const incident = alerts.find((alert) => alert.id === 'incident')
  const otherAlerts = alerts.filter((alert) => alert.id !== 'incident')
  const criticalCount = otherAlerts.filter((alert) => alert.severity === 'critical').length
  const warningCount = otherAlerts.filter((alert) => alert.severity === 'warning').length

  const alertTone = criticalCount > 0 ? 'critical' : warningCount > 0 ? 'warning' : 'calm'

  const oldestHours = oldestPendingHours(stats.oldestPendingAt)
  const pendingTone = slaTone(oldestHours)

  const healthLabel =
    health.status === 'healthy'
      ? copy.healthOperational
      : health.status === 'degraded'
        ? copy.healthDegraded
        : health.status === 'unavailable'
          ? copy.healthDown
          : copy.healthUnknown

  return (
    <section aria-label={copy.glanceLabel} className="flex flex-wrap items-center gap-2">
      {/* §34.3 — is the platform well? */}
      <Chip>
        <StatusDot tone={HEALTH_TONE[health.status]} />
        <span className="font-medium">{healthLabel}</span>
        <span className="text-muted-foreground">
          {fillCopy(copy.healthChecked, { time: formatRelative(health.checkedAt, locale) })}
        </span>
      </Chip>

      {/* An incident outranks every other alert, so it gets its own chip. */}
      {incident && (
        <Chip href={localePath(locale, incident.href)} toneClass={ALERT_CHIP_TONE.critical.chip}>
          <StatusDot tone={ALERT_CHIP_TONE[incident.severity === 'critical' ? 'critical' : 'warning'].dot} />
          <span className="font-medium">{copy.alertIncident}</span>
        </Chip>
      )}

      {otherAlerts.length === 0 ? (
        <Chip toneClass="border-emerald-200 dark:border-emerald-900/60">
          <StatusDot tone="emerald" />
          <span className="font-medium">{copy.glanceAllClear}</span>
        </Chip>
      ) : (
        <Chip
          href={localePath(locale, otherAlerts[0].href)}
          toneClass={ALERT_CHIP_TONE[alertTone].chip}
        >
          <StatusDot tone={ALERT_CHIP_TONE[alertTone].dot} />
          <span className="font-medium">{fillCopy(copy.glanceAlerts, { count: otherAlerts.length })}</span>
          <span className="text-muted-foreground">{severity[alertTone === 'critical' ? 'critical' : 'warning']}</span>
        </Chip>
      )}

      {/* §34.1 — the review queue and its SLA clock. */}
      <Chip href={`${localePath(locale, '/admin/moderation')}?status=pending`}>
        <span className="font-medium tabular-nums">{stats.pendingSubmissions}</span>
        <span className="text-muted-foreground">{copy.pending}</span>
        {oldestHours != null && pendingTone && (
          <span className={cn('font-medium tabular-nums', SLA_CHIP_TONE[pendingTone])}>
            {fillCopy(copy.alertOldest, { hours: oldestHours })}
          </span>
        )}
      </Chip>

      {/* §34.4 — is content moving? */}
      <Chip href={`${localePath(locale, '/admin/content')}?tab=content&status=published`}>
        <span className="font-medium tabular-nums">{stats.publishedToday}</span>
        <span className="text-muted-foreground">{copy.publishedToday}</span>
      </Chip>
    </section>
  )
}

function Chip({
  href,
  toneClass,
  children,
}: {
  href?: string
  toneClass?: string
  children: React.ReactNode
}) {
  const base = cn(
    'inline-flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-xs',
    toneClass ?? 'border-border',
    href && 'transition-colors hover:bg-accent/50',
  )
  if (href) {
    return (
      <Link href={href} className={base}>
        {children}
      </Link>
    )
  }
  return <span className={base}>{children}</span>
}
