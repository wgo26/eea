'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DataTable } from '@/components/admin/data-table'
import type { Column } from '@/components/admin/data-table'
import { BulkActionsBar } from '@/components/admin/bulk-actions'
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
  submittedAt: string | null
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
  rows: (ModerationRow & { payload?: unknown; guestEmail?: string | null })[]
  copy: Copy
  common: CommonCopy
  locale: Locale
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())

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
      render: (r) => (
        <Link href={localePath(locale, `/admin/moderation/${r.id}`)} className="whitespace-nowrap text-xs text-primary hover:underline">
          {copy.review}
        </Link>
      ),
      headerClassName: 'hidden xl:table-cell',
      className: 'hidden xl:table-cell whitespace-nowrap',
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
              label: copy.bulkApprove,
              action: (keys) => bulkApproveSubmissions(keys),
              successToast: common.bulkUpdated,
              tone: 'default',
              confirmTitle: common.bulkApproveConfirmTitle ?? 'Approve selected submissions?',
              confirmBody: common.bulkApproveConfirmBody ?? 'The reason below is applied to every selected submission.',
            },
            {
              label: copy.bulkReject,
              action: (keys) => bulkRejectSubmissions(keys, common.rejectPlaceholder ?? 'Reason for rejection…'),
              successToast: common.bulkUpdated,
              tone: 'danger',
              confirmTitle: common.bulkRejectConfirmTitle ?? 'Reject selected submissions?',
              confirmBody: common.bulkRejectConfirmBody ?? 'The reason below is applied to every selected submission.',
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
    </>
  )
}
