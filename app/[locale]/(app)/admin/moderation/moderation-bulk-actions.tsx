'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DataTable } from '@/components/admin/data-table'
import type { Column } from '@/components/admin/data-table'
import { BulkActionsBar } from '@/components/admin/bulk-actions'
import { DetailDrawer, DetailButton } from '@/components/admin/detail-drawer'
import { bulkApproveSubmissions, bulkRejectSubmissions } from '@/lib/admin/actions'
import { StatusBadge, TypeBadge } from '@/components/admin/status-badge'
import { formatRelative } from '@/lib/admin/format'
import { localePath } from '@/lib/i18n/urls'

import type { Dictionary, Locale } from '@/lib/i18n'

type ModerationRow = {
  id: string
  status: string
  submissionType: string
  guestName: string | null
  guestEmail?: string | null
  guestPhone?: string | null
  submittedAt: string | null
  reviewedAt?: string | null
  payload?: unknown
}

type Copy = Dictionary['admin']['moderation']
type CommonCopy = Dictionary['admin']['common']

function payloadTitle(input: unknown): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const record = input as Record<string, unknown>
  for (const key of ['title', 'headline', 'name', 'subject']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

/**
 * Moderation queue table. Renders the same DataTable pattern as every other
 * admin list (title/submitter, type, consent flags, submitted, review link)
 * plus the bulk approve/reject bar above it. Row type stays local so the
 * server page can keep passing the SubmissionRow shape it already fetches.
 */
export function ModerationBulkTable({
  rows,
  copy,
  common,
  locale,
}: {
  rows: ModerationRow[]
  copy: Copy
  common: CommonCopy
  locale: Locale
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [rejectReason, setRejectReason] = useState('')
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

  const refresh = () => {
    setSelected(new Set())
    router.refresh()
  }

  const columns: Column<(typeof rows)[number]>[] = [
    {
      key: 'title',
      header: copy.colSubmitter,
      render: (r) => (
        <div className="min-w-[180px] max-w-[280px]">
          <div className="truncate text-sm font-medium">{payloadTitle(r.payload) ?? r.guestName ?? copy.anonymous}</div>
          {r.guestEmail ? <div className="truncate text-xs text-muted-foreground">{r.guestEmail}</div> : null}
        </div>
      ),
    },
    {
      key: 'type',
      header: copy.colType,
      render: (r) => <TypeBadge type={r.submissionType} />,
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell whitespace-nowrap',
    },
    {
      key: 'status',
      header: copy.colStatus,
      render: (r) => <StatusBadge status={r.status} label={r.status.replace(/_/g, ' ')} />,
      className: 'whitespace-nowrap',
    },
    {
      key: 'submitted',
      header: copy.colSubmitted,
      render: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {r.submittedAt ? formatRelative(r.submittedAt, locale) : '—'}
        </span>
      ),
      headerClassName: 'hidden lg:table-cell',
      className: 'hidden lg:table-cell whitespace-nowrap',
    },
    {
      key: 'review',
      header: '',
      stickyRight: true,
      render: (r) => (
        <span className="inline-flex items-center justify-end gap-1.5">
          <DetailButton label={common.viewDetails} onClick={() => setDetailId(r.id)} />
          <Link href={localePath(locale, `/admin/moderation/${r.id}`)} className="whitespace-nowrap text-xs text-primary hover:underline">
            {copy.review}
          </Link>
        </span>
      ),
      className: 'text-right whitespace-nowrap',
    },
  ]

  const detailRow = detailId ? (rows.find((r) => r.id === detailId) ?? null) : null

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
              label: common.bulkApprove,
              action: (keys) => bulkApproveSubmissions(keys),
              successToast: common.bulkUpdated,
              tone: 'default',
              confirmTitle: common.bulkApprove,
              confirmBody: common.bulkUpdated,
            },
            {
              label: copy.bulkReject,
              action: (keys) => bulkRejectSubmissions(keys, rejectReason.trim() || copy.rejectPlaceholder),
              successToast: copy.bulkRejectedToast,
              tone: 'danger',
              confirmTitle: copy.bulkRejectTitle,
              confirmBody: copy.bulkRejectBody,
              confirmLabel: copy.reject,
              cancelLabel: copy.cancel,
              children: (
                <label className="mt-3 block text-left">
                  <span className="text-xs font-medium text-muted-foreground">{copy.rejectPlaceholder}</span>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </label>
              ),
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
        onOpenChange={(v) => { if (!v) setDetailId(null) }}
        title={detailRow ? (payloadTitle(detailRow.payload) ?? detailRow.guestName ?? copy.detailTitle) : copy.detailTitle}
        fields={detailRow ? [
          { label: copy.detailSubmitter, value: detailRow.guestName ?? copy.anonymous },
          { label: copy.detailContact, value: [detailRow.guestEmail, detailRow.guestPhone].filter(Boolean).join(' · ') || '—' },
          { label: copy.detailType, value: detailRow.submissionType.replace(/_/g, ' ') },
          { label: copy.detailStatus, value: detailRow.status.replace(/_/g, ' ') },
          { label: copy.detailSubmitted, value: detailRow.submittedAt ? formatRelative(detailRow.submittedAt, locale) : '—' },
          { label: copy.detailReviewed, value: detailRow.reviewedAt ? formatRelative(detailRow.reviewedAt, locale) : '—' },
        ] : []}
      />
    </>
  )
}
