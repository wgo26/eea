import { fillCopy } from '@/lib/admin/format'
import type { AlertSeverity, OperationalAlert } from '@/lib/admin/queries/dashboard'
import type { Dictionary } from '@/lib/i18n'

type Common = Dictionary['admin']['common']

/**
 * Severity names, reused by every surface that ranks urgency (the state
 * ladder's table, the dashboard's operational alerts). One alias so the
 * dashboard components can take a narrow copy prop without repeating the
 * dictionary path.
 */
export type SeverityCopy = Dictionary['admin']['statesPage']['severity']

/**
 * The operational-alert copy the shell and the dashboard widget share. Keeping
 * it as one Pick means an alert can only ever be renamed in one place; a second
 * `topbar.alert*` block would drift from `dashboard.alert*` within a release.
 */
export type AlertCopy = Pick<
  Dictionary['admin']['dashboard'],
  | 'alertIncident'
  | 'alertSla'
  | 'alertFailedJobs'
  | 'alertFailedDeliveries'
  | 'alertOpenReports'
  | 'alertOldest'
>

/**
 * Severity → badge tone (spec §34.1). Lives in this module rather than in a
 * component because BOTH the server-rendered dashboard widget and the client
 * AppShell render it: importing a runtime value out of a Server Component would
 * pull that component's whole tree into the browser bundle.
 */
export const ALERT_SEVERITY_TONE: Record<AlertSeverity, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
}

/**
 * The sentence for one operational alert, filled from the dashboard's copy.
 *
 * Exported because two surfaces render the same alerts — the dashboard widget
 * and the AppShell's attention centre — and a per-component switch is how the
 * two start disagreeing about what "3 failed jobs" is called.
 */
export function alertLabel(alert: OperationalAlert, copy: AlertCopy): string {
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
    default:
      // An unmapped alert id must not render as blank; the raw id is the signal
      // that this switch needs a line.
      return alert.id
  }
}

/** Localized admin status label — falls back to the raw DB value. */
export function localizeStatus(status: string | null | undefined, common: Common): string {
  const s = (status ?? '').toLowerCase()
  const m = common.statuses as Record<string, string>
  if (!s) return '—'
  if (s.includes('pend') || s === 'open') return m.pending ?? status ?? '—'
  if (s.includes('clarification')) return m.pending ?? status ?? '—'
  if (s.includes('approv') || s.includes('resolved')) return m.approved ?? status ?? '—'
  if (s.includes('reject')) return m.rejected ?? status ?? '—'
  if (s.includes('publish')) return m.published ?? status ?? '—'
  if (s === 'draft') return m.draft ?? status ?? '—'
  if (s.includes('schedul')) return m.scheduled ?? status ?? '—'
  if (s.includes('investigat')) return m.investigating ?? status ?? '—'
  if (s === 'active') return m.active ?? status ?? '—'
  if (s === 'inactive' || s.includes('expired') || s === 'ended' || s === 'dismissed') {
    if (s.includes('expired')) return m.expired ?? status ?? '—'
    if (s === 'ended') return m.ended ?? status ?? '—'
    if (s === 'dismissed') return m.dismissed ?? status ?? '—'
    return m.inactive ?? status ?? '—'
  }
  if (s === 'closed') return m.closed ?? status ?? '—'
  if (s === 'sold') return m.sold ?? status ?? '—'
  if (s === 'removed') return m.removed ?? status ?? '—'
  if (s === 'paused') return m.paused ?? status ?? '—'
  if (s.includes('archiv')) return m.archived ?? status ?? '—'
  return (m as Record<string, string>)[s] ?? status ?? '—'
}

/** Localized content-type label — falls back to raw value with underscores. */
export function localizeType(type: string | null | undefined, common: Common): string {
  if (!type) return '—'
  const m = common.types as Record<string, string>
  return m[type] ?? type.replace(/_/g, ' ')
}

/** Localized report-type label. */
export function localizeReportType(reportType: string | null | undefined, common: Common): string {
  if (!reportType) return '—'
  const m = common.reportTypes as Record<string, string>
  return m[reportType] ?? reportType.replace(/_/g, ' ')
}

/** Localized data-request type label (policies inbox). */
export function localizeRequestType(
  requestType: string | null | undefined,
  requestTypes: Record<string, string>,
): string {
  if (!requestType) return '—'
  return requestTypes[requestType] ?? requestType.replace(/_/g, ' ')
}

/** Localized payout-method label. */
export function localizePayoutMethod(method: string | null | undefined, common: Common): string {
  if (!method) return common.payoutMethods ? '' : ''
  const m = (common as { payoutMethods?: Record<string, string> }).payoutMethods ?? {}
  return m[method] ?? method
}
