'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DataTable, type Column } from '@/components/admin/data-table'
import { BulkActionsBar } from '@/components/admin/bulk-actions'
import { DetailDrawer, DetailButton } from '@/components/admin/detail-drawer'
import { StatusBadge, TypeBadge } from '@/components/admin/status-badge'
import { formatRelative } from '@/lib/admin/format'
import { localizeStatus, localizeReportType } from '@/lib/admin/labels'
import { localePath } from '@/lib/i18n/urls'
import {
  bulkResolveReports,
  bulkDeleteReports,
  bulkResolveCorrections,
  bulkDeleteCorrections,
} from '@/lib/admin/actions'

import type { Dictionary, Locale } from '@/lib/i18n'
import type { ReportRow, CorrectionRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['trustSafety']
type CommonCopy = Dictionary['admin']['common']

/** Shared selection + drawer state for the two trust-safety tables. */
function useBulkState<T extends { id: string }>(rows: T[]) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [detailId, setDetailId] = useState<string | null>(null)

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))

  const toggleRow = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleAll = useCallback(() => {
    setSelected((prev) => (rows.every((r) => prev.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id))))
  }, [rows])

  const clear = useCallback(() => setSelected(new Set()), [])

  const refresh = useCallback(() => {
    setSelected(new Set())
    router.refresh()
  }, [router])

  const detailRow = detailId ? (rows.find((r) => r.id === detailId) ?? null) : null

  return {
    selected,
    clear,
    setDetailId,
    toggleRow,
    toggleAll,
    allSelected,
    refresh,
    detailRow,
  }
}

/** Public detail path for reported content, mirroring the old server helpers. */
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

/** Reports table: selection checkboxes, bulk resolve/dismiss/delete, detail drawer. */
export function TrustSafetyReportsBulk({
  rows,
  copy,
  common,
  locale,
}: {
  rows: ReportRow[]
  copy: Copy
  common: CommonCopy
  locale: Locale
}) {
  const { selected, clear, setDetailId, toggleRow, toggleAll, allSelected, refresh, detailRow } = useBulkState(rows)

  const columns: Column<ReportRow>[] = [
    {
      key: 'type',
      header: copy.colType,
      render: (r) => <TypeBadge type={r.reportType} />,
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell whitespace-nowrap',
    },
    {
      key: 'content',
      header: copy.colContent,
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
            <span className="text-xs text-muted-foreground">{copy.noContent}</span>
          )}
          {r.subject && <div className="truncate text-xs text-muted-foreground">{r.subject}</div>}
        </div>
      ),
    },
    {
      key: 'status',
      header: copy.colStatus,
      render: (r) => <StatusBadge status={r.status} label={localizeStatus(r.status, common)} />,
      className: 'whitespace-nowrap',
    },
    {
      key: 'received',
      header: copy.colReceived,
      render: (r) => (
        <time className="text-xs text-muted-foreground whitespace-nowrap">
          {formatRelative(r.createdAt, locale)}
        </time>
      ),
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell whitespace-nowrap',
    },
    {
      key: 'actions',
      header: '',
      stickyRight: true,
      render: (r) => (
        <span className="inline-flex items-center justify-end gap-1.5">
          <DetailButton label={common.viewDetails} onClick={() => setDetailId(r.id)} />
          {r.contentItemId ? (
            <Link
              href={`${localePath(locale, '/admin/content')}?edit=${r.contentItemId}`}
              className="whitespace-nowrap text-xs text-primary hover:underline"
            >
              {copy.editContent}
            </Link>
          ) : null}
        </span>
      ),
      className: 'text-right whitespace-nowrap',
    },
  ]

  return (
    <>
      {selected.size > 0 && (
        <BulkActionsBar
          selectedCount={selected.size}
          getKeys={() => Array.from(selected)}
          onClear={clear}
          onDone={refresh}
          selectedLabel={common.bulkSelected}
          clearLabel={common.bulkClear}
          cancelLabel={common.cancel}
          confirmLabel={common.confirm}
          actions={[
            {
              label: copy.bulkInvestigate,
              action: (keys) => bulkResolveReports(keys, 'investigating'),
              successToast: common.bulkUpdated,
              tone: 'default',
              confirmTitle: copy.bulkInvestigate,
              confirmBody: common.bulkUpdated,
            },
            {
              label: copy.bulkResolve,
              action: (keys) => bulkResolveReports(keys, 'resolved'),
              successToast: common.bulkUpdated,
              tone: 'default',
              confirmTitle: copy.bulkResolve,
              confirmBody: common.bulkUpdated,
            },
            {
              label: copy.bulkDismiss,
              action: (keys) => bulkResolveReports(keys, 'dismissed'),
              successToast: common.bulkUpdated,
              tone: 'danger',
              confirmTitle: copy.bulkDismissTitle,
              confirmBody: copy.bulkDismissBody,
              confirmLabel: copy.dismiss,
              cancelLabel: common.cancel,
            },
            {
              label: copy.deleteReport,
              action: (keys) => bulkDeleteReports(keys),
              successToast: copy.toastReportDeleted,
              tone: 'danger',
              confirmTitle: copy.deleteReportConfirmTitle,
              confirmBody: copy.deleteReportConfirmBody,
              confirmLabel: copy.deleteReport,
              cancelLabel: common.cancel,
            },
          ]}
        />
      )}

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        selectable
        selectedKeys={selected}
        onToggleRow={toggleRow}
        onToggleAll={toggleAll}
        allSelected={allSelected}
      />

      <DetailDrawer
        open={detailRow !== null}
        onOpenChange={(v) => {
          if (!v) setDetailId(null)
        }}
        title={detailRow ? (detailRow.subject ?? detailRow.contentTitle ?? copy.detailTitle) : copy.detailTitle}
        fields={
          detailRow
            ? [
                { label: copy.colType, value: localizeReportType(detailRow.reportType, common) },
                { label: copy.colContent, value: detailRow.contentTitle ?? detailRow.contentItemId ?? copy.noContent },
                { label: copy.detailSubject, value: detailRow.subject ?? '—' },
                { label: copy.detailDescription, value: detailRow.description ?? '—' },
                { label: copy.reporterLabel, value: detailRow.reporterId ?? copy.anonymous },
                {
                  label: copy.evidence,
                  value: detailRow.evidenceUrl ? (
                    <a href={detailRow.evidenceUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {copy.viewEvidence}
                    </a>
                  ) : (
                    '—'
                  ),
                },
                { label: copy.colStatus, value: localizeStatus(detailRow.status, common) },
                { label: copy.colReceived, value: detailRow.createdAt ? formatRelative(detailRow.createdAt, locale) : '—' },
                { label: copy.detailResolved, value: detailRow.resolvedAt ? formatRelative(detailRow.resolvedAt, locale) : '—' },
              ]
            : []
        }
      />
    </>
  )
}

/** Corrections table: selection checkboxes, bulk resolve/dismiss/delete, detail drawer. */
export function TrustSafetyCorrectionsBulk({
  rows,
  copy,
  common,
  locale,
}: {
  rows: CorrectionRow[]
  copy: Copy
  common: CommonCopy
  locale: Locale
}) {
  const { selected, clear, setDetailId, toggleRow, toggleAll, allSelected, refresh, detailRow } = useBulkState(rows)

  const columns: Column<CorrectionRow>[] = [
    {
      key: 'content',
      header: copy.colContent,
      render: (r) => (
        <div className="min-w-[160px] max-w-[280px]">
          <Link
            href={contentHref(locale, r.contentType, r.contentItemId, r.contentSlug)}
            className="block truncate text-sm text-primary hover:underline"
          >
            {r.contentTitle ?? r.contentItemId}
          </Link>
          <p className="mt-0.5 line-clamp-2 break-words text-xs text-muted-foreground">{r.correctionText}</p>
          {r.missingLocale && (
            <div className="mt-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
              {copy.missingTranslation}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'reporter',
      header: copy.reporterLabel,
      render: (r) => (
        <div className="max-w-[160px] text-xs text-muted-foreground">
          <div className="truncate">{r.reporterName ?? copy.anonymous}</div>
          {r.reporterEmail && <div className="truncate">{r.reporterEmail}</div>}
        </div>
      ),
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell',
    },
    {
      key: 'status',
      header: copy.colStatus,
      render: (r) => <StatusBadge status={r.status} label={localizeStatus(r.status, common)} />,
      className: 'whitespace-nowrap',
    },
    {
      key: 'received',
      header: copy.colReceived,
      render: (r) => (
        <time className="text-xs text-muted-foreground whitespace-nowrap">
          {formatRelative(r.createdAt, locale)}
        </time>
      ),
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell whitespace-nowrap',
    },
    {
      key: 'actions',
      header: '',
      stickyRight: true,
      render: (r) => (
        <span className="inline-flex items-center justify-end gap-1.5">
          <DetailButton label={common.viewDetails} onClick={() => setDetailId(r.id)} />
          <Link
            href={`${localePath(locale, '/admin/content')}?edit=${r.contentItemId}`}
            className="whitespace-nowrap text-xs text-primary hover:underline"
          >
            {copy.editContent}
          </Link>
        </span>
      ),
      className: 'text-right whitespace-nowrap',
    },
  ]

  return (
    <>
      {selected.size > 0 && (
        <BulkActionsBar
          selectedCount={selected.size}
          getKeys={() => Array.from(selected)}
          onClear={clear}
          onDone={refresh}
          selectedLabel={common.bulkSelected}
          clearLabel={common.bulkClear}
          cancelLabel={common.cancel}
          confirmLabel={common.confirm}
          actions={[
            {
              label: copy.bulkInvestigate,
              action: (keys) => bulkResolveCorrections(keys, 'investigating'),
              successToast: common.bulkUpdated,
              tone: 'default',
              confirmTitle: copy.bulkInvestigate,
              confirmBody: common.bulkUpdated,
            },
            {
              label: copy.bulkResolve,
              action: (keys) => bulkResolveCorrections(keys, 'resolved'),
              successToast: common.bulkUpdated,
              tone: 'default',
              confirmTitle: copy.bulkResolve,
              confirmBody: common.bulkUpdated,
            },
            {
              label: copy.bulkDismiss,
              action: (keys) => bulkResolveCorrections(keys, 'dismissed'),
              successToast: common.bulkUpdated,
              tone: 'danger',
              confirmTitle: copy.bulkDismissTitle,
              confirmBody: copy.bulkDismissBody,
              confirmLabel: copy.dismiss,
              cancelLabel: common.cancel,
            },
            {
              label: copy.deleteReport,
              action: (keys) => bulkDeleteCorrections(keys),
              successToast: copy.toastReportDeleted,
              tone: 'danger',
              confirmTitle: copy.deleteReportConfirmTitle,
              confirmBody: copy.deleteReportConfirmBody,
              confirmLabel: copy.deleteReport,
              cancelLabel: common.cancel,
            },
          ]}
        />
      )}

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        selectable
        selectedKeys={selected}
        onToggleRow={toggleRow}
        onToggleAll={toggleAll}
        allSelected={allSelected}
      />

      <DetailDrawer
        open={detailRow !== null}
        onOpenChange={(v) => {
          if (!v) setDetailId(null)
        }}
        title={detailRow ? (detailRow.contentTitle ?? detailRow.contentItemId ?? copy.detailTitle) : copy.detailTitle}
        fields={
          detailRow
            ? [
                { label: copy.colContent, value: detailRow.contentTitle ?? detailRow.contentItemId },
                { label: copy.detailCorrection, value: detailRow.correctionText },
                { label: copy.reporterLabel, value: detailRow.reporterName ?? copy.anonymous },
                { label: 'Email', value: detailRow.reporterEmail ?? '—' },
                { label: copy.colStatus, value: localizeStatus(detailRow.status, common) },
                { label: copy.colReceived, value: detailRow.createdAt ? formatRelative(detailRow.createdAt, locale) : '—' },
                { label: copy.detailResolved, value: detailRow.resolvedAt ? formatRelative(detailRow.resolvedAt, locale) : '—' },
              ]
            : []
        }
      />
    </>
  )
}
