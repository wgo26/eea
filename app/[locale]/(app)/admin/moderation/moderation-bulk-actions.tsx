'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable } from '@/components/admin/data-table'
import { BulkActionsBar } from '@/components/admin/bulk-actions'
import { bulkApproveSubmissions, bulkRejectSubmissions } from '@/lib/admin/actions'
import Link from 'next/link'

import { getDictionary } from '@/lib/i18n'
import type { Locale } from '@/lib/i18n'

type ModerationRow = {
  id: string
  status: string
  submissionType: string
  submittedAt: string | null
}

export function ModerationBulkTable({
  rows,
  copy,
  common,
  locale,
}: {
  rows: ModerationRow[]
  copy: any
  common: any
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
    </>
  )
}