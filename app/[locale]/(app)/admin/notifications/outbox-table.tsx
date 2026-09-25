'use client'

import { useState } from 'react'
import { DataTable, type Column } from '@/components/admin/data-table'
import { DetailDrawer, DetailButton } from '@/components/admin/detail-drawer'
import { OutboxRowActions } from './queue-actions'
import { formatRelative } from '@/lib/admin/format'
import type { Dictionary, Locale } from '@/lib/i18n'
import type { OutboxRow } from '@/lib/notify/queries'

type Copy = Dictionary['admin']['notifications']
type CommonCopy = Dictionary['admin']['common']

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'sent'
      ? 'bg-emerald-500/15 text-emerald-600'
      : status === 'failed'
        ? 'bg-destructive/10 text-destructive'
        : status === 'skipped'
          ? 'bg-muted text-muted-foreground'
          : 'bg-amber-500/15 text-amber-600'
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${tone}`}>
      {status}
    </span>
  )
}

/**
 * Notification outbox table with the Phase C side-peek: "Details" opens the
 * full row (channels, attempts, error, recorded text) in a right drawer so
 * staff can read a failed send without leaving the queue — the manual follow-
 * up actions (retry / wa.me / copy) stay reachable in the same row.
 */
export function OutboxTable({
  rows,
  copy,
  common,
  locale,
}: {
  rows: OutboxRow[]
  copy: Copy
  common: CommonCopy
  locale: Locale
}) {
  const [detailId, setDetailId] = useState<string | null>(null)
  const detailRow = rows.find((r) => r.id === detailId) ?? null

  const columns: Column<OutboxRow>[] = [
    {
      key: 'event',
      header: copy.colEvent,
      render: (r) => (
        <div className="min-w-[140px] max-w-[240px]">
          <div className="font-mono text-xs truncate">{r.event}</div>
          <div className="max-w-64 truncate text-xs text-muted-foreground">{r.title}</div>
          {r.error ? <div className="max-w-64 truncate text-xs text-destructive">{r.error}</div> : null}
        </div>
      ),
    },
    {
      key: 'audience',
      header: copy.colAudience,
      render: (r) => (
        <span className="text-xs whitespace-nowrap">
          {r.audience === 'staff' ? copy.staff : copy.user}
          {r.recipientEmail ? (
            <span className="block max-w-40 truncate text-xs text-muted-foreground">{r.recipientEmail}</span>
          ) : null}
        </span>
      ),
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell',
    },
    {
      key: 'status',
      header: copy.colStatus,
      render: (r) => <StatusPill status={r.status} />,
      className: 'whitespace-nowrap',
    },
    {
      key: 'channels',
      header: copy.colChannels,
      render: (r) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {r.channels.length > 0 ? r.channels.join(' · ') : '—'}
        </span>
      ),
      headerClassName: 'hidden lg:table-cell',
      className: 'hidden lg:table-cell whitespace-nowrap',
    },
    {
      key: 'when',
      header: copy.colWhen,
      render: (r) => (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {r.createdAt ? formatRelative(r.createdAt, locale) : '—'}
        </span>
      ),
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell whitespace-nowrap',
    },
    {
      key: 'peek',
      header: '',
      render: (r) => <DetailButton label={common.viewDetails} onClick={() => setDetailId(r.id)} />,
      className: 'text-right whitespace-nowrap',
    },
    {
      key: 'actions',
      header: copy.colActions,
      stickyRight: true,
      render: (r) => <OutboxRowActions row={r} copy={copy} />,
      className: 'text-right',
      headerClassName: 'whitespace-nowrap',
    },
  ]

  return (
    <>
      <DataTable rows={rows} rowKey={(r) => r.id} columns={columns} />

      <DetailDrawer
        open={detailRow !== null}
        onOpenChange={(v) => {
          if (!v) setDetailId(null)
        }}
        title={detailRow ? (detailRow.title ?? detailRow.event) : copy.detailTitle}
        description={copy.detailTitle}
        fields={
          detailRow
            ? [
                { label: copy.detailEvent, value: detailRow.event },
                { label: copy.detailAudience, value: detailRow.audience === 'staff' ? copy.staff : copy.user },
                { label: copy.detailStatus, value: <StatusPill status={detailRow.status} /> },
                { label: copy.detailChannels, value: detailRow.channels.length > 0 ? detailRow.channels.join(' · ') : '—' },
                { label: copy.detailQueued, value: detailRow.createdAt ? formatRelative(detailRow.createdAt, locale) : '—' },
                { label: copy.detailSent, value: detailRow.sentAt ? formatRelative(detailRow.sentAt, locale) : '—' },
                { label: copy.detailAttempts, value: String(detailRow.attempts) },
                { label: copy.detailError, value: detailRow.error ?? '—' },
                {
                  label: copy.detailHeading,
                  value: detailRow.body ? (
                    <span className="block whitespace-pre-wrap">{detailRow.body}</span>
                  ) : (
                    copy.detailNoBody
                  ),
                },
              ]
            : []
        }
      />
    </>
  )
}
