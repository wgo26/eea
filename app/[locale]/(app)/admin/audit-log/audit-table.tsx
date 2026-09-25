'use client'

import { useState } from 'react'
import { DataTable, type Column } from '@/components/admin/data-table'
import { DetailDrawer, DetailButton } from '@/components/admin/detail-drawer'
import { localizeStatus, localizeType } from '@/lib/admin/labels'
import { formatDateTime, formatRelative } from '@/lib/admin/format'
import type { AuditTrailRow } from '@/lib/admin/queries'
import type { Dictionary, Locale } from '@/lib/i18n'

type Copy = Dictionary['admin']['audit']
type CommonCopy = Dictionary['admin']['common']

const humanize = (v: string) => v.replace(/[:_]/g, ' ')

/**
 * Audit trail table with the Phase C side-peek: "Details" opens the merged
 * event row in a right-side drawer (full action, transition, actor, entity,
 * request id and notes) while the trail keeps its scroll position — deep
 * inspection without losing the list context. Rows arrive from the server
 * page as plain data; only label strings cross the boundary.
 */
export function AuditTable({
  rows,
  copy,
  common,
  locale,
}: {
  rows: AuditTrailRow[]
  copy: Copy
  common: CommonCopy
  locale: Locale
}) {
  const [detailId, setDetailId] = useState<string | null>(null)
  const detailRow = rows.find((r) => `${r.origin}-${r.id}` === detailId) ?? null

  const columns: Column<AuditTrailRow>[] = [
    {
      key: 'time',
      header: copy.colWhen,
      render: (r) => (
        <div className="text-xs whitespace-nowrap">
          <div className="font-medium">{formatDateTime(r.createdAt)}</div>
          <div className="text-muted-foreground">{formatRelative(r.createdAt)}</div>
        </div>
      ),
      className: 'whitespace-nowrap',
    },
    {
      key: 'action',
      header: copy.colAction,
      render: (r) => (
        <div className="flex flex-col items-start gap-1">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground whitespace-nowrap" title={r.action}>
            {humanize(r.action)}
          </span>
          <span
            className={
              r.origin === 'system'
                ? 'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-primary/10 text-primary whitespace-nowrap'
                : 'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground whitespace-nowrap'
            }
          >
            {r.origin === 'system' ? copy.system : copy.originModeration}
          </span>
        </div>
      ),
      className: 'whitespace-nowrap',
    },
    {
      key: 'resource',
      header: copy.colResource,
      render: (r) => (
        <div className="min-w-[140px] max-w-[240px]">
          {r.contentTitle ? (
            <div className="text-sm font-medium truncate">{r.contentTitle}</div>
          ) : r.resourceId ? (
            <div className="text-xs font-mono truncate" title={r.resourceId}>{r.resourceId}</div>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
          {r.resourceType && (
            <div className="text-xs text-muted-foreground truncate">{localizeType(r.resourceType, common)}</div>
          )}
          {r.requestId && (
            <div className="text-xs text-muted-foreground/70 truncate font-mono" title={r.requestId}>
              {r.requestId.slice(0, 8)}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'transition',
      header: copy.colTransition,
      render: (r) => (
        <div className="text-xs text-muted-foreground whitespace-nowrap">
          {r.fromStatus && <span>{localizeStatus(r.fromStatus, common)}</span>}
          {r.fromStatus && r.toStatus && <span> → </span>}
          {r.toStatus && <span className="font-medium text-foreground">{localizeStatus(r.toStatus, common)}</span>}
          {!r.fromStatus && !r.toStatus && <span>—</span>}
        </div>
      ),
      headerClassName: 'hidden lg:table-cell',
      className: 'hidden lg:table-cell whitespace-nowrap',
    },
    {
      key: 'actor',
      header: copy.colActor,
      render: (r) => (
        <span className="text-xs truncate block max-w-[140px]">
          {r.actorName ?? (r.actorId ? copy.deletedUser : copy.system)}
        </span>
      ),
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell',
    },
    {
      key: 'notes',
      header: copy.colNotes,
      render: (r) => (
        <span className="text-xs text-muted-foreground truncate max-w-[200px] block">{r.notes ?? '—'}</span>
      ),
      headerClassName: 'hidden xl:table-cell',
      className: 'hidden xl:table-cell',
    },
    {
      key: 'details',
      header: '',
      stickyRight: true,
      render: (r) => <DetailButton label={common.viewDetails} onClick={() => setDetailId(`${r.origin}-${r.id}`)} />,
      className: 'text-right whitespace-nowrap',
    },
  ]

  return (
    <>
      <DataTable
        rows={rows}
        rowKey={(r) => `${r.origin}-${r.id}`}
        columns={columns}
        emptyMessage={copy.empty}
      />

      <DetailDrawer
        open={detailRow !== null}
        onOpenChange={(v) => {
          if (!v) setDetailId(null)
        }}
        title={detailRow ? humanize(detailRow.action) : copy.detailTitle}
        description={detailRow ? copy.detailTitle : undefined}
        fields={
          detailRow
            ? [
                { label: copy.detailWhen, value: formatDateTime(detailRow.createdAt, locale) },
                { label: copy.detailAction, value: detailRow.action },
                { label: copy.colOrigin, value: detailRow.origin === 'system' ? copy.system : copy.originModeration },
                {
                  label: copy.detailContent,
                  value: detailRow.contentTitle
                    ? `${detailRow.contentTitle}${detailRow.contentType ? ` · ${localizeType(detailRow.contentType, common)}` : ''}`
                    : '—',
                },
                {
                  label: copy.detailEntity,
                  value: detailRow.resourceId
                    ? `${detailRow.resourceType ? `${localizeType(detailRow.resourceType, common)} · ` : ''}${detailRow.resourceId}`
                    : '—',
                },
                {
                  label: copy.detailTransition,
                  value:
                    detailRow.fromStatus || detailRow.toStatus
                      ? `${detailRow.fromStatus ? localizeStatus(detailRow.fromStatus, common) : '—'} → ${detailRow.toStatus ? localizeStatus(detailRow.toStatus, common) : '—'}`
                      : '—',
                },
                {
                  label: copy.detailActor,
                  value: detailRow.actorName
                    ? `${detailRow.actorName}${detailRow.actorRole ? ` · ${detailRow.actorRole}` : ''}`
                    : detailRow.actorId
                      ? copy.deletedUser
                      : copy.system,
                },
                { label: copy.detailRequest, value: detailRow.requestId ?? '—' },
                { label: copy.detailNotes, value: detailRow.notes ?? copy.detailNoNotes },
              ]
            : []
        }
      />
    </>
  )
}
