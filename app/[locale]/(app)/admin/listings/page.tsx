import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import Link from 'next/link'
import { getListingsAdmin } from '@/lib/admin/queries'
import { requireCapability } from '@/lib/auth/guards'
import { PageHeader } from '@/components/admin/page-header'
import { StatusBadge } from '@/components/admin/status-badge'
import { localizeStatus } from '@/lib/admin/labels'
import { DataTable } from '@/components/admin/data-table'
import { FilterPills, SearchBar } from '@/components/admin/filter-pills'
import { PaginationBar } from '@/components/admin/pagination'
import { EmptyState } from '@/components/admin/empty-state'
import { formatRelative } from '@/lib/admin/format'
import { ListingActions } from './listings-actions'

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

  const listings = await getListingsAdmin({ status, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, locale })

  const base = localePath(locale, '/admin/listings')
  const statusHref = (key: string) => `${base}?status=${key}${search ? `&q=${encodeURIComponent(search)}` : ''}`

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
          <DataTable
            rows={listings}
            rowKey={(r) => r.contentItemId}
            columns={[
              {
                key: 'title',
                header: t.colTitle,
                render: (r) => (
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{r.title ?? t.untitled}</div>
                    {r.sellerName && <div className="text-xs text-muted-foreground truncate">{r.sellerName}</div>}
                    {r.missingLocale && (
                      <span className="mt-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                        {t.missingTranslation}
                      </span>
                    )}
                  </div>
                ),
              },
              {
                key: 'price',
                header: t.colPrice,
                render: (r) =>
                  r.price != null ? (
                    <span className="text-sm">
                      {r.price.toLocaleString()} {r.currency ?? 'XAF'}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  ),
              },
              {
                key: 'status',
                header: t.colStatus,
                render: (r) => (
                  <div className="space-y-1">
                    <StatusBadge status={r.listingStatus} label={localizeStatus(r.listingStatus, dict.admin.common)} />
                    <div className="text-[10px] text-muted-foreground">{localizeStatus(r.contentStatus, dict.admin.common)}</div>
                  </div>
                ),
              },
              {
                key: 'expires',
                header: t.colExpires,
                render: (r) =>
                  r.expiresAt ? (
                    <time className="text-xs text-muted-foreground">{formatRelative(r.expiresAt, locale)}</time>
                  ) : (
                    <span className="text-xs text-muted-foreground">{t.noExpiry}</span>
                  ),
              },
              {
                key: 'view',
                header: '',
                render: (r) => (
                  <Link
                    href={localePath(locale, `/buy-sell/${r.contentItemId}`)}
                    className="text-xs text-primary hover:underline"
                  >
                    {t.viewContent}
                  </Link>
                ),
              },
              { key: 'actions', header: '', render: (r) => <ListingActions listing={r} copy={t} common={dict.admin.common} />, className: 'text-right' },
            ]}
          />
          {/* Listings count footer */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">
              {tc.showing.replace('{from}', '1').replace('{to}', String(listings.length)).replace('{total}', String(listings.length))}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
