import Link from 'next/link'

import { fillCopy, formatBytes, formatDate, formatRelative } from '@/lib/admin/format'
import { localizeStatus, localizeType, type SeverityCopy } from '@/lib/admin/labels'
import type {
  DashboardStats,
  OperationalAlert,
  PublishingActivity,
  SystemHealth,
} from '@/lib/admin/queries'
import { isEducationWidget, type WidgetId } from '@/lib/admin/widget-layout'
import type { ComponentStatus, SystemStatus } from '@/lib/observability/metrics'
import { localePath } from '@/lib/i18n/urls'
import type { Dictionary, Locale } from '@/lib/i18n'

type Common = Dictionary['admin']['common']

/**
 * Phase 4.4 (spec §35) — the widget registry.
 *
 * The registry is the *render* half of the widget vocabulary: one body per id
 * in `lib/admin/widget-layout.ts`, plus the card title each one wears. Bodies
 * are pure server renderers over data the page has already read, so adding a
 * widget costs a switch case and never a query on the render path.
 *
 * The board around them (order, add, remove, reset) is client state and lives
 * in `widget-board.tsx`; this file never imports it, so the seasonal widgets in
 * `widget-education.tsx` can reuse its primitives without a cycle.
 */
export type WidgetCopy = Pick<
  Dictionary['admin']['dashboard'],
  | 'pending'
  | 'hintAwaitingReview'
  | 'viewAll'
  | 'drafts'
  | 'scheduled'
  | 'publishedToday'
  | 'pendingByType'
  | 'queueEmpty'
  | 'notices'
  | 'activeListings'
  | 'expiringSoon'
  | 'activeAds'
  | 'photoStories'
  | 'storageUsed'
  | 'healthOperational'
  | 'healthDegraded'
  | 'healthDown'
  | 'healthUnknown'
  | 'healthComponents'
  | 'healthComponentNames'
  | 'healthQueue'
  | 'healthFailed'
  | 'healthErrorRate'
  | 'healthChecked'
  | 'noIncident'
  | 'openIncidentConsole'
  | 'alertOldest'
  | 'noActivity'
  | 'publishedLast14'
  | 'widgetPendingSubmissions'
  | 'widgetEditorialQueue'
  | 'widgetModerationQueue'
  | 'widgetActiveNotices'
  | 'widgetMarketplace'
  | 'widgetPhotoArchive'
  | 'widgetPlatformHealth'
  | 'widgetActiveIncident'
  | 'recentActivity'
  | 'widgetPublishing'
  | 'widgetEducationStories'
  | 'widgetSchoolNotices'
  | 'widgetCommunityAlerts'
  | 'widgetUpcomingDates'
  | 'widgetEducationSubmissions'
>

/** Everything one dashboard render needs, whether or not every widget is on screen. */
export type WidgetData = {
  stats: DashboardStats
  alerts: OperationalAlert[]
  health: SystemHealth
  activity: PublishingActivity
}

export function widgetTitles(copy: WidgetCopy): Record<WidgetId, string> {
  return {
    'pending-submissions': copy.widgetPendingSubmissions,
    'editorial-queue': copy.widgetEditorialQueue,
    'moderation-queue': copy.widgetModerationQueue,
    'active-notices': copy.widgetActiveNotices,
    'marketplace-activity': copy.widgetMarketplace,
    'photo-archive': copy.widgetPhotoArchive,
    'platform-health': copy.widgetPlatformHealth,
    'active-incident': copy.widgetActiveIncident,
    'recent-activity': copy.recentActivity,
    'publishing-calendar': copy.widgetPublishing,
    'education-stories': copy.widgetEducationStories,
    'school-notices': copy.widgetSchoolNotices,
    'community-alerts': copy.widgetCommunityAlerts,
    'upcoming-dates': copy.widgetUpcomingDates,
    'education-submissions': copy.widgetEducationSubmissions,
  }
}

/**
 * The ten base widget bodies. The season's five are rendered by
 * `EducationWidget` (they read the shared education snapshot instead of the
 * `WidgetData` bundle) — this returns null for them so the page can dispatch
 * on one predicate.
 */
export function WidgetBody({
  id,
  data,
  copy,
  severity,
  locale,
  common,
  systemLabel,
  deletedLabel,
}: {
  id: WidgetId
  data: WidgetData
  copy: WidgetCopy
  severity: SeverityCopy
  locale: Locale
  common: Common
  /** Audit-trail fallbacks for anonymous actors (dict.admin.audit). */
  systemLabel: string
  deletedLabel: string
}) {
  if (isEducationWidget(id)) return null

  const { stats, alerts, health, activity } = data
  const content = (query: string) => `${localePath(locale, '/admin/content')}?${query}`
  const pendingByType = (type: string) =>
    stats.pendingByType.find((row) => row.type === type)?.count ?? 0

  switch (id) {
    case 'pending-submissions':
      return (
        <div className="space-y-1.5">
          <WidgetMetric
            value={stats.pendingSubmissions}
            label={copy.pending}
            href={`${localePath(locale, '/admin/moderation')}?status=pending`}
          />
          <p className="text-xs text-muted-foreground">{copy.hintAwaitingReview}</p>
        </div>
      )

    case 'editorial-queue':
      return (
        <div className="space-y-0.5">
          <WidgetRow
            label={copy.drafts}
            value={stats.draftCount}
            href={content('tab=content&status=draft')}
          />
          <WidgetRow
            label={copy.scheduled}
            value={stats.scheduled}
            href={content('tab=content&status=scheduled')}
          />
          <WidgetRow
            label={copy.publishedToday}
            value={stats.publishedToday}
            href={content('tab=content&status=published')}
          />
        </div>
      )

    case 'moderation-queue':
      return stats.pendingByType.length === 0 ? (
        <p className="text-xs text-muted-foreground">{copy.queueEmpty}</p>
      ) : (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {stats.pendingByType.map((item) => (
              <Link
                key={item.type}
                href={`${localePath(locale, '/admin/moderation')}?status=pending&type=${item.type}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2 py-0.5 text-xs transition-colors hover:bg-accent"
              >
                <span>{localizeType(item.type, common)}</span>
                <span className="font-medium tabular-nums">{item.count}</span>
              </Link>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">{copy.pendingByType}</p>
        </div>
      )

    case 'active-notices':
      return (
        <div className="space-y-0.5">
          <WidgetMetric
            value={stats.totalNotices}
            label={copy.notices}
            href={content('tab=content&type=notice')}
          />
          <WidgetRow
            label={copy.pending}
            value={pendingByType('notice')}
            href={`${localePath(locale, '/admin/moderation')}?status=pending&type=notice`}
          />
        </div>
      )

    case 'marketplace-activity':
      return (
        <div className="space-y-0.5">
          <WidgetRow
            label={copy.activeListings}
            value={stats.activeListings}
            href={localePath(locale, '/admin/listings')}
          />
          <WidgetRow
            label={copy.expiringSoon}
            value={stats.expiringListings}
            href={localePath(locale, '/admin/listings')}
          />
          <WidgetRow
            label={copy.activeAds}
            value={stats.activeAds}
            href={localePath(locale, '/admin/ads')}
          />
        </div>
      )

    case 'photo-archive':
      return (
        <div className="space-y-1.5">
          <WidgetMetric
            value={stats.totalStories}
            label={copy.photoStories}
            href={content('tab=content&type=photo_story')}
          />
          <div className="space-y-0.5">
            {stats.storageByProvider.map((row) => (
              <div key={row.provider} className="flex items-baseline justify-between gap-2 text-xs">
                <span className="uppercase tracking-wide text-muted-foreground">{row.provider}</span>
                <span className="tabular-nums text-foreground">{formatBytes(row.bytes)}</span>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="text-muted-foreground">{copy.storageUsed}</span>
              <span className="font-medium tabular-nums text-foreground">
                {formatBytes(stats.storageUsed)}
              </span>
            </div>
          </div>
        </div>
      )

    case 'platform-health':
      return (
        <div className="space-y-2">
          <HealthBadge status={health.status} copy={copy} />
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {copy.healthComponents}
            </p>
            {health.components.map((component) => (
              <div
                key={component.id}
                className="flex items-baseline justify-between gap-2 text-xs"
              >
                <span className="text-muted-foreground">
                  {copy.healthComponentNames[component.id]}
                </span>
                <span className="tabular-nums text-foreground">
                  {healthStatusLabel(component.status, copy)}
                  {component.latencyMs != null && (
                    <span className="ml-1.5 text-muted-foreground">{component.latencyMs} ms</span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <div className="space-y-0.5 border-t border-border pt-1.5 text-xs">
            <p className="text-muted-foreground">
              {copy.healthQueue}: <span className="tabular-nums text-foreground">{health.queue.pending}</span>
              {' · '}
              {copy.healthFailed}: <span className="tabular-nums text-foreground">{health.queue.failed}</span>
            </p>
            <p className="text-muted-foreground">
              {copy.healthErrorRate}:{' '}
              <span className="tabular-nums text-foreground">{health.errorRate.ratePct}%</span>
              <span className="ml-1 tabular-nums opacity-70">
                ({health.errorRate.failedOps}/{health.errorRate.totalOps})
              </span>
            </p>
            <p className="text-muted-foreground">
              {fillCopy(copy.healthChecked, { time: formatRelative(health.checkedAt, locale) })}
            </p>
          </div>
        </div>
      )

    case 'active-incident': {
      const incident = alerts.find((alert) => alert.id === 'incident')
      if (!incident) {
        return <p className="text-xs text-muted-foreground">{copy.noIncident}</p>
      }
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                incident.severity === 'critical'
                  ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
              }`}
            >
              {severity[incident.severity === 'critical' ? 'critical' : 'warning']}
            </span>
            {incident.oldestHours != null && (
              <span className="text-xs tabular-nums text-muted-foreground">
                {fillCopy(copy.alertOldest, { hours: incident.oldestHours })}
              </span>
            )}
          </div>
          <Link
            href={localePath(locale, incident.href)}
            className="inline-block text-xs font-medium underline"
          >
            {copy.openIncidentConsole}
          </Link>
        </div>
      )
    }

    case 'recent-activity':
      return stats.recentActivity.length === 0 ? (
        <p className="text-xs text-muted-foreground">{copy.noActivity}</p>
      ) : (
        <ul className="divide-y divide-border">
          {stats.recentActivity.map((entry) => (
            <ActivityRow
              key={entry.id}
              entry={entry}
              systemLabel={systemLabel}
              deletedLabel={deletedLabel}
              common={common}
              locale={locale}
            />
          ))}
        </ul>
      )

    case 'publishing-calendar': {
      const peak = Math.max(1, ...activity.days.map((day) => day.count))
      return (
        <div className="space-y-2">
          <WidgetMetric value={activity.total} label={copy.publishedLast14} />
          <div className="flex h-12 items-end gap-0.5" role="img" aria-label={copy.publishedLast14}>
            {activity.days.map((day) => (
              <div
                key={day.date}
                title={`${formatDate(day.date, locale)} — ${day.count}`}
                className={`min-h-[2px] flex-1 rounded-sm ${day.count > 0 ? 'bg-primary/70' : 'bg-muted'}`}
                style={{ height: `${Math.round((day.count / peak) * 100)}%` }}
              />
            ))}
          </div>
          {activity.byType.length > 0 && (
            <div className="space-y-0.5">
              {activity.byType.slice(0, 4).map((row) => (
                <div key={row.type} className="flex items-baseline justify-between gap-2 text-xs">
                  <Link
                    href={`${localePath(locale, '/admin/content')}?tab=content&type=${row.type}`}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {localizeType(row.type, common)}
                  </Link>
                  <span className="tabular-nums text-foreground">{row.count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    }
  }
}

/** Shared with the seasonal widgets — a big number with an optional link. */
export function WidgetMetric({
  value,
  label,
  href,
}: {
  value: number
  label: string
  href?: string
}) {
  const inner = (
    <>
      <span className="text-2xl font-semibold tabular-nums text-foreground">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </>
  )
  return href ? (
    <Link href={href} className="flex items-baseline gap-2">
      {inner}
    </Link>
  ) : (
    <div className="flex items-baseline gap-2">{inner}</div>
  )
}

/** Shared with the seasonal widgets — a labelled row that links out. */
export function WidgetRow({
  label,
  value,
  href,
}: {
  label: string
  value: number
  href: string
}) {
  return (
    <Link
      href={href}
      className="-mx-2 flex items-baseline justify-between gap-2 rounded-md px-2 py-1 transition-colors hover:bg-accent/50"
    >
      <span className="min-w-0 truncate text-xs text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold tabular-nums">{value}</span>
    </Link>
  )
}

function HealthBadge({ status, copy }: { status: SystemStatus; copy: WidgetCopy }) {
  const tone =
    status === 'healthy'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200'
      : status === 'degraded'
        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
        : status === 'unavailable'
          ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200'
          : 'bg-muted text-muted-foreground'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>
      {healthStatusLabel(status, copy)}
    </span>
  )
}

function healthStatusLabel(status: SystemStatus | ComponentStatus, copy: WidgetCopy): string {
  switch (status) {
    case 'healthy':
    case 'operational':
      return copy.healthOperational
    case 'degraded':
      return copy.healthDegraded
    case 'unavailable':
    case 'down':
      return copy.healthDown
    default:
      return copy.healthUnknown
  }
}

function ActivityRow({
  entry,
  systemLabel,
  deletedLabel,
  common,
  locale,
}: {
  entry: DashboardStats['recentActivity'][number]
  systemLabel: string
  deletedLabel: string
  common: Common
  locale: Locale
}) {
  const actor = entry.actorName ?? (entry.actorId ? deletedLabel : systemLabel)
  return (
    <li className="flex items-start gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{actor}</span>{' '}
          <span className="text-muted-foreground">{localizeStatus(entry.action, common)}</span>
          {entry.contentTitle && (
            <>
              {' '}
              · <span className="font-medium">
                {entry.contentType ? localizeType(entry.contentType, common) : ''}
              </span>{' '}
              &ldquo;{entry.contentTitle}&rdquo;
            </>
          )}
        </p>
        {entry.notes && <p className="mt-0.5 text-xs text-muted-foreground truncate">{entry.notes}</p>}
      </div>
      <time className="text-xs whitespace-nowrap text-muted-foreground">
        {formatRelative(entry.createdAt, locale)}
      </time>
    </li>
  )
}
