import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import {
  getCredentialsAdmin,
  getRecentCredentialActivity,
  type CredentialListRow,
} from '@/lib/admin/queries'
import { isSecretStorageConfigured } from '@/lib/security/credential-manager'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { DataTable, type Column } from '@/components/admin/data-table'
import { StatusBadge } from '@/components/admin/status-badge'
import { formatDateTime, formatRelative } from '@/lib/admin/format'
import type { CredentialStatus } from '@/lib/security/credential-manager'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.secrets.title }
}

const STATUSES: CredentialStatus[] = ['active', 'disabled', 'expired', 'revoked']

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string; status?: string; provider?: string }>
}) {
  const locale = await getRequestLocale()
  await requireCapability('secrets.read_metadata', '/admin/secrets')
  const dict = getDictionary(locale)
  const t = dict.admin.secrets

  const params = await searchParams
  const status = (STATUSES as string[]).includes(params.status ?? '')
    ? (params.status as CredentialStatus)
    : 'all'
  const provider = params.provider?.trim() || undefined

  const [{ rows, providers, total }, activity] = await Promise.all([
    getCredentialsAdmin({ status, provider }),
    getRecentCredentialActivity(8),
  ])
  const storageReady = isSecretStorageConfigured()
  const filtered = Boolean(provider || params.status)

  const detailHref = (id: string) => localePath(locale, `/admin/secrets/${id}`)

  const columns: Column<CredentialListRow>[] = [
    {
      key: 'name',
      header: t.colName,
      render: (r) => (
        <div className="min-w-[180px]">
          <Link href={detailHref(r.id)} className="text-sm font-medium hover:underline">
            {r.name}
          </Link>
          <div className="font-mono text-xs text-muted-foreground/70">
            v{r.version} · {r.id.slice(0, 8)}…
          </div>
        </div>
      ),
    },
    {
      key: 'provider',
      header: t.colProvider,
      render: (r) => <span className="font-mono text-xs">{r.provider}</span>,
      className: 'whitespace-nowrap',
    },
    {
      key: 'category',
      header: t.colCategory,
      render: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.category ? t.categories[r.category] : '—'}
        </span>
      ),
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell',
    },
    {
      key: 'status',
      header: t.colStatus,
      render: (r) => <StatusBadge status={r.effectiveStatus} label={t.status[r.effectiveStatus]} />,
      className: 'whitespace-nowrap',
    },
    {
      key: 'expires',
      header: t.colExpires,
      render: (r) => (
        <span className="text-xs whitespace-nowrap">
          {r.expiresAt ? formatDateTime(r.expiresAt, locale) : t.noExpiry}
        </span>
      ),
      headerClassName: 'hidden lg:table-cell',
      className: 'hidden lg:table-cell',
    },
    {
      key: 'rotation',
      header: t.colRotation,
      render: (r) => (
        <span className="text-xs whitespace-nowrap">
          {r.rotationPolicy.intervalDays
            ? `${r.rotationPolicy.intervalDays}d`
            : t.noSchedule}
          {r.nextRotationDueAt && (
            <span className="block text-muted-foreground">{formatRelative(r.nextRotationDueAt, locale)}</span>
          )}
        </span>
      ),
      headerClassName: 'hidden xl:table-cell',
      className: 'hidden xl:table-cell',
    },
    {
      key: 'lastUsed',
      header: t.colLastUsed,
      render: (r) => (
        <span className="text-xs whitespace-nowrap text-muted-foreground">
          {r.lastUsedAt ? formatRelative(r.lastUsedAt, locale) : t.never}
        </span>
      ),
      headerClassName: 'hidden xl:table-cell',
      className: 'hidden xl:table-cell',
    },
    {
      key: 'actions',
      header: '',
      render: (r) => (
        <Link
          href={detailHref(r.id)}
          className="text-xs font-medium text-primary hover:underline whitespace-nowrap"
        >
          {t.view}
        </Link>
      ),
      className: 'text-right whitespace-nowrap',
    },
  ]

  const selectCls = 'rounded-md border border-border bg-background px-2.5 py-1.5 text-xs'

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        description={t.description}
        breadcrumb={[
          { label: dict.admin.sidebar.dashboard, href: localePath(locale, '/admin/dashboard') },
          { label: t.title },
        ]}
        actions={
          <Link href={localePath(locale, '/admin/secrets/new')} className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            {t.create}
          </Link>
        }
      />

      {!storageReady && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
          {t.storageMissing}
        </p>
      )}

      <form method="GET" className="flex flex-wrap items-center gap-1.5">
        <select name="status" defaultValue={params.status ?? ''} aria-label={t.colStatus} className={selectCls}>
          <option value="">{t.allStatuses}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t.status[s]}
            </option>
          ))}
        </select>
        <select name="provider" defaultValue={params.provider ?? ''} aria-label={t.colProvider} className={selectCls}>
          <option value="">{t.allProviders}</option>
          {providers.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium">
          {t.filter}
        </button>
      </form>

      <DataTable
        rows={rows}
        rowKey={(r) => r.id}
        columns={columns}
        emptyMessage={filtered ? t.emptyFiltered : t.empty}
      />

      {total > 0 && (
        <p className="text-xs text-muted-foreground">
          {dict.admin.common.totalItems.replace('{count}', String(total))}
        </p>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t.activityHeading}</h2>
        {activity.length === 0 ? (
          <EmptyState message={t.emptyActivity} className="p-4" />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {activity.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <span className="text-xs font-medium">
                  <Link href={detailHref(event.credentialId)} className="hover:underline">
                    {event.credentialName ?? event.credentialId.slice(0, 8)}
                  </Link>
                  <span className="ml-2 font-normal text-muted-foreground">
                    {t.events[event.action as keyof typeof t.events] ?? event.action}
                  </span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {event.actorName ?? '—'} · {formatRelative(event.createdAt, locale)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
