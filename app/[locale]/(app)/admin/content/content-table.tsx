'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { DataTable } from '@/components/admin/data-table'
import type { Column } from '@/components/admin/data-table'
import { BulkActionsBar } from '@/components/admin/bulk-actions'
import type { ContentRow } from '@/lib/admin/queries'
import { updateContentStatus, archiveContent, unarchiveContent, deleteContentItem } from '@/lib/admin/actions/content'
import { TypeBadge } from '@/components/admin/status-badge'
import { StatusToggleCell } from '@/components/admin/status-toggle-cell'
import { localizeType } from '@/lib/admin/labels'
import { formatDate, formatRelative } from '@/lib/admin/format'
import { ContentActions } from './content-actions'
import { ContentEditTrigger } from './content-dialogs'
import type { Dictionary, Locale } from '@/lib/i18n'

type Props = {
  rows: ContentRow[]
  canDelete: boolean
  copy: Dictionary['admin']['content']
  common: Dictionary['admin']['common']
  typeFilters: Dictionary['admin']['typeFilters']
  locale: Locale
  locations: { id: string; name: string }[]
  categoriesByType: Record<string, { id: string; name: string }[]>
  editId?: string
  /** Deep-link href for the row-title edit trigger (`?edit=` preserved). */
  editHrefFor: (id: string) => string
}

/**
 * Unified content manager: bulk bar + ONE selectable table with the full
 * title/type/status/updated/actions columns. Use this from page.tsx instead
 * of rendering bulk actions plus a second DataTable.
 *
 * The row title is the edit trigger (a `?edit=` deep-link the page turns
 * into an auto-opened edit dialog); every other row action lives in the one
 * ActionMenu in the actions column.
 */
export function ContentTable({
  rows,
  canDelete,
  copy,
  common,
  typeFilters,
  locale,
  locations,
  categoriesByType,
  editId,
  editHrefFor,
}: Props) {
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
    if (failed.length === 0) return { ok: true as const }
    const firstError = failed.find((r) => !r.ok && 'error' in r && r.error) as { error?: string } | undefined
    return { ok: false as const, error: firstError?.error ?? `${failed.length} item(s) failed` }
  }

  const handleBulkUnpublish = async (keys: string[]) => {
    const results = await Promise.all(keys.map((id) => updateContentStatus(id, 'draft')))
    const failed = results.filter((r) => !r.ok)
    return failed.length > 0
      ? { ok: false as const, error: `${failed.length} item(s) failed` }
      : { ok: true as const }
  }

  const handleBulkUnarchive = async (keys: string[]) => {
    const results = await Promise.all(keys.map((id) => unarchiveContent(id)))
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
        <div className="min-w-[180px] max-w-[300px] flex items-center gap-3">
          {r.coverUrl ? (
            <Image src={r.coverUrl} alt="" width={40} height={40} className="h-10 w-10 rounded object-cover bg-muted shrink-0" />
          ) : (
            <div className="h-10 w-10 rounded bg-muted shrink-0" />
          )}
          <div className="min-w-0">
            <Link
              href={editHrefFor(r.id)}
              className="block text-sm font-medium truncate text-primary hover:underline"
              title={copy.editContent}
            >
              {r.title ?? copy.untitled}
            </Link>
            {r.excerpt && <div className="text-xs text-muted-foreground truncate">{r.excerpt}</div>}
            {r.missingLocale && (
              <span
                className="mt-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                title={copy.bilingualHint}
              >
                {locale === 'fr' ? 'FR manquant — EN affiché' : 'FR missing — showing EN'}
              </span>
            )}
          </div>
        </div>
      ),
    },
    { key: 'type', header: copy.colType, render: (r) => <TypeBadge type={r.type} label={localizeType(r.type, common)} />, className: 'whitespace-nowrap' },
    { key: 'status', header: copy.colStatus, render: (r) => <StatusToggleCell row={r} copy={copy} common={common} />, className: 'whitespace-nowrap' },
    { key: 'published', header: copy.colPublished, render: (r) => <span className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(r.publishedAt, locale)}</span>, headerClassName: 'hidden lg:table-cell', className: 'hidden lg:table-cell whitespace-nowrap' },
    { key: 'author', header: copy.colAuthor, render: (r) => <span className="text-xs text-muted-foreground truncate block max-w-[140px]">{r.authorName ?? '—'}</span>, headerClassName: 'hidden xl:table-cell', className: 'hidden xl:table-cell' },
    { key: 'updated', header: copy.colUpdated, render: (r) => <time className="text-xs text-muted-foreground whitespace-nowrap">{formatRelative(r.updatedAt ?? r.createdAt)}</time>, headerClassName: 'hidden md:table-cell', className: 'hidden md:table-cell whitespace-nowrap' },
    {
      key: 'actions',
      header: '',
      stickyRight: true,
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5 flex-nowrap whitespace-nowrap">
          <ContentActions content={r} copy={copy} common={common} canDelete={canDelete} locale={locale} />
          <ContentEditTrigger
            content={r}
            copy={copy}
            common={common}
            typeFilters={typeFilters}
            locations={locations}
            categoriesByType={categoriesByType}
            autoOpen={editId === r.id}
          />
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
          undoLabel={common.undo}
          actions={[
            { label: common.bulkPublish, action: handleBulkPublish, successToast: common.bulkUpdated },
            { label: common.bulkUnpublish, action: handleBulkUnpublish, successToast: copy.toastUnpublished, confirmTitle: copy.unpublishConfirmTitle, confirmBody: copy.unpublishConfirmBody, confirmLabel: copy.unpublish, undoAction: handleBulkPublish, undoToast: copy.toastPublished },
            { label: common.bulkArchive, action: handleBulkArchive, successToast: copy.toastArchived, tone: 'danger', confirmTitle: copy.archiveConfirmTitle, confirmBody: copy.archiveConfirmBody, undoAction: handleBulkUnarchive, undoToast: copy.toastRestored },
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
