import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary, type Locale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import Link from 'next/link'
import { getReports, getCorrections, getTrustSafetyCounts, getTrustSafetyFilteredCounts } from '@/lib/admin/queries'
import { requireCapability } from '@/lib/auth/guards'
import { PageHeader } from '@/components/admin/page-header'
import { Tabs } from '@/components/admin/tabs'
import { StatusBadge } from '@/components/admin/status-badge'
import { localizeStatus, localizeReportType } from '@/lib/admin/labels'
import { DataTable } from '@/components/admin/data-table'
import { EmptyState } from '@/components/admin/empty-state'
import { Pager } from '@/components/admin/pager'
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
  searchParams: Promise<{ tab?: string; status?: string; page?: string }>
}) {
  const locale = await getRequestLocale()
  await requireCapability('moderate', '/admin/dashboard')
  const dict = getDictionary(locale)
  const t = dict.admin.trustSafety
  const tc = dict.admin.common

  const params = await searchParams
  const tab = params.tab === 'corrections' ? 'corrections' : 'reports'
  const status = (STATUS_KEYS as readonly string[]).includes(params.status ?? '') ? (params.status as StatusKey) : 'all'
  const PAGE_SIZE = 20
  const rawPage = Number(params.page ?? '1')
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
  const offset = (page - 1) * PAGE_SIZE

  const [reports, corrections, totals, filtered] = await Promise.all([
    getReports({ status: status === 'all' ? 'all' : status, limit: PAGE_SIZE, offset, locale }),
    getCorrections({ status: status === 'all' ? 'all' : status, limit: PAGE_SIZE, offset, locale }),
    getTrustSafetyCounts(),
    getTrustSafetyFilteredCounts(status),
  ])

  const base = localePath(locale, '/admin/trust-safety')
  const hrefFor = (key: string) => `${base}?tab=${key}&status=${status}`
  const pageHref = (p: number) => `${base}?tab=${tab}&status=${status}&page=${p}`

  return (
    <div className="space-y-5">
      <PageHeader title={t.title} description={t.description} />

      <Tabs
        tabs={[
          { key: 'reports', label: t.tabReports, count: totals.reports },
          { key: 'corrections', label: t.tabCorrections, count: totals.corrections },
        ]}
        active={tab}
        hrefFor={hrefFor}
      />

      <div className="flex flex-wrap gap-2">
        {STATUS_KEYS.map((key) => (
          <a
            key={key}
            href={`${base}?tab=${tab}&status=${key}`}
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              status === key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {t[STATUS_LABELS[key]]}
          </a>
        ))}
      </div>

      {tab === 'reports' ? (
        reports.length === 0 ? (
          <EmptyState message={status === 'all' ? t.emptyReports : tc.emptyFiltered} />
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
                  <div className="space-y-1">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      {localizeReportType(r.reportType, dict.admin.common)}
                    </span>
                    <div className="text-sm">{r.subject ?? t.noContent}</div>
                  </div>
                ),
              },
              {
                key: 'content',
                header: t.colContent,
                render: (r) => (
                  <div className="min-w-0">
                    {r.contentItemId ? (
                      <Link
                        href={contentHref(locale, r.contentType, r.contentItemId, r.contentSlug)}
                        className="text-sm text-primary hover:underline"
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
              { key: 'status', header: t.colStatus, render: (r) => <StatusBadge status={r.status} label={localizeStatus(r.status, dict.admin.common)} /> },
              { key: 'received', header: t.colReceived, render: (r) => <time className="text-xs text-muted-foreground">{formatRelative(r.createdAt, locale)}</time> },
              { key: 'actions', header: '', render: (r) => <ReportActions report={r} copy={t} common={dict.admin.common} locale={locale} />, className: 'text-right' },
            ]}
          />
          <div className="mt-4">
            <Pager page={page} pageSize={PAGE_SIZE} total={filtered.reports} hrefFor={pageHref} copy={tc} />
          </div>
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
                  <div className="min-w-0">
                    <Link
                      href={contentHref(locale, r.contentType, r.contentItemId, r.contentSlug)}
                      className="text-sm text-primary hover:underline"
                    >
                      {r.contentTitle ?? r.contentItemId}
                    </Link>
                    <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">{r.correctionText}</p>
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
                  <div className="text-xs text-muted-foreground">
                    {r.reporterName ?? t.anonymous}
                    {r.reporterEmail && <div>{r.reporterEmail}</div>}
                  </div>
                ),
              },
              { key: 'status', header: t.colStatus, render: (r) => <StatusBadge status={r.status} label={localizeStatus(r.status, dict.admin.common)} /> },
              { key: 'received', header: t.colReceived, render: (r) => <time className="text-xs text-muted-foreground">{formatRelative(r.createdAt, locale)}</time> },
            { key: 'actions', header: '', render: (r) => <CorrectionActions correction={r} copy={t} />, className: 'text-right' },
          ]}
        />
        <div className="mt-4">
          <Pager page={page} pageSize={PAGE_SIZE} total={filtered.corrections} hrefFor={pageHref} copy={tc} />
        </div>
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