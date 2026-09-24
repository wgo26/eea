import Link from 'next/link'
import { cn } from '@/lib/utils'
import type { Dictionary, Locale } from '@/lib/i18n'
import { formatDateTime } from '@/lib/admin/format'
import { stateToneClasses, type StateTone } from '@/lib/platform/state-presentation'

export type StateBannerIncident = {
  /** Display reference, e.g. `INC-2026-1A2B3C`. */
  ref: string
  title: string
  description?: string | null
  owner?: string | null
  startedAt?: string | null
  updatedAt?: string | null
  /** Detail page — omitted when the viewer cannot manage incidents. */
  href?: string
}

const ACTION_PRIMARY =
  'inline-flex min-h-[32px] items-center rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90'
const ACTION_SECONDARY =
  'inline-flex min-h-[32px] items-center rounded-md border border-border bg-card px-3 py-1 text-xs font-medium transition-colors hover:bg-accent'

/**
 * Persistent state banner (spec §26). Rendered by the admin layout above the
 * content for every non-NORMAL state, so the operator always sees what the
 * platform is in, what happened, who owns it and what they can do — without
 * navigating anywhere (spec §21: atmosphere never replaces information; §33:
 * the region is announced, never colour-coded alone).
 */
export function StateBanner({
  locale,
  stateName,
  tone,
  incident,
  controlsHref,
  labels,
}: {
  locale: Locale
  stateName: string
  tone: StateTone | string
  incident: StateBannerIncident | null
  /** Omitted when the viewer holds no capability the controls page accepts. */
  controlsHref?: string
  labels: Dictionary['admin']['states']
}) {
  const toneClasses = stateToneClasses(tone)
  const started = incident?.startedAt ? formatDateTime(incident.startedAt, locale) : null
  const updated = incident?.updatedAt ? formatDateTime(incident.updatedAt, locale) : null
  const meta = [
    started ? { key: 'started', label: labels.started, value: started } : null,
    updated ? { key: 'updated', label: labels.updated, value: updated } : null,
    incident?.owner ? { key: 'owner', label: labels.owner, value: incident.owner } : null,
  ].flatMap((entry) => (entry ? [entry] : []))

  return (
    <section
      role="status"
      aria-live="polite"
      aria-label={labels.label}
      className={cn('border-b px-4 py-3 md:px-6', toneClasses.banner)}
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide">
            <span className={cn('h-2 w-2 shrink-0 rounded-full', toneClasses.dot)} aria-hidden />
            {labels.label}
          </div>
          <h2 className={cn('mt-1 text-lg font-semibold tracking-tight', toneClasses.heading)}>
            {stateName}
          </h2>
          {incident ? (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                {labels.incidentRef}{' '}
                <span className="font-mono font-medium text-foreground">{incident.ref}</span>
                {incident.title ? <span className="ml-1.5">· {incident.title}</span> : null}
              </p>
              <p className="mt-1.5 text-sm">
                {incident.description || labels.noDescription}
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-sm">{labels.noDescription}</p>
          )}
          {meta.length > 0 && (
            <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              {meta.map((entry) => (
                <div key={entry.key} className="flex items-center gap-1.5">
                  <dt className="font-medium">{entry.label}</dt>
                  <dd>{entry.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
        {(incident?.href || controlsHref) && (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {incident?.href && (
              <Link href={incident.href} className={ACTION_PRIMARY}>
                {labels.viewIncident}
              </Link>
            )}
            {controlsHref && (
              <Link href={controlsHref} className={ACTION_SECONDARY}>
                {labels.operationalControls}
              </Link>
            )}
          </div>
        )}      </div>
    </section>
  )
}
