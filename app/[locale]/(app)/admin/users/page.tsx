import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary, type Locale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getUsers, profileCompleteness } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { FilterPills, SearchBar, ActiveFilters } from '@/components/admin/filter-pills'
import { Pager } from '@/components/admin/pager'
import { StatCard, StatGrid } from '@/components/admin/stat-card'
import { UsersTable } from './users-table'
import { InviteForm } from './invite-form'
import { BulkInviteForm } from './bulk-invite-form'
import type { AppRole } from '@/lib/admin/queries'

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

      {/* Active filters as removable chips (Phase D): three independent
          filters can stack here, so the applied set is easy to lose track of. */}
      <ActiveFilters
        chips={[
          ...(role !== 'all'
            ? [{ key: 'role', label: `${t.colRoles}: ${t[ROLE_FILTERS.find((f) => f.key === role)!.dictKey]}`, removeHref: withParams(locale, base, { role: undefined, page: undefined }) }]
            : []),
          ...(status !== 'all'
            ? [{ key: 'status', label: `${t.colStatus}: ${t[STATUS_FILTERS.find((f) => f.key === status)!.dictKey]}`, removeHref: withParams(locale, base, { status: undefined, page: undefined }) }]
            : []),
          ...(verified !== 'all'
            ? [{ key: 'verified', label: `${t.verifiedAll}: ${t[VERIFIED_FILTERS.find((f) => f.key === verified)!.dictKey]}`, removeHref: withParams(locale, base, { verified: undefined, page: undefined }) }]
            : []),
          ...(search
            ? [{ key: 'q', label: `${dict.admin.common.search}: ${search}`, removeHref: withParams(locale, base, { q: undefined, page: undefined }) }]
            : []),
        ]}
        clearAllHref={localePath(locale, '/admin/users')}
        labels={dict.admin.common}
      />

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
        <UsersTable
          rows={users.map((r) => ({ ...r, completeness: profileCompleteness(r) }))}
          copy={t}
          common={dict.admin.common}
          locale={locale}
          baseHref={localePath(locale, '/admin/users')}
        />
      )}

      <Pager page={page} pageSize={PAGE_SIZE} total={total} hrefFor={pageHref} copy={dict.admin.common} />
    </div>
  )
}
