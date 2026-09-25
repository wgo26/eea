import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { getReports, getCorrections, getTrustSafetyCounts, getTrustSafetyFilteredCounts } from '@/lib/admin/queries'
import { requireCapability } from '@/lib/auth/guards'
import { PageHeader } from '@/components/admin/page-header'
import { Tabs } from '@/components/admin/tabs'
import { FilterPills, SearchBar, ActiveFilters } from '@/components/admin/filter-pills'
import { EmptyState } from '@/components/admin/empty-state'
import { Pager } from '@/components/admin/pager'
import { TrustSafetyReportsBulk, TrustSafetyCorrectionsBulk } from './trust-safety-bulk-actions'

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

  const [reports, corrections, totals, filtered] = await Promise.all([
    getReports({ status: status === 'all' ? 'all' : status, limit: PAGE_SIZE, offset, search, locale }),
    getCorrections({ status: status === 'all' ? 'all' : status, limit: PAGE_SIZE, offset, search, locale }),
    getTrustSafetyCounts(),
    getTrustSafetyFilteredCounts(status),
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
          href: `${base}?tab=${tab}&status=${key}${qs}`,
        }))}
        active={status}
      />

      <div className="mt-3 flex items-center gap-2">
        <SearchBar
          name="q"
          defaultValue={search}
          placeholder={tc.searchPlaceholder}
          action={`${base}?tab=${tab}&status=${status}`}
        />
      </div>

      <ActiveFilters
        chips={[
          ...(status !== 'all'
            ? [{ key: 'status', label: `${t.colStatus}: ${t[STATUS_LABELS[status]]}`, removeHref: `${base}?tab=${tab}${qs}` }]
            : []),
          ...(search
            ? [{ key: 'q', label: `${tc.search}: ${search}`, removeHref: `${base}?tab=${tab}&status=${status}` }]
            : []),
        ]}
        clearAllHref={base}
        labels={tc}
      />

      {tab === 'reports' ? (
        reports.length === 0 ? (
          <EmptyState
            message={status === 'all' ? t.emptyReports : tc.emptyFiltered}
            action={
              <Link
                href={localePath(locale, '/admin/moderation')}
                className="text-xs font-medium text-primary hover:underline"
              >
                {dict.admin.sidebar.moderation}
              </Link>
            }
            secondaryAction={
              status !== 'all' || search ? (
                <Link
                  href={base}
                  className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                >
                  {tc.clearFilters}
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <TrustSafetyReportsBulk rows={reports} copy={t} common={tc} locale={locale} />
            <Pager page={page} pageSize={PAGE_SIZE} total={filtered.reports} hrefFor={pageHref} copy={tc} />
          </>
        )
      ) : corrections.length === 0 ? (
        <EmptyState
          message={status === 'all' ? t.emptyCorrections : tc.emptyFiltered}
          secondaryAction={
            status !== 'all' || search ? (
              <Link
                href={base}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {tc.clearFilters}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <TrustSafetyCorrectionsBulk rows={corrections} copy={t} common={tc} locale={locale} />
          <Pager page={page} pageSize={PAGE_SIZE} total={filtered.corrections} hrefFor={pageHref} copy={tc} />
        </>
      )}
    </div>
  )
}