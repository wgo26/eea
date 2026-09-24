import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary, type Locale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getUsers, profileCompleteness } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { FilterPills, SearchBar } from '@/components/admin/filter-pills'
import { StatusBadge } from '@/components/admin/status-badge'
import { DataTable } from '@/components/admin/data-table'
import { Pager } from '@/components/admin/pager'
import { StatCard, StatGrid } from '@/components/admin/stat-card'
import { formatDateTime } from '@/lib/admin/format'
import { UserActions } from './user-actions'
import { InviteForm } from './invite-form'
import { BulkInviteForm } from './bulk-invite-form'
import type { AppRole, UserRow } from '@/lib/admin/queries'
import Image from 'next/image'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.users.title }
}

const ROLE_FILTERS: { key: AppRole | 'all'; dictKey: 'roleAll' | 'roleAdmin' | 'roleEditor' | 'roleContributor' | 'roleAdvertiser' }[] = [
  { key: 'all', dictKey: 'roleAll' },
  { key: 'admin', dictKey: 'roleAdmin' },
  { key: 'editor', dictKey: 'roleEditor' },
  { key: 'contributor', dictKey: 'roleContributor' },
  { key: 'advertiser', dictKey: 'roleAdvertiser' },
]

const STATUS_FILTERS = [
  { key: 'all', dictKey: 'statusAll' },
  { key: 'active', dictKey: 'statusActive' },
  { key: 'suspended', dictKey: 'statusSuspended' },
  { key: 'banned', dictKey: 'statusBanned' },
] as const

const VERIFIED_FILTERS = [
  { key: 'all', dictKey: 'verifiedAll' },
  { key: 'verified', dictKey: 'verifiedOnly' },
  { key: 'unverified', dictKey: 'unverifiedOnly' },
] as const

const PAGE_SIZE = 20

function withParams(locale: Locale, base: Record<string, string>, overrides: Record<string, string | undefined>) {
  const sp = new URLSearchParams()
  const merged = { ...base, ...overrides }
  for (const [k, v] of Object.entries(merged)) {
    if (v && v !== 'all' && v !== '') sp.set(k, v)
  }
  const qs = sp.toString()
  return `${localePath(locale, '/admin/users')}${qs ? `?${qs}` : ''}`
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; status?: string; verified?: string; q?: string; page?: string }>
}) {
  await requireCapability('manageUsers', '/admin/users')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.users

  const params = await searchParams
  const role = (params.role as AppRole | 'all') || 'all'
  const status = (params.status as 'all' | 'active' | 'suspended' | 'banned') || 'all'
  const verified = (params.verified as 'all' | 'verified' | 'unverified') || 'all'
  const search = params.q || ''
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)

  const [{ rows: users, total }, totalAll, activeAll, verifiedAll, suspendedAll, bannedAll] = await Promise.all([
    getUsers({ role, status, verified, search, limit: PAGE_SIZE, page }),
    getUsers({ limit: 1, page: 1 }).then((r) => r.total),
    getUsers({ status: 'active', limit: 1, page: 1 }).then((r) => r.total),
    getUsers({ verified: 'verified', limit: 1, page: 1 }).then((r) => r.total),
    getUsers({ status: 'suspended', limit: 1, page: 1 }).then((r) => r.total),
    getUsers({ status: 'banned', limit: 1, page: 1 }).then((r) => r.total),
  ])

  const base = { role, status, verified, q: search }
  const pageHref = (p: number) => {
    const sp = new URLSearchParams()
    if (role !== 'all') sp.set('role', role)
    if (status !== 'all') sp.set('status', status)
    if (verified !== 'all') sp.set('verified', verified)
    if (search) sp.set('q', search)
    sp.set('page', String(p))
    return `${localePath(locale, '/admin/users')}?${sp.toString()}`
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <div className="flex flex-wrap gap-2">
            <InviteForm copy={t} common={dict.admin.common} />
          </div>
        }
      />

      <StatGrid className="sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t.statsTotal} value={totalAll} />
        <StatCard label={t.statsActive} value={activeAll} tone="emerald" />
        <StatCard label={t.statsVerified} value={verifiedAll} tone="blue" />
        <StatCard label={t.statsSuspended} value={suspendedAll + bannedAll} tone={(suspendedAll + bannedAll) > 0 ? 'amber' : 'default'} />
      </StatGrid>

      <BulkInviteForm copy={t} common={dict.admin.common} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills
          pills={ROLE_FILTERS.map((f) => ({
            key: f.key,
            label: t[f.dictKey],
            href: withParams(locale, base, { role: f.key, page: undefined }),
          }))}
          active={role}
        />
        <SearchBar
          name="q"
          defaultValue={search}
          placeholder={t.searchPlaceholder}
          action={withParams(locale, base, { q: undefined, page: undefined })}
          className="w-full sm:w-64"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <FilterPills
          pills={STATUS_FILTERS.map((f) => ({
            key: f.key,
            label: t[f.dictKey],
            href: withParams(locale, base, { status: f.key, page: undefined }),
          }))}
          active={status}
        />
        <FilterPills
          pills={VERIFIED_FILTERS.map((f) => ({
            key: f.key,
            label: t[f.dictKey],
            href: withParams(locale, base, { verified: f.key, page: undefined }),
          }))}
          active={verified}
        />
      </div>

      {users.length === 0 ? (
        <EmptyState
          message={t.empty}
          action={
            search || role !== 'all' || status !== 'all' || verified !== 'all' ? (
              <Link
                href={localePath(locale, '/admin/users')}
                className="text-xs font-medium text-primary hover:underline"
              >
                {dict.admin.common.clearFilters}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <DataTable
          rows={users}
          rowKey={(r) => r.id}
          columns={[
            { key: 'user', header: t.colUser, render: (r) => <UserCell row={r} copy={t} href={localePath(locale, `/admin/users/${r.id}`)} />, className: 'min-w-[200px] max-w-[300px]' },
            { key: 'status', header: t.colStatus, render: (r) => <StatusCell row={r} copy={t} /> },
            { key: 'location', header: t.colLocation, render: (r) => <span className="whitespace-nowrap text-xs text-muted-foreground">{r.locationName ?? '—'}</span>, headerClassName: 'hidden md:table-cell', className: 'hidden md:table-cell whitespace-nowrap' },
            { key: 'roles', header: t.colRoles, render: (r) => <RolesCell roles={r.roles} copy={t} />, className: 'max-w-[160px]' },
            { key: 'joined', header: t.colJoined, render: (r) => <time className="whitespace-nowrap text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</time>, headerClassName: 'hidden lg:table-cell', className: 'hidden lg:table-cell whitespace-nowrap' },
            { key: 'actions', header: '', stickyRight: true, render: (r) => <UserActions user={r} copy={t} common={dict.admin.common} detailHref={localePath(locale, `/admin/users/${r.id}`)} />, className: 'text-right' },
          ]}
        />
      )}

      <Pager page={page} pageSize={PAGE_SIZE} total={total} hrefFor={pageHref} copy={dict.admin.common} />
    </div>
  )
}

function UserCell({ row, copy, href }: { row: UserRow; copy: ReturnType<typeof getDictionary>['admin']['users']; href: string }) {
  const score = profileCompleteness(row)
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
          <span className="text-[10px] tabular-nums text-muted-foreground">{score}%</span>
        </div>
      </div>
    </div>
  )
}

function StatusCell({ row, copy }: { row: UserRow; copy: ReturnType<typeof getDictionary>['admin']['users'] }) {
  const statusKey = row.isBanned ? 'banned' : row.isSuspended ? 'suspended' : 'active'
  const statusLabel = statusKey === 'banned' ? copy.statusBanned : statusKey === 'suspended' ? copy.statusSuspended : copy.statusActive
  return (
    <div className="flex flex-wrap items-center gap-1">
      <StatusBadge status={statusKey} label={statusLabel} />
      {row.isVerified && <StatusBadge status="verified" label={copy.verified} />}
    </div>
  )
}

function RolesCell({ roles, copy }: { roles: AppRole[]; copy: ReturnType<typeof getDictionary>['admin']['users'] }) {
  if (roles.length === 0) return <span className="text-xs text-muted-foreground">{copy.memberRole}</span>
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <StatusBadge key={r} status={r} />
      ))}
    </div>
  )
}
