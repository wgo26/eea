import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getEmergencyConsole } from '@/lib/admin/actions/emergency'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { DataTable, type Column } from '@/components/admin/data-table'
import { formatDateTime, formatRelative } from '@/lib/admin/format'
import { EmergencyPublishForm } from './emergency-publish-form'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.emergency.title }
}

export default async function Page() {
  const locale = await getRequestLocale()
  await requireCapability('manageContent', '/admin/emergency')
  const dict = getDictionary(locale)
  const t = dict.admin.emergency

  const { presets, events } = await getEmergencyConsole()

  const eventColumns: Column<(typeof events)[number]>[] = [
    {
      key: 'notice',
      header: t.colNotice,
      render: (r) => (
        <div className="min-w-[180px]">
          <Link href={localePath(locale, `/admin/content?edit=${r.contentItemId}`)} className="text-sm font-medium hover:underline">
            {r.contentTitle ?? r.contentItemId.slice(0, 8)}
          </Link>
          <div className="font-mono text-xs text-muted-foreground/70">{r.severity}</div>
        </div>
      ),
    },
    {
      key: 'preset',
      header: t.colPreset,
      render: (r) => <span className="text-xs">{r.presetName ?? '—'}</span>,
      className: 'hidden md:table-cell',
    },
    {
      key: 'by',
      header: t.colBy,
      render: (r) => <span className="text-xs">{r.actorName ?? '—'}</span>,
      className: 'hidden md:table-cell',
    },
    {
      key: 'when',
      header: t.colWhen,
      render: (r) => (
        <div className="text-xs whitespace-nowrap">
          <div className="font-medium">{r.createdAt ? formatDateTime(r.createdAt, locale) : '—'}</div>
          <div className="text-muted-foreground">{r.createdAt ? formatRelative(r.createdAt, locale) : ''}</div>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        description={t.description}
        breadcrumb={[
          { label: dict.admin.sidebar.dashboard, href: localePath(locale, '/admin/dashboard') },
          { label: t.title },
        ]}
      />

      <EmergencyPublishForm copy={t} common={dict.admin.common} locale={locale} presets={presets} />

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t.presetsHeading}</h2>
        {presets.length === 0 ? (
          <EmptyState message={t.presetsEmpty} />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2">
            {presets.map((p) => (
              <li key={p.id} className="rounded-lg border border-border bg-card p-3">
                <div className="text-sm font-medium">{p.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {p.contentType}{p.requiresTwoPerson ? ` · ${t.requiresTwoPerson}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t.recentHeading}</h2>
        <DataTable rows={events} rowKey={(r) => r.id} columns={eventColumns} emptyState={<EmptyState message={t.eventsEmpty} />} />
      </section>
    </div>
  )
}
