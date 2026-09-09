'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DataTable } from '@/components/admin/data-table'
import { BulkActionsBar } from '@/components/admin/bulk-actions'
import { bulkExpireListings, bulkRelistListings } from '@/lib/admin/actions'
import { ListingActions } from './listings-actions'
import { StatusBadge } from '@/components/admin/status-badge'
import { localizeStatus } from '@/lib/admin/labels'
import { formatRelative } from '@/lib/admin/format'
import { localePath } from '@/lib/i18n/urls'
import type { Column } from '@/components/admin/data-table'
import type { Dictionary, Locale } from '@/lib/i18n'
import type { AdminListingRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['listingsAdmin']
type CommonCopy = Dictionary['admin']['common']

/**
 * Listings manager table with row selection + bulk expire/relist bar. The
 * server page passes rows; selection state and all interactivity stay here.
 */
export function ListingsBulkTable({
  rows,
  copy,
  common,
  locale,
  commonLabels,
}: {
  rows: AdminListingRow[]
  copy: Copy
  common: CommonCopy
  locale: Locale
  commonLabels: Dictionary['admin']['common']
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.contentItemId))

  const toggleRow = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelected((prev) => (rows.every((r) => prev.has(r.contentItemId)) ? new Set() : new Set(rows.map((r) => r.contentItemId))))
  }, [rows])

  const refresh = () => {
    setSelected(new Set())
    router.refresh()
  }

  const columns: Column<AdminListingRow>[] = [
    {
      key: 'title',
      header: copy.colTitle,
      render: (r) => (
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{r.title ?? copy.untitled}</div>
          {r.sellerName && <div className="text-xs text-muted-foreground truncate">{r.sellerName}</div>}
          {r.missingLocale && (
            <span className="mt-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {copy.missingTranslation}
            </span>
          )}
        </div>
      ),
    },
    {
      key: 'price',
      header: copy.colPrice,
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
      header: copy.colStatus,
      render: (r) => (
        <div className="space-y-1">
          <StatusBadge status={r.listingStatus} label={localizeStatus(r.listingStatus, commonLabels)} />
          <div className="text-[10px] text-muted-foreground">{localizeStatus(r.contentStatus, commonLabels)}</div>
        </div>
      ),
    },
    {
      key: 'expires',
      header: copy.colExpires,
      render: (r) =>
        r.expiresAt ? (
          <time className="text-xs text-muted-foreground">{formatRelative(r.expiresAt, locale)}</time>
        ) : (
          <span className="text-xs text-muted-foreground">{copy.noExpiry}</span>
        ),
    },
    {
      key: 'view',
      header: '',
      render: (r) => (
        <Link href={localePath(locale, `/buy-sell/${r.contentItemId}`)} className="text-xs text-primary hover:underline">
          {copy.viewContent}
        </Link>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (r) => <ListingActions listing={r} copy={copy} common={common} locale={locale} />,
      className: 'text-right',
    },
  ]

  return (
    <>
      {selected.size > 0 && (
        <BulkActionsBar
          selectedCount={selected.size}
          getKeys={() => Array.from(selected)}
          onClear={() => setSelected(new Set())}
          onDone={refresh}
          selectedLabel={common.bulkSelected}
          clearLabel={common.bulkClear}
          cancelLabel={common.cancel}
          confirmLabel={common.confirm}
          actions={[
            {
              label: common.bulkExpire,
              action: (keys) => bulkExpireListings(keys),
              successToast: common.bulkUpdated,
              tone: 'danger',
              confirmTitle: copy.bulkExpireConfirmTitle,
              confirmBody: copy.bulkExpireConfirmBody,
            },
            {
              label: common.bulkRelist,
              action: (keys) => bulkRelistListings(keys),
              successToast: copy.toastRelisted,
            },
          ]}
        />
      )}

      <DataTable
        rows={rows}
        rowKey={(r) => r.contentItemId}
        columns={columns}
        selectable
        selectedKeys={selected}
        onToggleRow={toggleRow}
        onToggleAll={toggleAll}
        allSelected={allSelected}
      />
    </>
  )
}