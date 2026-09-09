'use client'

import { useCallback, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { DataTable } from '@/components/admin/data-table'
import { BulkActionsBar } from '@/components/admin/bulk-actions'
import { bulkApproveSubmissions, bulkRejectSubmissions } from '@/lib/admin/actions'
import { ModerationActions } from './moderation-actions'
import { StatusBadge, TypeBadge } from '@/components/admin/status-badge'
import { localizeStatus, localizeType } from '@/lib/admin/labels'
import { formatRelative } from '@/lib/admin/format'
import { localePath } from '@/lib/i18n/urls'
import type { Column } from '@/components/admin/data-table'
import type { Dictionary, Locale } from '@/lib/i18n'
import type { SubmissionRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['moderation']
type CommonCopy = Dictionary['admin']['common']

/**
 * Moderation queue table with row selection + a bulk approve/reject bar.
 * Server component passes rows; all interactivity (selection, bulk server
 * actions, per-row actions) stays in this client component.
 */
export function ModerationBulkTable({
  rows,
  copy,
  common,
  locale,
  commonLabels,
}: {
  rows: SubmissionRow[]
  copy: Copy
  common: CommonCopy
  locale: Locale
  commonLabels: Dictionary['admin']['common']
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Uncontrolled reject textarea — its live DOM value is read at confirm time,
  // so the action closure captured by the bar can never go stale.
  const rejectTextareaRef = useRef<HTMLTextAreaElement | null>(null)

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

  const columns: Column<SubmissionRow>[] = [
    { key: 'type', header: copy.colType, render: (r) => (
      <div className="space-y-1">
        <TypeBadge type={r.submissionType} label={localizeType(r.submissionType, commonLabels)} />
        <Link
          href={localePath(locale, `/admin/moderation/${r.id}`)}
          className="block text-xs text-primary hover:underline"
        >
          {copy.review}
        </Link>
      </div>
    ) },
    { key: 'submitter', header: copy.colSubmitter, render: (r) => (
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{r.guestName ?? copy.anonymous}</div>
        {r.guestEmail && <div className="text-xs text-muted-foreground truncate">{r.guestEmail}</div>}
      </div>
    ) },
    { key: 'status', header: copy.colStatus, render: (r) => <StatusBadge status={r.status} label={localizeStatus(r.status, commonLabels)} /> },
    { key: 'submitted', header: copy.colSubmitted, render: (r) => <time className="text-xs text-muted-foreground">{formatRelative(r.submittedAt)}</time> },
    { key: 'actions', header: '', render: (r) => <ModerationActions submission={r} copy={copy} />, className: 'text-right' },
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
              label: common.bulkApprove,
              action: (keys) => bulkApproveSubmissions(keys),
              successToast: copy.bulkApprovedToast,
            },
            {
              label: common.bulkReject,
              action: (keys) => bulkRejectSubmissions(keys, rejectTextareaRef.current?.value ?? ''),
              successToast: copy.bulkRejectedToast,
              tone: 'danger',
              confirmTitle: copy.bulkRejectTitle,
              confirmBody: copy.bulkRejectBody,
              children: (
                <textarea
                  ref={(el) => { rejectTextareaRef.current = el }}
                  placeholder={copy.rejectPlaceholder}
                  rows={3}
                  className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
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
    </>
  )
}