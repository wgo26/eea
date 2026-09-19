import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary, type Locale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import Link from 'next/link'
import { getReports, getCorrections, getTrustSafetyCounts, getTrustSafetyFilteredCounts } from '@/lib/admin/queries'
import { requireCapability } from '@/lib/auth/guards'
import { PageHeader } from '@/components/admin/page-header'
import { Tabs } from '@/components/admin/tabs'
import { FilterPills } from '@/components/admin/filter-pills'
import { StatusBadge } from '@/components/admin/status-badge'
import { localizeStatus, localizeReportType } from '@/lib/admin/labels'
import { DataTable } from '@/components/admin/data-table'
import { EmptyState } from '@/components/admin/empty-state'
import { Pager } from '@/components/admin/pager'
import { SearchBar } from '@/components/admin/filter-pills'
import { formatRelative } from '@/lib/admin/format'
import { ReportActions, CorrectionActions } from './trust-safety-actions'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.trustSafety.title }
}

const STATUS_KEYS = ['all', 'open', 'investigating', 'resolved', 'dismissed'] as const
type StatusKey = (typeof STATUS_KEYS)[number]

const STATUS_LABELS: Record<StatusKey, keyof ReturnType<typeof getDictionary>['admin']['trustSafety']> = {
  all: 'statusAll',
  open: 'statusOpen',
  investigating: 'statusInvestigating',
  resolved: 'statusResolved',
  dismissed: 'statusDismissed',
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; status?: string; q?: string; page?: string }>
}) {
  const locale = await getRequestLocale()
  await requireCapability('moderate', '/admin/dashboard')
  const dict = getDictionary(locale)
  const t = dict.admin.trustSafety
  const tc = dict.admin.common

  const params = await searchParams
  const tab = params.tab === 'corrections' ? 'corrections' : 'reports'
  const status = (STATUS_KEYS as readonly string[]).includes(params.status ?? '') ? (params.status as StatusKey) : 'all'
  const search = params.q?.trim() || undefined
  const PAGE_SIZE = 20
  const rawPage = Number(params.page ?? '1')
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
  const offset = (page - 1) * PAGE_SIZE

  const [reports, corrections, totals] = await Promise.all([
    getReports({ status: status === 'all' ? 'all' : status, limit: PAGE_SIZE, offset, search, locale }),
    getCorrections({ status: status === 'all' ? 'all' : status, limit: PAGE_SIZE, offset, search, locale }),
    getTrustSafetyCounts(),
  ])

  const qs = search ? `&q=${encodeURIComponent(search)}` : ''
  const base = localePath(locale, '/admin/trust-safety')
  const hrefFor = (key: string) => `${base}?tab=${key}&status=${status}${qs}`
  const pageHref = (p: number) => `${base}?tab=${tab}&status=${status}${qs}&page=${p}`

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

      <Tabs
        tabs={[
          { key: 'reports', label: t.tabReports, count: totals.reports },
          { key: 'corrections', label: t.tabCorrections, count: totals.corrections },
        ]}
        active={tab}
        hrefFor={hrefFor}
      />

      <FilterPills
        pills={STATUS_KEYS.map((key) => ({
          key,
          label: t[STATUS_LABELS[key]],
          href: `${base}?tab=${tab}&status=${key}`,
        }))}
        active={status}
      />

      <div className="mt-3 flex items-center gap-2">
        <SearchBar
          name="q"
          defaultValue={search}
          placeholder={tc.searchPlaceholder ?? 'Search reports…'}
          action={`${base}?tab=${tab}&status=${status}`}
        />
      </div>

      {tab === 'reports' ? (
        reports.length === 0 ? (
          <EmptyState
            message={status === 'all' ? t.emptyReports : tc.emptyFiltered}
            secondaryAction={
              <Link
                href={localePath(locale, '/admin/trust-safety')}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {tc.clearFilters}
              </Link>
            }
          />
        ) : (
          <>
          <DataTable
            rows={reports}
            rowKey={(r) => r.id}
            columns={[
              {
                key: 'type',
                header: t.colType,
                render: (r) => (
                  <div className="space-y-1 min-w-[120px] max-w-[220px]">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {localizeReportType(r.reportType, dict.admin.common)}
                    </span>
                    <div className="text-sm truncate">{r.subject ?? t.noContent}</div>
                  </div>
                ),
              },
              {
                key: 'content',
                header: t.colContent,
                render: (r) => (
                  <div className="min-w-[140px] max-w-[240px]">
                    {r.contentItemId ? (
                      <Link
                        href={contentHref(locale, r.contentType, r.contentItemId, r.contentSlug)}
                        className="block truncate text-sm text-primary hover:underline"
                      >
                        {r.contentTitle ?? r.contentItemId}
                      </Link>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t.noContent}</span>
                    )}
                    {r.missingLocale && (
                      <div className="mt-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        {t.missingTranslation}
                      </div>
                    )}
                  </div>
                ),
              },
              { key: 'status', header: t.colStatus, render: (r) => <StatusBadge status={r.status} label={localizeStatus(r.status, dict.admin.common)} />, className: 'whitespace-nowrap' },
              { key: 'received', header: t.colReceived, render: (r) => <time className="text-xs text-muted-foreground whitespace-nowrap">{formatRelative(r.createdAt, locale)}</time>, headerClassName: 'hidden md:table-cell', className: 'hidden md:table-cell whitespace-nowrap' },
              { key: 'actions', header: '', stickyRight: true, render: (r) => <ReportActions report={r} copy={t} common={dict.admin.common} locale={locale} />, className: 'text-right' },
            ]}
          />
          <Pager page={page} pageSize={PAGE_SIZE} total={totals.reports} hrefFor={pageHref} copy={tc} />
          </>
        )
      ) : corrections.length === 0 ? (
        <EmptyState message={status === 'all' ? t.emptyCorrections : tc.emptyFiltered} />
      ) : (
        <>
        <DataTable
          rows={corrections}
          rowKey={(r) => r.id}
          columns={[
            {
                key: 'content',
                header: t.colContent,
                render: (r) => (
                  <div className="min-w-[160px] max-w-[280px]">
                    <Link
                      href={contentHref(locale, r.contentType, r.contentItemId, r.contentSlug)}
                      className="block truncate text-sm text-primary hover:underline"
                    >
                      {r.contentTitle ?? r.contentItemId}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2 break-words">{r.correctionText}</p>
                    {r.missingLocale && (
                      <div className="mt-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        {t.missingTranslation}
                      </div>
                    )}
                  </div>
                ),
              },
              {
                key: 'reporter',
                header: t.reporterLabel,
                render: (r) => (
                  <div className="text-xs text-muted-foreground max-w-[160px]">
                    <div className="truncate">{r.reporterName ?? t.anonymous}</div>
                    {r.reporterEmail && <div className="truncate">{r.reporterEmail}</div>}
                  </div>
                ),
                headerClassName: 'hidden md:table-cell',
                className: 'hidden md:table-cell',
              },
              { key: 'status', header: t.colStatus, render: (r) => <StatusBadge status={r.status} label={localizeStatus(r.status, dict.admin.common)} />, className: 'whitespace-nowrap' },
              { key: 'received', header: t.colReceived, render: (r) => <time className="text-xs text-muted-foreground whitespace-nowrap">{formatRelative(r.createdAt, locale)}</time>, headerClassName: 'hidden md:table-cell', className: 'hidden md:table-cell whitespace-nowrap' },
            { key: 'actions', header: '', stickyRight: true, render: (r) => <CorrectionActions correction={r} copy={t} />, className: 'text-right' },
          ]}
        />
        <Pager page={page} pageSize={PAGE_SIZE} total={totals.corrections} hrefFor={pageHref} copy={tc} />
        </>
      )}
    </div>
  )
}

/** Public detail path for reported content, mirroring the moderation screen. */
function contentHref(locale: Locale, type: string | null, id: string, slug: string | null): string {
  switch (type) {
    case 'photo_story':
      return localePath(locale, `/photo-stories/${slug ?? id}`)
    case 'culture':
      return localePath(locale, `/culture/${slug ?? id}`)
    case 'notice':
      return localePath(locale, `/notices/${id}`)
    case 'listing':
      return localePath(locale, `/buy-sell/${id}`)
    default:
      return localePath(locale, `/news/${slug ?? id}`)
  }
}