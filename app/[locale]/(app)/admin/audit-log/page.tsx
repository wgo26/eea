import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getRecentModeration, getAuditFilterOptions } from '@/lib/admin/queries'
import { localizeStatus, localizeType } from '@/lib/admin/labels'
import { PageHeader } from '@/components/admin/page-header'
import { DataTable } from '@/components/admin/data-table'
import { Pager } from '@/components/admin/pager'
import { formatDateTime, formatRelative } from '@/lib/admin/format'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.audit.title }
}

const PAGE_SIZE = 50

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; entity?: string; from?: string; to?: string; page?: string }>
}) {
  await requireCapability('viewAuditLog', '/admin/audit-log')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.audit

  const params = await searchParams
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)

  const [{ rows: entries, total }, filterOptions] = await Promise.all([
    getRecentModeration({
      limit: PAGE_SIZE,
      page,
      action: params.action,
      entityType: params.entity,
      from: params.from,
      to: params.to,
      locale,
    }),
    getAuditFilterOptions(),
  ])

  const pageHref = (p: number) => {
    const sp = new URLSearchParams()
    if (params.action) sp.set('action', params.action)
    if (params.entity) sp.set('entity', params.entity)
    if (params.from) sp.set('from', params.from)
    if (params.to) sp.set('to', params.to)
    sp.set('page', String(p))
    return `${localePath(locale, '/admin/audit-log')}?${sp.toString()}`
  }

  const selectCls = 'rounded-md border border-border bg-background px-3 py-2 text-sm'

  const humanize = (v: string) => v.replace(/[:_]/g, ' ')
  const exportHref = (() => {
    const sp = new URLSearchParams()
    if (params.action) sp.set('action', params.action)
    if (params.entity) sp.set('entity', params.entity)
    if (params.from) sp.set('from', params.from)
    if (params.to) sp.set('to', params.to)
    const qs = sp.toString()
    return `${localePath(locale, '/admin/audit-log/export')}${qs ? `?${qs}` : ''}`
  })()
  const hasFilters = !!(params.action || params.entity || params.from || params.to)

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <select name="action" defaultValue={params.action ?? ''} aria-label={t.actionPlaceholder} className={selectCls}>
          <option value="">{t.allActions}</option>
          {filterOptions.actions.map((a) => (
            <option key={a} value={a}>{humanize(a)}</option>
          ))}
        </select>
        <select name="entity" defaultValue={params.entity ?? ''} aria-label={t.entityPlaceholder} className={selectCls}>
          <option value="">{t.allEntities}</option>
          {filterOptions.entityTypes.map((e) => (
            <option key={e} value={e}>{humanize(e)}</option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={params.from ?? ''} aria-label={t.fromLabel} className={selectCls} />
        <input type="date" name="to" defaultValue={params.to ?? ''} aria-label={t.toLabel} className={selectCls} />
        <button type="submit" className="rounded-md border border-border px-3 py-2 text-sm">{t.filter}</button>
        <a href={exportHref} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" title={hasFilters ? t.exportFiltered : t.exportCsv}>{hasFilters ? t.exportFiltered : t.exportCsv}</a>
      </form>

      <DataTable
        rows={entries}
        rowKey={(r) => r.id}
        emptyMessage={t.empty}
        columns={[
          { key: 'time', header: t.colWhen, render: (r) => (
            <div className="text-xs">
              <div className="font-medium">{formatDateTime(r.createdAt)}</div>
              <div className="text-muted-foreground">{formatRelative(r.createdAt)}</div>
            </div>
          ) },
          { key: 'action', header: t.colAction, render: (r) => (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground" title={r.action}>
              {r.action.replace(/[:_]/g, ' ')}
            </span>
          ) },
          { key: 'content', header: t.colContent, render: (r) => (
            <div className="min-w-0">
              {r.contentTitle ? (
                <div className="text-sm font-medium truncate">{r.contentTitle}</div>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
              {r.contentType && <div className="text-xs text-muted-foreground">{localizeType(r.contentType, dict.admin.common)}</div>}
            </div>
          ) },
          { key: 'transition', header: t.colTransition, render: (r) => (
            <div className="text-xs text-muted-foreground">
              {r.fromStatus && <span>{localizeStatus(r.fromStatus, dict.admin.common)}</span>}
              {r.fromStatus && r.toStatus && <span> → </span>}
              {r.toStatus && <span className="font-medium text-foreground">{localizeStatus(r.toStatus, dict.admin.common)}</span>}
              {!r.fromStatus && !r.toStatus && <span>—</span>}
            </div>
          ) },
          { key: 'actor', header: t.colActor, render: (r) => (
            <span className="text-xs">{r.actorName ?? (r.actorId ? t.deletedUser : t.system)}</span>
          ) },
          { key: 'notes', header: t.colNotes, render: (r) => (
            <span className="text-xs text-muted-foreground truncate max-w-[200px] block">{r.notes ?? '—'}</span>
          ) },
        ]}
      />

      <Pager page={page} pageSize={PAGE_SIZE} total={total} hrefFor={pageHref} copy={dict.admin.common} />
    </div>
  )
}

