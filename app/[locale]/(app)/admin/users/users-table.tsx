'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useState } from 'react'
import { DataTable, type Column } from '@/components/admin/data-table'
import { DetailDrawer, DetailButton } from '@/components/admin/detail-drawer'
import { StatusBadge } from '@/components/admin/status-badge'
import { UserActions } from './user-actions'
import { formatDateTime } from '@/lib/admin/format'
import type { Dictionary, Locale } from '@/lib/i18n'
import type { AppRole, UserRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['users']
type CommonCopy = Dictionary['admin']['common']

/** Server rows plus the completeness score (computed server-side: the
 *  profileCompleteness helper lives in a server-only module). */
export type UserPeekRow = UserRow & { completeness: number }

function UserCell({ row, copy, href }: { row: UserPeekRow; copy: Copy; href: string }) {
  const score = row.completeness
  return (
    <div className="flex min-w-0 items-center gap-3">
      {row.avatarUrl ? (
        <Image src={row.avatarUrl} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-full bg-muted object-cover" />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground">
          {(row.displayName ?? row.fullName ?? row.email ?? 'U').charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <Link href={href} className="block truncate text-sm font-medium transition-colors hover:text-primary hover:underline">
          {row.displayName ?? row.fullName ?? copy.unnamed}
        </Link>
        {row.email && <div className="truncate text-xs text-muted-foreground">{row.email}</div>}
        <div className="mt-1 flex items-center gap-1.5" title={copy.completeness.replace('{score}', String(score))}>
          <div className="h-1 w-16 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${score}%` }} />
          </div>
          <span className="text-xs tabular-nums text-muted-foreground">{score}%</span>
        </div>
      </div>
    </div>
  )
}

function StatusCell({ row, copy }: { row: UserPeekRow; copy: Copy }) {
  const statusKey = row.isBanned ? 'banned' : row.isSuspended ? 'suspended' : 'active'
  const statusLabel = statusKey === 'banned' ? copy.statusBanned : statusKey === 'suspended' ? copy.statusSuspended : copy.statusActive
  return (
    <div className="flex flex-wrap items-center gap-1">
      <StatusBadge status={statusKey} label={statusLabel} />
      {row.isVerified && <StatusBadge status="verified" label={copy.verified} />}
    </div>
  )
}

function RolesCell({ roles, copy }: { roles: AppRole[]; copy: Copy }) {
  if (roles.length === 0) return <span className="text-xs text-muted-foreground">{copy.memberRole}</span>
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <StatusBadge key={r} status={r} />
      ))}
    </div>
  )
}

/**
 * Users table with the Phase C side-peek: the "Details" ghost button opens a
 * right-side drawer with the full identity record (contact, bio, handle,
 * location, visibility, preferences, roles, timestamps) without navigating to
 * the profile page — triage stays in the list, the detail page remains the
 * place for mutations. Row actions keep the existing "Open profile" link.
 * Rows arrive as plain data: the profile-completeness score is computed
 * server-side (its helper lives in a server-only module).
 */
export function UsersTable({
  rows,
  copy,
  common,
  locale,
  baseHref,
}: {
  rows: UserPeekRow[]
  copy: Copy
  common: CommonCopy
  locale: Locale
  /** Locale-prefixed profile base (`/en/admin/users`) — hrefs are `base/id`. */
  baseHref: string
}) {
  const [detailId, setDetailId] = useState<string | null>(null)
  const detailRow = rows.find((r) => r.id === detailId) ?? null
  const detailHref = (id: string) => `${baseHref}/${id}`

  const columns: Column<UserPeekRow>[] = [
    { key: 'user', header: copy.colUser, render: (r) => <UserCell row={r} copy={copy} href={detailHref(r.id)} />, className: 'min-w-[200px] max-w-[300px]' },
    { key: 'status', header: copy.colStatus, render: (r) => <StatusCell row={r} copy={copy} /> },
    {
      key: 'location',
      header: copy.colLocation,
      render: (r) => <span className="whitespace-nowrap text-xs text-muted-foreground">{r.locationName ?? '—'}</span>,
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell whitespace-nowrap',
    },
    { key: 'roles', header: copy.colRoles, render: (r) => <RolesCell roles={r.roles} copy={copy} />, className: 'max-w-[160px]' },
    {
      key: 'joined',
      header: copy.colJoined,
      render: (r) => <time className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</time>,
      headerClassName: 'hidden lg:table-cell',
      className: 'hidden lg:table-cell whitespace-nowrap',
    },
    {
      key: 'peek',
      header: '',
      render: (r) => <DetailButton label={common.viewDetails} onClick={() => setDetailId(r.id)} />,
      className: 'text-right whitespace-nowrap',
    },
    {
      key: 'actions',
      header: '',
      stickyRight: true,
      render: (r) => <UserActions user={r} copy={copy} common={common} detailHref={detailHref(r.id)} />,
      className: 'text-right',
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
        title={detailRow ? detailRow.displayName ?? detailRow.fullName ?? detailRow.email ?? copy.unnamed : copy.colUser}
        description={copy.title}
        fields={
          detailRow
            ? [
                { label: copy.detailEmail, value: detailRow.email ?? '—' },
                { label: copy.detailPhone, value: detailRow.phone ?? '—' },
                { label: copy.detailBio, value: detailRow.bio ?? '—' },
                { label: copy.detailHandle, value: detailRow.contributorHandle ?? '—' },
                { label: copy.rolesHeading, value: detailRow.roles.length > 0 ? detailRow.roles.join(' · ') : copy.memberRole },
                { label: copy.colStatus, value: detailRow.isBanned ? copy.statusBanned : detailRow.isSuspended ? copy.statusSuspended : copy.statusActive },
                { label: copy.detailVisibility, value: detailRow.isPublic ? copy.detailPublic : copy.detailPrivate },
                { label: copy.detailPreferences, value: `${detailRow.preferredLocale} · ${detailRow.preferredVoice}` },
                { label: copy.detailLocation, value: detailRow.locationName ?? '—' },
                { label: copy.detailJoined, value: formatDateTime(detailRow.createdAt, locale) },
                { label: copy.detailUpdated, value: formatDateTime(detailRow.updatedAt, locale) },
              ]
            : []
        }
      />
    </>
  )
}
