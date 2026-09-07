import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import Link from 'next/link'
import { getListingsAdmin, runDueContentSweep } from '@/lib/admin/queries'
import { requireCapability } from '@/lib/auth/guards'
import { PageHeader } from '@/components/admin/page-header'
import { StatusBadge } from '@/components/admin/status-badge'
import { DataTable } from '@/components/admin/data-table'
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

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const locale = await getRequestLocale()
  await requireCapability('manageContent', '/admin/content')
  const dict = getDictionary(locale)
  const t = dict.admin.listingsAdmin

  const params = await searchParams
  const status = (STATUS_KEYS as readonly string[]).includes(params.status ?? '') ? (params.status as StatusKey) : 'all'

  // Code-level fallback for the pg_cron listing-expiry sweep (migration
  // 20260904000000) — cheap, idempotent, and keeps the queue honest.
  await runDueContentSweep()

  const listings = await getListingsAdmin({ status, limit: 100 })

  const base = localePath(locale, '/admin/listings')

  return (
    <div className="space-y-5">
      <PageHeader title={t.title} description={t.description} />

      <div className="flex flex-wrap gap-2">
        {STATUS_KEYS.map((key) => (
          <a
            key={key}
            href={`${base}?status=${key}`}
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

      {listings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-10 text-center">
          <p className="text-sm text-muted-foreground">{t.empty}</p>
        </div>
      ) : (
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
                  <StatusBadge status={r.listingStatus} />
                  <div className="text-[10px] text-muted-foreground">{r.contentStatus}</div>
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
      )}
    </div>
  )
}