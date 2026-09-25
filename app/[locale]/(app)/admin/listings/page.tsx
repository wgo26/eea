import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { getListingsAdmin } from '@/lib/admin/queries'
import { requireCapability } from '@/lib/auth/guards'
import { isAdminRoles } from '@/lib/auth/roles'
import { PageHeader } from '@/components/admin/page-header'
import { FilterPills, SearchBar, ActiveFilters } from '@/components/admin/filter-pills'
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
  searchParams: Promise<{ status?: string; page?: string; q?: string; sort?: string }>
}) {
  const locale = await getRequestLocale()
  const { roles } = await requireCapability('manageContent', '/admin/listings')
  const canDelete = isAdminRoles(roles)
  const dict = getDictionary(locale)
  const t = dict.admin.listingsAdmin
  const tc = dict.admin.common

  const params = await searchParams
  const status = (STATUS_KEYS as readonly string[]).includes(params.status ?? '') ? (params.status as StatusKey) : 'all'
  const search = params.q || undefined
  const rawPage = Number(params.page ?? '1')
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1
  // Price lives on the listings extension row (no server-side ordering through
  // the embed), so the honest sortable is expiry — newest is the default.
  const sort = params.sort === 'expires' ? 'expires' : 'newest'

  // Note: runDueContentSweep() moved to a dedicated API route /api/cron/content-sweep
  // — calling DB writes during render is an anti-pattern (causes duplicate
  // writes on prefetch/revalidation). The pg_cron migration handles this.

  const { rows: listings, total } = await getListingsAdmin({
    status,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    locale,
    search,
    order: sort,
  })

  const base = localePath(locale, '/admin/listings')
  const withQS = (extra: string) =>
    `${base}?status=${status}${search ? `&q=${encodeURIComponent(search)}` : ''}${extra}`
  const statusHref = (key: string) => `${base}?status=${key}${search ? `&q=${encodeURIComponent(search)}` : ''}`
  const pageHref = (p: number) => `${withQS(`&sort=${sort}`)}&page=${p}`
  const sortHref = () => `${withQS(sort === 'expires' ? '' : '&sort=expires')}`
  const searchAction = `${base}?status=${status}&sort=${sort}`
  const isFiltered = status !== 'all' || !!search

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        description={t.description}
        breadcrumb={[
          { label: dict.admin.sidebar.dashboard, href: localePath(locale, '/admin/dashboard') },
          { label: t.title },
        ]}
        actions={
          <Link
            href={localePath(locale, '/admin/content?tab=content&type=listing')}
            className="inline-flex min-h-[32px] items-center rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {t.newListing}
          </Link>
        }
      />

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
          action={searchAction}
          className="w-full sm:w-64"
        />
      </div>

      <ActiveFilters
        chips={[
          ...(status !== 'all'
            ? [{ key: 'status', label: `${t.colStatus}: ${t[STATUS_LABELS[status]]}`, removeHref: `${base}?sort=${sort}${search ? `&q=${encodeURIComponent(search)}` : ''}` }]
            : []),
          ...(search
            ? [{ key: 'q', label: `${tc.search}: ${search}`, removeHref: `${base}?status=${status}&sort=${sort}` }]
            : []),
        ]}
        clearAllHref={base}
        labels={tc}
      />

      {listings.length === 0 ? (
        <EmptyState
          message={search || status !== 'all' ? tc.emptyFiltered : t.empty}
          action={
            <Link
              href={localePath(locale, '/admin/content?tab=content&type=listing')}
              className="inline-flex min-h-[32px] items-center rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              {t.newListing}
            </Link>
          }
          secondaryAction={
            isFiltered ? (
              <Link href={base} className="text-xs text-muted-foreground hover:text-foreground hover:underline">
                {tc.clearFilters}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <>
          <ListingsBulkTable
            rows={listings}
            copy={t}
            common={tc}
            locale={locale}
            commonLabels={dict.admin.common}
            canDelete={canDelete}
            sortActive={sort === 'expires'}
            sortHref={sortHref()}
            sortLabelAsc={tc.sortedAsc}
            sortLabelDesc={tc.sortedDesc}
          />
          <Pager page={page} pageSize={PAGE_SIZE} total={total} hrefFor={pageHref} copy={tc} />
        </>
      )}
    </div>
  )
}
