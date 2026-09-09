import type { Dictionary } from '@/lib/i18n'

type Common = Dictionary['admin']['common']

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
