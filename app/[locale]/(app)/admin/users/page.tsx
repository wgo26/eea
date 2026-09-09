import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getUsers } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { StatusBadge } from '@/components/admin/status-badge'
import { DataTable } from '@/components/admin/data-table'
import { Pager } from '@/components/admin/pager'
import { formatDateTime } from '@/lib/admin/format'
import { UserActions } from './user-actions'
import { InviteForm } from './invite-form'
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

const PAGE_SIZE = 20

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ role?: string; status?: string; q?: string; page?: string }>
}) {
  await requireCapability('manageUsers', '/admin/users')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.users

  const params = await searchParams
  const role = (params.role as AppRole | 'all') || 'all'
  const status = (params.status as 'all' | 'active' | 'suspended' | 'banned') || 'all'
  const search = params.q || ''
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)

  const { rows: users, total } = await getUsers({ role, status, search, limit: PAGE_SIZE, page })

  const pageHref = (p: number) => {
    const sp = new URLSearchParams()
    if (role !== 'all') sp.set('role', role)
    if (status !== 'all') sp.set('status', status)
    if (search) sp.set('q', search)
    sp.set('page', String(p))
    return `${localePath(locale, '/admin/users')}?${sp.toString()}`
  }

  return (
    <div className="space-y-5">
      <PageHeader title={t.title} description={t.description} />

      <InviteForm copy={t} common={dict.admin.common} />

      <div className="flex flex-col sm:flex-row gap-3">
        <form action={localePath(locale, '/admin/users')} method="GET" className="flex-1">
          <input
            type="text"
            name="q"
            defaultValue={search}
            placeholder={t.searchPlaceholder}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
        </form>
        <div className="flex flex-wrap items-center gap-2">
          {ROLE_FILTERS.map((f) => (
            <a
              key={f.key}
              href={`${localePath(locale, '/admin/users')}?role=${f.key}${search ? `&q=${encodeURIComponent(search)}` : ''}`}
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                role === f.key
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-card border-border text-muted-foreground hover:text-foreground'
              }`}
            >
              {t[f.dictKey]}
            </a>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['all', 'active', 'suspended', 'banned'] as const).map((value) => (
          <a key={value} href={`${localePath(locale, '/admin/users')}?status=${value}${params.role ? `&role=${role}` : ''}${search ? `&q=${encodeURIComponent(search)}` : ''}`} className={`rounded-full border px-3 py-1 text-xs font-medium ${status === value ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-muted-foreground'}`}>
            {t[value === 'all' ? 'statusAll' : value === 'active' ? 'statusActive' : value === 'suspended' ? 'statusSuspended' : 'statusBanned']}
          </a>
        ))}
      </div>

      {users.length === 0 ? (
        <EmptyState message={t.empty} />
      ) : (
        <DataTable
          rows={users}
          rowKey={(r) => r.id}
          columns={[
            { key: 'user', header: t.colUser, render: (r) => <UserCell row={r} copy={t} href={localePath(locale, `/admin/users/${r.id}`)} /> },
            { key: 'location', header: t.colLocation, render: (r) => <span className="text-xs text-muted-foreground">{r.locationName ?? '—'}</span> },
            { key: 'roles', header: t.colRoles, render: (r) => <RolesCell roles={r.roles} copy={t} /> },
            { key: 'joined', header: t.colJoined, render: (r) => <time className="text-xs text-muted-foreground">{formatDateTime(r.createdAt)}</time> },
            { key: 'actions', header: '', render: (r) => <UserActions user={r} copy={t} common={dict.admin.common} />, className: 'text-right' },
          ]}
        />
      )}

      <Pager page={page} pageSize={PAGE_SIZE} total={total} hrefFor={pageHref} copy={dict.admin.common} />
    </div>
  )
}

function UserCell({ row, copy, href }: { row: UserRow; copy: ReturnType<typeof getDictionary>['admin']['users']; href: string }) {
  return (
    <div className="min-w-0 flex items-center gap-3">
      {row.avatarUrl ? (
        <Image src={row.avatarUrl} alt="" className="h-8 w-8 rounded-full object-cover bg-muted shrink-0" />
      ) : (
        <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
          {(row.displayName ?? row.email ?? 'U').charAt(0).toUpperCase()}
        </div>
      )}
      <div className="min-w-0">
        <Link href={href} className="block truncate text-sm font-medium transition-colors hover:text-primary hover:underline">
          {row.displayName ?? row.fullName ?? copy.unnamed}
        </Link>
        {row.email && <div className="text-xs text-muted-foreground truncate">{row.email}</div>}
      </div>
    </div>
  )
}

function RolesCell({ roles, copy }: { roles: AppRole[]; copy: ReturnType<typeof getDictionary>['admin']['users'] }) {
  if (roles.length === 0) return <span className="text-xs text-muted-foreground">{copy.noRoles}</span>
  return (
    <div className="flex flex-wrap gap-1">
      {roles.map((r) => (
        <StatusBadge key={r} status={r} />
      ))}
    </div>
  )
}

