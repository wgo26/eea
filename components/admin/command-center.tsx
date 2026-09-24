import Link from 'next/link'

import { EmptyState } from '@/components/admin/empty-state'
import { fillCopy } from '@/lib/admin/format'
import type { SeverityCopy } from '@/lib/admin/labels'
import type { AlertSeverity, OperationalAlert, PrioritizedAction } from '@/lib/admin/queries'
import { localePath } from '@/lib/i18n/urls'
import type { Dictionary, Locale } from '@/lib/i18n'

type Copy = Pick<
  Dictionary['admin']['dashboard'],
  | 'alertsHeading'
  | 'alertsClear'
  | 'alertIncident'
  | 'alertSla'
  | 'alertFailedJobs'
  | 'alertFailedDeliveries'
  | 'alertOpenReports'
  | 'alertOldest'
  | 'nextActions'
  | 'actionsClear'
  | 'actionResolveIncident'
  | 'actionRestoreHealth'
  | 'actionClearSlaBacklog'
  | 'actionReviewSubmissions'
  | 'actionTriageReports'
  | 'actionClearFailedJobs'
  | 'actionScheduleDrafts'
  | 'actionPublishDrafts'
>

const severityTone: Record<AlertSeverity, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
}

/**
 * Phase 4.4 (spec §34.1 + §34.5) — the two questions the counters cannot answer:
 * what is on fire, and what to do about it.
 *
 * Both panels are pure renderers over facts the page has already read
 * (`getOperationalAlerts` / `getPrioritizedActions`), so this component adds no
 * queries and stays server-rendered: the ranking is data, and rendering it must
 * never disagree with what the queries decided. Both lists empty themselves
 * when the underlying queues clear — there is no acknowledge step to drift.
 *
 * The alert row's target comes pre-built and locale-free from the query layer;
 * `localePath` is applied here, at the only place that knows the active locale.
 */
export function CommandCenter({
  alerts,
  actions,
  copy,
  severity,
  locale,
}: {
  alerts: OperationalAlert[]
  actions: PrioritizedAction[]
  copy: Copy
  severity: SeverityCopy
  locale: Locale
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title={copy.alertsHeading}>
        {alerts.length === 0 ? (
          <EmptyState message={copy.alertsClear} />
        ) : (
          <ul className="space-y-1">
            {alerts.map((alert) => (
              <li key={alert.id}>
                <Link
                  href={localePath(locale, alert.href)}
                  className="-mx-1.5 flex items-start gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent/50"
                >
                  <span
                    className={`mt-0.5 inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${severityTone[alert.severity]}`}
                  >
                    {severity[alert.severity]}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">
                    {alertLabel(alert, copy)}
                    {alert.oldestHours != null && (
                      <span className="ml-1.5 text-xs text-muted-foreground">
                        {fillCopy(copy.alertOldest, { hours: alert.oldestHours })}
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={copy.nextActions}>
        {actions.length === 0 ? (
          <EmptyState message={copy.actionsClear} />
        ) : (
          <ol className="space-y-1">
            {actions.slice(0, 6).map((action) => (
              <li key={action.id}>
                <Link
                  href={localePath(locale, action.href)}
                  className="-mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent/50"
                >
                  <span
                    className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium ${severityTone[action.severity]}`}
                  >
                    {severity[action.severity]}
                  </span>
                  <span className="min-w-0 flex-1 text-sm">{actionLabel(action, copy)}</span>
                  <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-muted-foreground">
                    {action.count}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Panel>
    </div>
  )
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <h2 className="border-b border-border px-3 py-2 text-sm font-medium text-foreground">{title}</h2>
      <div className="p-3">{children}</div>
    </section>
  )
}

function alertLabel(alert: OperationalAlert, copy: Copy): string {
  switch (alert.id) {
    case 'incident':
      return copy.alertIncident
    case 'sla':
      return fillCopy(copy.alertSla, { count: alert.count })
    case 'failed-jobs':
      return fillCopy(copy.alertFailedJobs, { count: alert.count })
    case 'failed-deliveries':
      return fillCopy(copy.alertFailedDeliveries, { count: alert.count })
    case 'open-reports':
      return fillCopy(copy.alertOpenReports, { count: alert.count })
  }
}

function actionLabel(action: PrioritizedAction, copy: Copy): string {
  switch (action.id) {
    case 'resolve-incident':
      return copy.actionResolveIncident
    case 'restore-health':
      return copy.actionRestoreHealth
    case 'clear-sla-backlog':
      return copy.actionClearSlaBacklog
    case 'review-submissions':
      return copy.actionReviewSubmissions
    case 'triage-reports':
      return copy.actionTriageReports
    case 'clear-failed-jobs':
      return copy.actionClearFailedJobs
    case 'schedule-drafts':
      return copy.actionScheduleDrafts
    case 'publish-drafts':
      return copy.actionPublishDrafts
  }
}
