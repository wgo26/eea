import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getTranslationCoverage, getTranslationJobs, type TranslationStatus } from '@/lib/admin/actions/translations'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { DataTable, type Column } from '@/components/admin/data-table'
import { StatusBadge } from '@/components/admin/status-badge'
import { formatDateTime } from '@/lib/admin/format'
import { TranslationBulkCreate, TranslationJobCreateForm, TranslationJobRowActions } from './translation-forms'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.translations.title }
}

const STATUSES: TranslationStatus[] = ['pending', 'in_progress', 'completed', 'failed']

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const locale = await getRequestLocale()
  await requireCapability('manageContent', '/admin/translations')
  const dict = getDictionary(locale)
  const t = dict.admin.translations

  const params = await searchParams
  const status = (STATUSES as string[]).includes(params.status ?? '') ? (params.status as TranslationStatus) : undefined

  const [jobs, coverage] = await Promise.all([getTranslationJobs(status), getTranslationCoverage(50)])

  const base = localePath(locale, '/admin/translations')
  const jobColumns: Column<(typeof jobs)[number]>[] = [
    {
      key: 'content',
      header: t.colContent,
      render: (r) => (
        <div className="min-w-[160px]">
          <div className="text-sm font-medium">{r.contentTitle ?? r.contentItemId.slice(0, 8)}</div>
          <div className="font-mono text-xs text-muted-foreground/70">{r.sourceLocale.toUpperCase()} → {r.targetLocale.toUpperCase()}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: t.colStatus,
      render: (r) => <StatusBadge status={r.status} label={t.status[r.status]} />,
      className: 'whitespace-nowrap',
    },
    {
      key: 'people',
      header: `${t.colTranslator} / ${t.colReviewer}`,
      render: (r) => (
        <div className="text-xs">
          <div>{r.translatorName ?? '—'}</div>
          <div className="text-muted-foreground">{r.reviewerName ?? '—'}</div>
        </div>
      ),
      className: 'hidden md:table-cell',
    },
    {
      key: 'updated',
      header: t.colUpdated,
      render: (r) => <span className="text-xs whitespace-nowrap">{r.completedAt ?? r.createdAt ? formatDateTime((r.completedAt ?? r.createdAt) as string, locale) : '—'}</span>,
    },
    {
      key: 'actions',
      header: '',
      render: (r) => <TranslationJobRowActions copy={t} job={r} />,
      className: 'text-right',
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

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">{t.createHeading}</h2>
        <TranslationJobCreateForm copy={t} common={dict.admin.common} />
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">{t.jobsHeading}</h2>
          <form method="GET" className="flex items-center gap-1.5">
            <select name="status" defaultValue={params.status ?? ''} aria-label={t.colStatus} className={selectCls}>
              <option value="">{t.filterAll}</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{t.status[s]}</option>
              ))}
            </select>
            <button type="submit" className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium">
              {dict.admin.incidents.filter}
            </button>
          </form>
        </div>
        <DataTable rows={jobs} rowKey={(r) => r.id} columns={jobColumns} emptyState={<EmptyState message={t.empty} />} />
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-medium">{t.coverageHeading}</h2>
          <TranslationBulkCreate copy={t} common={dict.admin.common} />
        </div>
        <DataTable
          rows={coverage}
          rowKey={(r) => r.contentItemId}
          columns={[
            {
              key: 'content',
              header: t.colContent,
              render: (r) => <span className="text-sm">{r.title ?? r.contentItemId.slice(0, 8)}</span>,
            },
            {
              key: 'locales',
              header: t.colLocales,
              render: (r) => <span className="text-xs">{r.locales.map((l) => l.toUpperCase()).join(', ') || '—'}</span>,
            },
            {
              key: 'missing',
              header: t.colMissing,
              render: (r) => <span className="text-xs font-medium text-amber-700">{r.missing.map((l) => l.toUpperCase()).join(', ') || '—'}</span>,
            },
          ]}
          emptyState={<EmptyState message={t.coverageEmpty} />}
        />
      </section>
    </div>
  )
}
