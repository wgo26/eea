'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { DataTable } from '@/components/admin/data-table'
import { BulkActionsBar } from '@/components/admin/bulk-actions'
import type { Column } from '@/components/admin/data-table'
import type { ContentRow } from '@/lib/admin/queries'
import { updateContentStatus, archiveContent, deleteContentItem } from '@/lib/admin/actions'
import { StatusBadge, TypeBadge } from '@/components/admin/status-badge'
import { localizeStatus, localizeType } from '@/lib/admin/labels'
import { formatRelative } from '@/lib/admin/format'
import Image from 'next/image'

type CommonDict = {
  bulkSelected: string
  bulkClear: string
  bulkPublish: string
  bulkArchive: string
  bulkDelete: string
  bulkUpdated: string
  confirm: string
  cancel: string
}

type Props = {
  rows: ContentRow[]
  canDelete: boolean
  copy: {
    colTitle: string
    colType: string
    colStatus: string
    colUpdated: string
    untitled: string
    archiveConfirmTitle: string
    archiveConfirmBody: string
    toastArchived: string
    deleteConfirmTitle: string
    deleteConfirmBody: string
    toastDeleted: string
  }
  common: CommonDict
  base: string
  status: string
  type: string
  search?: string
}

export function ContentBulkActions({ rows, canDelete, copy, common, base, status, type, search }: Props) {
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
    setSelected((prev) => {
      if (rows.every((r) => prev.has(r.id))) return new Set()
      return new Set(rows.map((r) => r.id))
    })
  }, [rows])

  const selectedKeys = Array.from(selected)
  const refresh = () => {
    setSelected(new Set())
    router.refresh()
  }

  const handleBulkPublish = async (keys: string[]) => {
    const results = await Promise.all(keys.map((id) => updateContentStatus(id, 'published')))
    const failed = results.filter((r) => !r.ok)
    return failed.length > 0
      ? { ok: false as const, error: `${failed.length} item(s) failed` }
      : { ok: true as const }
  }

  const handleBulkArchive = async (keys: string[]) => {
    const results = await Promise.all(keys.map((id) => archiveContent(id)))
    const failed = results.filter((r) => !r.ok)
    return failed.length > 0
      ? { ok: false as const, error: `${failed.length} item(s) failed` }
      : { ok: true as const }
  }

  const handleBulkDelete = async (keys: string[]) => {
    const results = await Promise.all(keys.map((id) => deleteContentItem(id)))
    const failed = results.filter((r) => !r.ok)
    return failed.length > 0
      ? { ok: false as const, error: `${failed.length} item(s) failed` }
      : { ok: true as const }
  }

  // Render a hidden DataTable with selectable rows + bulk bar above it
  const columns: Column<ContentRow>[] = [
    { key: 'title', header: copy.colTitle, render: (r) => (
      <div className="flex items-center gap-3">
        {r.coverUrl ? (
          <Image src={r.coverUrl} alt="" className="h-10 w-10 rounded object-cover bg-muted shrink-0" width={40} height={40} />
        ) : (
          <div className="h-10 w-10 rounded bg-muted shrink-0" />
        )}
        <span className="text-sm font-medium truncate">{r.title ?? copy.untitled}</span>
      </div>
    )},
    { key: 'type', header: copy.colType, render: () => null },
    { key: 'status', header: copy.colStatus, render: () => null },
    { key: 'updated', header: copy.colUpdated, render: () => null },
    { key: 'actions', header: '', render: () => null, className: 'text-right' },
  ]

  return (
    <>
      {selected.size > 0 && (
        <BulkActionsBar
          selectedCount={selected.size}
          getKeys={() => selectedKeys}
          onClear={() => setSelected(new Set())}
          onDone={refresh}
          selectedLabel={common.bulkSelected}
          clearLabel={common.bulkClear}
          cancelLabel={common.cancel}
          confirmLabel={common.confirm}
          actions={[
            { label: common.bulkPublish, action: handleBulkPublish, successToast: common.bulkUpdated },
            { label: common.bulkArchive, action: handleBulkArchive, successToast: copy.toastArchived, tone: 'danger', confirmTitle: copy.archiveConfirmTitle, confirmBody: copy.archiveConfirmBody },
            ...(canDelete ? [{ label: common.bulkDelete, action: handleBulkDelete, successToast: copy.toastDeleted, tone: 'danger' as const, confirmTitle: copy.deleteConfirmTitle, confirmBody: copy.deleteConfirmBody }] : []),
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
