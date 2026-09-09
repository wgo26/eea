import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { getListingsAdmin } from '@/lib/admin/queries'
import { requireCapability } from '@/lib/auth/guards'
import { PageHeader } from '@/components/admin/page-header'
import { FilterPills, SearchBar } from '@/components/admin/filter-pills'
import { Pager } from '@/components/admin/pager'
import { EmptyState } from '@/components/admin/empty-state'
import { ListingsBulkTable } from './listings-bulk-actions'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.listingsAdmin.title }
}

const STATUS_KEYS = ['all', 'active', 'expired', 'sold', 'removed'] as const
type StatusKey = (typeof STATUS_KEYS)[number]

const STATUS_LABELS: Record<StatusKey, keyof ReturnType<typeof getDictionary>['admin']['listingsAdmin']> = {
  all: 'statusAll',
  active: 'statusActive',
  expired: 'statusExpired',
  sold: 'statusSold',
  removed: 'statusRemoved',
}

const PAGE_SIZE = 20

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string; q?: string }>
}) {
  const locale = await getRequestLocale()
  await requireCapability('manageContent', '/admin/content')
  const dict = getDictionary(locale)
  const t = dict.admin.listingsAdmin
  const tc = dict.admin.common

  const params = await searchParams
  const status = (STATUS_KEYS as readonly string[]).includes(params.status ?? '') ? (params.status as StatusKey) : 'all'
  const search = params.q || undefined
  const rawPage = Number(params.page ?? '1')
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1

  // Note: runDueContentSweep() moved to a dedicated API route /api/cron/content-sweep
  // — calling DB writes during render is an anti-pattern (causes duplicate
  // writes on prefetch/revalidation). The pg_cron migration handles this.

  const { rows: listings, total } = await getListingsAdmin({ status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, locale })

  const base = localePath(locale, '/admin/listings')
  const statusHref = (key: string) => `${base}?status=${key}${search ? `&q=${encodeURIComponent(search)}` : ''}`
  const pageHref = (p: number) => `${base}?status=${status}${search ? `&q=${encodeURIComponent(search)}` : ''}&page=${p}`

  return (
    <div className="space-y-5">
      <PageHeader title={t.title} description={t.description} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          pills={STATUS_KEYS.map((key) => ({
            key,
            label: t[STATUS_LABELS[key]],
            href: statusHref(key),
          }))}
          active={status}
        />
        <SearchBar
          name="q"
          defaultValue={search}
          placeholder={tc.searchPlaceholder}
          action={base}
          className="w-full sm:w-64"
        />
      </div>

      {listings.length === 0 ? (
        <EmptyState message={search ? tc.emptyFiltered : t.empty} />
      ) : (
        <>
          <ListingsBulkTable
            rows={listings}
            copy={t}
            common={tc}
            locale={locale}
            commonLabels={dict.admin.common}
          />
          <Pager page={page} pageSize={PAGE_SIZE} total={total} hrefFor={pageHref} copy={tc} />
        </>
      )}
    </div>
  )
}
