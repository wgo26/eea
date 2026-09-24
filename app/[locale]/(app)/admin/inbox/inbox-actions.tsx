'use client'

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Bell, Check, ExternalLink, Info, Trash2, XCircle } from 'lucide-react'
import { DataTable, type Column } from '@/components/admin/data-table'
import { BulkActionsBar } from '@/components/admin/bulk-actions'
import { useAdminMutation } from '@/components/admin/confirm-dialog'
import {
  dismissNotification,
  dismissNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/admin/actions/notifications'
import {
  notificationHref,
  type NotificationCategory,
} from '@/lib/admin/notification-centre'
import { formatRelative } from '@/lib/admin/format'
import { cn } from '@/lib/utils'
import type { Dictionary, Locale } from '@/lib/i18n'
import type { AdminNotificationRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['inbox']
type CommonCopy = Dictionary['admin']['common']

/** Category → dictionary key. The spec's four labels, in one place per side. */
const CATEGORY_LABEL: Record<NotificationCategory, keyof Copy> = {
  info: 'catInfo',
  action_required: 'catActionRequired',
  warning: 'catWarning',
  critical: 'catCritical',
}

const CATEGORY_CHIP: Record<NotificationCategory, string> = {
  info: 'bg-secondary text-secondary-foreground',
  action_required: 'bg-primary/10 text-primary',
  warning: 'bg-amber-100 text-amber-800',
  critical: 'bg-destructive/10 text-destructive',
}

function CategoryIcon({ category }: { category: NotificationCategory }) {
  const cls = 'h-3 w-3 shrink-0'
  if (category === 'critical') return <XCircle className={cls} aria-hidden />
  if (category === 'warning') return <AlertTriangle className={cls} aria-hidden />
  if (category === 'action_required') return <Bell className={cls} aria-hidden />
  return <Info className={cls} aria-hidden />
}

/** Producer key → label; an unknown producer shows its raw key, never blank. */
function sourceLabel(copy: Copy, source: string): string {
  switch (source) {
    case 'system':
      return copy.sourceSystem
    case 'incidents':
      return copy.sourceIncidents
    case 'credentials':
      return copy.sourceCredentials
    case 'approvals':
      return copy.sourceApprovals
    default:
      return source
  }
}

const rowButtonCls =
  'inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50'

/** "Mark all read" for the active tab — whole centre, or just that category. */
export function MarkAllReadButton({
  category,
  label,
  successToast,
}: {
  category: string
  label: string
  successToast: string
}) {
  const { run, loading } = useAdminMutation()
  const router = useRouter()
  return (
    <button
      type="button"
      disabled={loading}
      onClick={async () => {
        const ok = await run(() => markAllNotificationsRead(category), successToast)
        if (ok) router.refresh()
      }}
      className="inline-flex min-h-[32px] items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
    >
      <Check className="h-3.5 w-3.5" aria-hidden />
      {label}
    </button>
  )
}

/**
 * The centre's rows: per-row open/mark-read/dismiss plus bulk dismiss.
 * Selection mirrors the trust-safety tables (DataTable `selectable` +
 * BulkActionsBar), so the bulk pattern is identical across the admin.
 */
export function InboxTable({
  rows,
  copy,
  common,
  locale,
}: {
  rows: AdminNotificationRow[]
  copy: Copy
  common: CommonCopy
  locale: Locale
}) {
  const router = useRouter()
  const { run, loading } = useAdminMutation()
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
    setSelected((prev) =>
      rows.every((r) => prev.has(r.id)) ? new Set() : new Set(rows.map((r) => r.id)),
    )
  }, [rows])

  const refresh = useCallback(() => {
    setSelected(new Set())
    router.refresh()
  }, [router])

  const columns: Column<AdminNotificationRow>[] = [
    {
      key: 'category',
      header: copy.colCategory,
      render: (r) => (
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap',
            CATEGORY_CHIP[r.category],
          )}
        >
          <CategoryIcon category={r.category} />
          {copy[CATEGORY_LABEL[r.category]]}
        </span>
      ),
      className: 'whitespace-nowrap',
    },
    {
      key: 'message',
      header: copy.colMessage,
      render: (r) => (
        <div className="min-w-[200px] max-w-[440px]">
          <div className={cn('text-sm', r.isRead ? 'font-normal' : 'font-semibold')}>{r.title}</div>
          {r.body && (
            <p className="mt-0.5 line-clamp-3 whitespace-pre-line break-words text-xs text-muted-foreground">
              {r.body}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'source',
      header: copy.colSource,
      render: (r) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {sourceLabel(copy, r.source)}
        </span>
      ),
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell',
    },
    {
      key: 'when',
      header: copy.colWhen,
      render: (r) => (
        <time className="text-xs text-muted-foreground whitespace-nowrap">
          {formatRelative(r.createdAt, locale)}
        </time>
      ),
      className: 'whitespace-nowrap',
    },
    {
      key: 'actions',
      header: '',
      stickyRight: true,
      render: (r) => {
        const href = notificationHref(locale, r.linkPath)
        return (
          <span className="inline-flex items-center justify-end gap-1.5">
            {href && (
              <Link
                href={href}
                title={copy.openLink}
                className={cn(rowButtonCls, 'text-primary')}
              >
                <ExternalLink className="h-3 w-3" aria-hidden />
                {copy.openLink}
              </Link>
            )}
            {!r.isRead && (
              <button
                type="button"
                disabled={loading}
                title={copy.markRead}
                onClick={async () => {
                  const ok = await run(() => markNotificationRead(r.id), copy.markedRead)
                  if (ok) router.refresh()
                }}
                className={rowButtonCls}
              >
                <Check className="h-3 w-3" aria-hidden />
                {copy.markRead}
              </button>
            )}
            <button
              type="button"
              disabled={loading}
              title={copy.dismiss}
              onClick={async () => {
                const ok = await run(() => dismissNotification(r.id), copy.dismissed)
                if (ok) router.refresh()
              }}
              className={cn(
                rowButtonCls,
                'border-destructive/30 text-destructive hover:bg-destructive/10',
              )}
            >
              <Trash2 className="h-3 w-3" aria-hidden />
              {copy.dismiss}
            </button>
          </span>
        )
      },
      className: 'text-right whitespace-nowrap',
    },
  ]

  return (
    <>
      <BulkActionsBar
        selectedCount={selected.size}
        getKeys={() => Array.from(selected)}
        onClear={() => setSelected(new Set())}
        onDone={refresh}
        selectedLabel={common.bulkSelected}
        clearLabel={common.bulkClear}
        cancelLabel={common.cancel}
        confirmLabel={copy.dismissSelected}
        actions={[
          {
            label: copy.dismissSelected,
            action: (keys) => dismissNotifications(keys),
            successToast: copy.dismissed,
            tone: 'danger',
            confirmTitle: copy.dismissConfirmTitle,
            confirmBody: copy.dismissConfirmBody,
            confirmLabel: copy.dismissSelected,
            cancelLabel: common.cancel,
          },
        ]}
      />

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        selectable
        selectedKeys={selected}
        onToggleRow={toggleRow}
        onToggleAll={toggleAll}
        allSelected={allSelected}
        emptyMessage={copy.empty}
      />
    </>
  )
}
