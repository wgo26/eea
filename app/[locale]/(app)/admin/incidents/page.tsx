import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getIncidents, type IncidentRow, type IncidentStatus } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { DataTable, type Column } from '@/components/admin/data-table'
import { Pager } from '@/components/admin/pager'
import { StatusBadge } from '@/components/admin/status-badge'
import { formatDateTime, formatRelative } from '@/lib/admin/format'
import { stateToneClasses } from '@/lib/platform/state-presentation'
import { IncidentCreateForm } from './incident-create-form'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.incidents.title }
}

const PAGE_SIZE = 20

const STATUSES: IncidentStatus[] = ['investigating', 'identified', 'mitigating', 'monitoring', 'resolved']
const SEVERITIES = ['info', 'warning', 'critical'] as const

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string; status?: string; severity?: string; page?: string }>
}) {
  const locale = await getRequestLocale()
  await requireCapability('incidents.manage', '/admin/incidents')
  const dict = getDictionary(locale)
  const t = dict.admin.incidents

  const params = await searchParams
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)
  const status = (STATUSES as string[]).includes(params.status ?? '') ? params.status : undefined
  const severity = (SEVERITIES as readonly string[]).includes(params.severity ?? '') ? params.severity : undefined

  const { rows, total, openCount } = await getIncidents({ limit: PAGE_SIZE, page, status, severity })
  const open = rows.filter((r) => r.open)
  const closed = rows.filter((r) => !r.open)

  const base = localePath(locale, '/admin/incidents')
  const qs = (p: number) => {
    const sp = new URLSearchParams()
    if (status) sp.set('status', status)
    if (severity) sp.set('severity', severity)
    sp.set('page', String(p))
    return `${base}?${sp.toString()}`
  }

  const detailHref = (id: string) => localePath(locale, `/admin/incidents/${id}`)

  const columns: Column<IncidentRow>[] = [
    {
      key: 'incident',
      header: t.colIncident,
      render: (r) => (
        <div className="min-w-[180px]">
          <Link href={detailHref(r.id)} className="text-sm font-medium hover:underline">
            {r.title}
          </Link>
          <div className="font-mono text-xs text-muted-foreground/70">{r.ref}</div>
        </div>
      ),
    },
    {
      key: 'severity',
      header: t.colSeverity,
      render: (r) => (
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${stateToneClasses(r.severity).pill}`}>
          {t.severities[r.severity]}
        </span>
      ),
      className: 'whitespace-nowrap',
    },
    {
      key: 'status',
      header: t.colStatus,
      render: (r) => <StatusBadge status={r.currentStatus} label={t.status[r.currentStatus]} />,
      className: 'whitespace-nowrap',
    },
    {
      key: 'started',
      header: t.colStarted,
      render: (r) => (
        <div className="text-xs whitespace-nowrap">
          <div className="font-medium">{formatDateTime(r.startTime, locale)}</div>
          <div className="text-muted-foreground">{formatRelative(r.startTime, locale)}</div>
        </div>
      ),
    },
    {
      key: 'owner',
      header: t.colOwner,
      render: (r) => <span className="text-xs">{r.owner ?? '—'}</span>,
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell',
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <Link href={detailHref(r.id)} className="text-xs font-medium text-primary hover:underline whitespace-nowrap">
          {t.view}
        </Link>
      ),
      className: 'text-right whitespace-nowrap',
    },
  ]

  const selectCls = 'rounded-md border border-border bg-background px-2.5 py-1.5 text-xs'

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

      <IncidentCreateForm copy={t} common={dict.admin.common} locale={locale} />

      <form method="GET" className="flex flex-wrap items-center gap-1.5">
        <select name="status" defaultValue={params.status ?? ''} aria-label={t.colStatus} className={selectCls}>
          <option value="">{t.allStatuses}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{t.status[s]}</option>
          ))}
        </select>
        <select name="severity" defaultValue={params.severity ?? ''} aria-label={t.colSeverity} className={selectCls}>
          <option value="">{t.allSeverities}</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>{t.severities[s]}</option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium">
          {t.filter}
        </button>
      </form>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">
          {t.openHeading}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {t.openCount.replace('{count}', String(openCount))}
          </span>
        </h2>
        <DataTable
          rows={open}
          rowKey={(r) => r.id}
          columns={columns}
          emptyState={<EmptyState message={t.emptyOpen} />}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t.recentHeading}</h2>
        <DataTable
          rows={closed}
          rowKey={(r) => r.id}
          columns={columns}
          emptyMessage={t.empty}
        />
      </section>

      <Pager page={page} pageSize={PAGE_SIZE} total={total} hrefFor={qs} copy={dict.admin.common} />
    </div>
  )
}
