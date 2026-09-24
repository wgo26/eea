import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireAnyCapability } from '@/lib/auth/guards'
import { effectiveCapabilities } from '@/lib/auth/admin-roles'
import { getApprovalsAdmin, type ApprovalListRow } from '@/lib/admin/queries'
import { isTwoPersonAction, twoPersonActionCapability } from '@/lib/admin/two-person-control'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { DataTable, type Column } from '@/components/admin/data-table'
import { StatusBadge } from '@/components/admin/status-badge'
import { formatDateTime, formatRelative } from '@/lib/admin/format'
import { ApprovalActions, ApprovalQueueHint } from './approval-actions'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.approvals.title }
}

/**
 * The capability set that can decide *something* in the queue — the same
 * any-of list the sidebar entry uses, so "sees the menu item" and "can open
 * the page" never diverge. Per-row decisions are still checked against the
 * action's own capability below and again in the server action.
 */
const APPROVER_CAPABILITIES = [
  'secrets.revoke',
  'incidents.manage',
  'branding.publish',
  'system.configure',
  'manageUsers',
] as const

const STATUSES = ['pending', 'approved', 'rejected', 'consumed', 'expired'] as const
const ACTIONS = [
  'secret.revoke',
  'incident.critical_mode',
  'branding.publish',
  'data.destructive',
  'permissions.escalate',
  'auth.configure',
] as const

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string; status?: string; action?: string }>
}) {
  const locale = await getRequestLocale()
  const { user, roles, adminRoles } = await requireAnyCapability(
    [...APPROVER_CAPABILITIES],
    '/admin/approvals',
  )
  const dict = getDictionary(locale)
  const t = dict.admin.approvals

  const params = await searchParams
  const status = (STATUSES as readonly string[]).includes(params.status ?? '')
    ? (params.status as (typeof STATUSES)[number])
    : 'all'
  const action = (ACTIONS as readonly string[]).includes(params.action ?? '') ? params.action : undefined

  const { rows, pending: pendingTotal } = await getApprovalsAdmin({ status, action })
  const caps = effectiveCapabilities(roles, adminRoles)

  const pending = rows.filter((r) => r.effectiveStatus === 'pending')
  const history = rows.filter((r) => r.effectiveStatus !== 'pending')

  const actionLabel = (key: string): string =>
    isTwoPersonAction(key) ? t.actions[key] : key
  const targetHref = (row: ApprovalListRow): string | null => {
    if (!row.resourceId) return null
    if (row.resourceType === 'api_credential') return localePath(locale, `/admin/secrets/${row.resourceId}`)
    if (row.resourceType === 'incident') return localePath(locale, `/admin/incidents/${row.resourceId}`)
    return null
  }

  const columns: Column<ApprovalListRow>[] = [
    {
      key: 'action',
      header: t.colAction,
      render: (r) => (
        <div className="min-w-[180px]">
          <div className="text-sm font-medium">{actionLabel(r.action)}</div>
          <div className="font-mono text-xs text-muted-foreground/70">{r.action}</div>
        </div>
      ),
    },
    {
      key: 'target',
      header: t.colTarget,
      render: (r) => {
        const href = targetHref(r)
        const label = r.resourceId ? `${r.resourceType} · ${r.resourceId.slice(0, 8)}…` : r.resourceType
        return href ? (
          <Link href={href} className="text-xs text-primary hover:underline">
            {label}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">{label}</span>
        )
      },
      headerClassName: 'hidden md:table-cell',
      className: 'hidden md:table-cell',
    },
    {
      key: 'requester',
      header: t.colRequestedBy,
      render: (r) => (
        <div className="text-xs whitespace-nowrap">
          <div className="font-medium">{r.actorName ?? '—'}</div>
          <div className="text-muted-foreground">{formatRelative(r.createdAt, locale)}</div>
        </div>
      ),
    },
    {
      key: 'expires',
      header: t.colExpires,
      render: (r) => (
        <div className="text-xs whitespace-nowrap">
          <div className="font-medium">{formatDateTime(r.expiresAt, locale)}</div>
          <div className="text-muted-foreground">{formatRelative(r.expiresAt, locale)}</div>
        </div>
      ),
      headerClassName: 'hidden lg:table-cell',
      className: 'hidden lg:table-cell',
    },
    {
      key: 'status',
      header: t.colStatus,
      render: (r) => (
        <StatusBadge
          status={r.effectiveStatus}
          label={t.status[r.effectiveStatus]}
          className={r.effectiveStatus === 'consumed' ? 'border-slate-200 bg-slate-100 text-slate-700' : undefined}
        />
      ),
      className: 'whitespace-nowrap',
    },
    {
      key: 'reason',
      header: t.reasonLabel,
      render: (r) => (
        <span className="block max-w-[240px] truncate text-xs text-muted-foreground" title={r.reason ?? undefined}>
          {r.reason || t.noReason}
        </span>
      ),
      headerClassName: 'hidden xl:table-cell',
      className: 'hidden xl:table-cell',
    },
  ]

  const decideColumn: Column<ApprovalListRow> = {
    key: 'decision',
    header: t.colDecision,
    render: (r) => (
      <ApprovalActions
        approvalId={r.id}
        actionLabel={actionLabel(r.action)}
        isOwn={r.actorId === user.id}
        canDecide={
          isTwoPersonAction(r.action) && caps.has(twoPersonActionCapability(r.action))
        }
        copy={t}
        common={dict.admin.common}
      />
    ),
    className: 'whitespace-nowrap',
  }

  const historyColumns: Column<ApprovalListRow>[] = [
    ...columns,
    {
      key: 'decision',
      header: t.colDecision,
      render: (r) => (
        <div className="text-xs whitespace-nowrap">
          <span className="font-medium">{t.status[r.effectiveStatus]}</span>
          {r.approverName && <span className="text-muted-foreground"> · {r.approverName}</span>}
          {r.respondedAt && (
            <div className="text-muted-foreground">{formatRelative(r.respondedAt, locale)}</div>
          )}
        </div>
      ),
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
          pendingTotal > 0 ? (
            <StatusBadge status="pending" label={`${pendingTotal} ${t.status.pending.toLowerCase()}`} />
          ) : undefined
        }
      />

      <form method="GET" className="flex flex-wrap items-center gap-1.5">
        <select name="status" defaultValue={params.status ?? ''} aria-label={t.colStatus} className={selectCls}>
          <option value="">{t.allStatuses}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t.status[s]}
            </option>
          ))}
        </select>
        <select name="action" defaultValue={params.action ?? ''} aria-label={t.colAction} className={selectCls}>
          <option value="">{t.allActions}</option>
          {ACTIONS.map((a) => (
            <option key={a} value={a}>
              {t.actions[a]}
            </option>
          ))}
        </select>
        <button type="submit" className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium">
          {t.filter}
        </button>
      </form>

      <section className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-sm font-medium">{t.pendingHeading}</h2>
          <span className="text-xs text-muted-foreground">
            {pendingTotal} {t.status.pending.toLowerCase()}
          </span>
        </div>
        <ApprovalQueueHint copy={t} />
        <DataTable
          rows={pending}
          rowKey={(r) => r.id}
          columns={[...columns, decideColumn]}
          emptyState={<EmptyState message={t.emptyPending} />}
        />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-medium">{t.recentHeading}</h2>
        <DataTable
          rows={history}
          rowKey={(r) => r.id}
          columns={historyColumns}
          emptyMessage={t.empty}
        />
      </section>
    </div>
  )
}
