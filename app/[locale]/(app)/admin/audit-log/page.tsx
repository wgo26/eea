import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getAuditTrail, getAuditFilterOptions } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { ActiveFilters } from '@/components/admin/filter-pills'
import { Pager } from '@/components/admin/pager'
import { AuditTable } from './audit-table'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.audit.title }
}

const PAGE_SIZE = 50

type SearchParams = {
  action?: string
  resource?: string
  origin?: string
  q?: string
  from?: string
  to?: string
  page?: string
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  await requireCapability('viewAuditLog', '/admin/audit-log')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.audit

  const params = await searchParams
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)
  const origin =
    params.origin === 'system' || params.origin === 'moderation' ? params.origin : undefined

  const [{ rows: entries, total }, filterOptions] = await Promise.all([
    getAuditTrail({
      limit: PAGE_SIZE,
      page,
      action: params.action,
      resourceType: params.resource,
      actor: undefined,
      origin: origin ?? 'all',
      search: params.q,
      from: params.from,
      to: params.to,
      locale,
    }),
    getAuditFilterOptions(),
  ])

  const filterParams = () => {
    const sp = new URLSearchParams()
    if (params.action) sp.set('action', params.action)
    if (params.resource) sp.set('resource', params.resource)
    if (params.origin) sp.set('origin', params.origin)
    if (params.q) sp.set('q', params.q)
    if (params.from) sp.set('from', params.from)
    if (params.to) sp.set('to', params.to)
    return sp
  }

  const pageHref = (p: number) => {
    const sp = filterParams()
    sp.set('page', String(p))
    return `${localePath(locale, '/admin/audit-log')}?${sp.toString()}`
  }

  // Removing one chip keeps the other filters; the page resets to 1 because
  // the result set changes. `range` removes both date bounds at once.
  const hrefWithout = (...drop: string[]) => {
    const sp = filterParams()
    for (const k of drop) sp.delete(k)
    sp.delete('page')
    const qs = sp.toString()
    return `${localePath(locale, '/admin/audit-log')}${qs ? `?${qs}` : ''}`
  }

  const selectCls = 'rounded-md border border-border bg-background px-2.5 py-1.5 text-xs'
  const inputCls = `${selectCls} min-w-[180px] flex-1`

  const humanize = (v: string) => v.replace(/[:_]/g, ' ')

  const exportHref = (() => {
    const qs = filterParams().toString()
    return `${localePath(locale, '/admin/audit-log/export')}${qs ? `?${qs}` : ''}`
  })()
  const hasFilters = !!(params.action || params.resource || params.origin || params.q || params.from || params.to)

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <a
            href={exportHref}
            className="inline-flex min-h-[32px] items-center rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            title={hasFilters ? t.exportFiltered : t.exportCsv}
          >
            {hasFilters ? t.exportFiltered : t.exportCsv}
          </a>
        }
      />

      <form method="GET" className="flex flex-wrap items-center gap-1.5">
        <select name="origin" defaultValue={params.origin ?? ''} aria-label={t.colOrigin} className={selectCls}>
          <option value="">{t.allOrigins}</option>
          <option value="system">{t.system}</option>
          <option value="moderation">{t.originModeration}</option>
        </select>
        <select name="action" defaultValue={params.action ?? ''} aria-label={t.actionPlaceholder} className={selectCls}>
          <option value="">{t.allActions}</option>
          {filterOptions.actions.map((a) => (
            <option key={a} value={a}>{humanize(a)}</option>
          ))}
        </select>
        <select name="resource" defaultValue={params.resource ?? ''} aria-label={t.entityPlaceholder} className={selectCls}>
          <option value="">{t.allEntities}</option>
          {filterOptions.resourceTypes.map((e) => (
            <option key={e} value={e}>{humanize(e)}</option>
          ))}
        </select>
        <input type="date" name="from" defaultValue={params.from ?? ''} aria-label={t.fromLabel} className={selectCls} />
        <input type="date" name="to" defaultValue={params.to ?? ''} aria-label={t.toLabel} className={selectCls} />
        <input
          type="search"
          name="q"
          defaultValue={params.q ?? ''}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchPlaceholder}
          className={inputCls}
        />
        <button type="submit" className="rounded-md border border-border px-2.5 py-1.5 text-xs font-medium">{t.filter}</button>
      </form>

      {/* Active filters as removable chips (Phase D) — this trail usually runs
          filtered, so the applied state sits directly above the rows. */}
      <ActiveFilters
        chips={[
          ...(origin
            ? [{ key: 'origin', label: `${t.colOrigin}: ${origin === 'system' ? t.system : t.originModeration}`, removeHref: hrefWithout('origin') }]
            : []),
          ...(params.action
            ? [{ key: 'action', label: `${t.colAction}: ${humanize(params.action)}`, removeHref: hrefWithout('action') }]
            : []),
          ...(params.resource
            ? [{ key: 'resource', label: `${t.entityPlaceholder}: ${humanize(params.resource)}`, removeHref: hrefWithout('resource') }]
            : []),
          ...(params.from || params.to
            ? [{ key: 'range', label: `${t.fromLabel} ${params.from ?? '…'} → ${t.toLabel} ${params.to ?? '…'}`, removeHref: hrefWithout('from', 'to') }]
            : []),
          ...(params.q
            ? [{ key: 'q', label: `${dict.admin.common.search}: ${params.q}`, removeHref: hrefWithout('q') }]
            : []),
        ]}
        clearAllHref={localePath(locale, '/admin/audit-log')}
        labels={dict.admin.common}
      />

      <AuditTable rows={entries} copy={t} common={dict.admin.common} locale={locale} />

      <Pager page={page} pageSize={PAGE_SIZE} total={total} hrefFor={pageHref} copy={dict.admin.common} />
    </div>
  )
}
