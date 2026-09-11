'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DataTable } from '@/components/admin/data-table'
import { BulkActionsBar } from '@/components/admin/bulk-actions'
import type { Column } from '@/components/admin/data-table'
import type { ContentRow } from '@/lib/admin/queries'
import { updateContentStatus, archiveContent, deleteContentItem } from '@/lib/admin/actions'
import { StatusBadge, TypeBadge } from '@/components/admin/status-badge'
import { localizeStatus, localizeType } from '@/lib/admin/labels'
import { formatRelative } from '@/lib/admin/format'
import { localePath } from '@/lib/i18n/urls'
import { ContentActions } from './content-actions'
import { ContentDeleteButton, ContentEditTrigger } from './content-dialogs'
import type { Dictionary, Locale } from '@/lib/i18n'
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

type ContentCopy = {
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

type Props = {
  rows: ContentRow[]
  canDelete: boolean
  copy: ContentCopy
  common: CommonDict
}

export function ContentBulkActions({ rows, canDelete, copy, common }: Props) {
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

  // Single selectable table — selection state lives here so the bulk bar and
  // the visible rows share the same keys (previously two tables were rendered
  // and the bulk selection applied to a hidden shadow table).
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

/**
 * Unified content manager: bulk bar + ONE selectable table with the full
 * title/type/status/updated/actions columns. Use this from page.tsx instead
 * of rendering <ContentBulkActions/> plus a second <DataTable/>.
 */
export function ContentTable({
  rows,
  canDelete,
  copy,
  common,
  typeLabels,
  locale,
  locations,
  categoriesByType,
  editId,
}: Props & {
  copy: Props['copy'] & Dictionary['admin']['content']
  common: CommonDict & Dictionary['admin']['common']
  typeLabels: Dictionary['admin']['common']
  locale: Locale
  locations: { id: string; name: string }[]
  categoriesByType: Record<string, { id: string; name: string }[]>
  editId?: string
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

  const fullColumns: Column<ContentRow>[] = [
    {
      key: 'title',
      header: copy.colTitle,
      render: (r) => (
        <div className="min-w-0 flex items-center gap-3">
          {r.coverUrl ? (
            <Image src={r.coverUrl} alt="" width={40} height={40} className="h-10 w-10 rounded object-cover bg-muted shrink-0" />
          ) : (
            <div className="h-10 w-10 rounded bg-muted shrink-0" />
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{r.title ?? copy.untitled}</div>
            {r.excerpt && <div className="text-xs text-muted-foreground truncate">{r.excerpt}</div>}
            {r.missingLocale && (
              <span
                className="mt-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                title={copy.bilingualHint}
              >
                {locale === 'fr' ? 'FR manquant — EN affiché' : 'FR missing — showing EN'}
              </span>
            )}
          </div>
        </div>
      ),
    },
    { key: 'type', header: copy.colType, render: (r) => <TypeBadge type={r.type} label={localizeType(r.type, typeLabels)} /> },
    { key: 'status', header: copy.colStatus, render: (r) => <StatusBadge status={r.status} label={localizeStatus(r.status, typeLabels)} /> },
    { key: 'updated', header: copy.colUpdated, render: (r) => <time className="text-xs text-muted-foreground">{formatRelative(r.updatedAt ?? r.createdAt)}</time> },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <div className="flex items-center justify-end gap-2">
          {r.type === 'listing' ? (
            <Link
              href={localePath(locale, '/admin/listings')}
              className="text-xs text-primary hover:underline"
            >
              {copy.openInListings}
            </Link>
          ) : null}
          <ContentEditTrigger
            content={r}
            copy={copy}
            common={common}
            locations={locations}
            categoriesByType={categoriesByType}
            autoOpen={editId === r.id}
          />
          <ContentActions content={r} copy={copy} common={common} />
          {canDelete && <ContentDeleteButton content={r} copy={copy} common={common} />}
        </div>
      ),
      className: 'text-right',
    },
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
        columns={fullColumns}
        selectable
        selectedKeys={selected}
        onToggleRow={toggleRow}
        onToggleAll={toggleAll}
        allSelected={allSelected}
      />
    </>
  )
}
