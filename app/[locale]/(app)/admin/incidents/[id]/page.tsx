import { notFound } from 'next/navigation'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getApprovalForResource, getIncidentById } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { StatusBadge } from '@/components/admin/status-badge'
import { formatDateTime, formatRelative } from '@/lib/admin/format'
import { stateToneClasses } from '@/lib/platform/state-presentation'
import { IncidentConsole } from './incident-console'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.incidents.title }
}

export default async function Page({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const locale = await getRequestLocale()
  const { user } = await requireCapability('incidents.manage', '/admin/incidents')
  const dict = getDictionary(locale)
  const t = dict.admin.incidents

  const { id } = await params
  const incident = await getIncidentById(id)
  if (!incident) notFound()

  // The caller's own live critical-mode request (spec §44). Other admins'
  // requests for this incident are decided in /admin/approvals.
  const approval = await getApprovalForResource('incident.critical_mode', 'incident', id, user.id)

  const meta: { label: string; value: string }[] = [
    { label: t.refLabel, value: incident.ref },
    { label: t.colStarted, value: formatDateTime(incident.startTime, locale) },
    { label: t.createdByLabel, value: incident.creatorName ?? '—' },
    { label: t.colOwner, value: incident.owner ?? '—' },
  ]
  if (incident.resolvedAt) {
    meta.push({ label: t.resolvedAtLabel, value: formatDateTime(incident.resolvedAt, locale) })
  }
  if (incident.affectedServices.length > 0) {
    meta.push({ label: t.servicesLabel, value: incident.affectedServices.join(', ') })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={incident.title}
        description={incident.description ?? undefined}
        breadcrumb={[
          { label: dict.admin.sidebar.dashboard, href: localePath(locale, '/admin/dashboard') },
          { label: t.title, href: localePath(locale, '/admin/incidents') },
          { label: incident.ref },
        ]}
        actions={
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${stateToneClasses(incident.severity).pill}`}>
              {t.severities[incident.severity]}
            </span>
            <StatusBadge status={incident.currentStatus} label={t.status[incident.currentStatus]} />
          </div>
        }
      />

      <dl className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-3 lg:grid-cols-6">
        {meta.map((item) => (
          <div key={item.label} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{item.label}</dt>
            <dd className="truncate text-sm font-medium" title={item.value}>{item.value}</dd>
          </div>
        ))}
      </dl>

      <IncidentConsole
        incident={{
          id: incident.id,
          title: incident.title,
          severity: incident.severity,
          description: incident.description,
          affectedServices: incident.affectedServices,
          owner: incident.owner,
          currentStatus: incident.currentStatus,
          publicStatusMessage: incident.publicStatusMessage,
          internalNotes: incident.internalNotes,
        }}
        copy={t}
        common={dict.admin.common}
        approval={approval}
      />

      {incident.resolutionNotes && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium">{t.resolutionLabel}</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{incident.resolutionNotes}</p>
        </section>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="space-y-2">
          <h2 className="text-sm font-medium">{t.timelineHeading}</h2>
          {incident.timeline.length === 0 ? (
            <EmptyState message={t.noTimeline} className="p-4" />
          ) : (
            <ol className="space-y-3 rounded-lg border border-border bg-card p-4">
              {[...incident.timeline].reverse().map((entry, i) => (
                <li key={`${entry.at ?? 'entry'}-${i}`} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" aria-hidden />
                  <div className="min-w-0">
                    <p className="text-sm">{entry.note}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(entry.at, locale)}
                      {entry.by ? ` · ${entry.by}` : ''}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">{t.eventsHeading}</h2>
          {incident.events.length === 0 ? (
            <EmptyState message={t.noEvents} className="p-4" />
          ) : (
            <ul className="divide-y divide-border rounded-lg border border-border bg-card">
              {incident.events.map((event) => (
                <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span className="text-xs font-medium">
                    {event.fromStatus ? t.status[event.fromStatus] : '—'} → {event.toStatus ? t.status[event.toStatus] : '—'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {event.actorName ?? '—'} · {formatRelative(event.createdAt, locale)}
                  </span>
                  {event.note && <p className="w-full text-xs text-muted-foreground">{event.note}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
