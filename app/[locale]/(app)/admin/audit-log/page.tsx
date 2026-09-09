import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getRecentModeration } from '@/lib/admin/queries'
import { localizeStatus, localizeType } from '@/lib/admin/labels'
import { PageHeader } from '@/components/admin/page-header'
import { DataTable } from '@/components/admin/data-table'
import { formatDateTime, formatRelative } from '@/lib/admin/format'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.audit.title }
}

export default async function Page({ searchParams }: { searchParams: Promise<{ action?: string; entity?: string }> }) {
  await requireCapability('viewAuditLog', '/admin/audit-log')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.audit

  const params = await searchParams
  const entries = await getRecentModeration(100, { action: params.action, entityType: params.entity }, locale)

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <input name="action" defaultValue={params.action} placeholder={t.actionPlaceholder} aria-label={t.actionPlaceholder} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <input name="entity" defaultValue={params.entity} placeholder={t.entityPlaceholder} aria-label={t.entityPlaceholder} className="rounded-md border border-border bg-background px-3 py-2 text-sm" />
        <button type="submit" className="rounded-md border border-border px-3 py-2 text-sm">{t.filter}</button>
        <a href={localePath(locale, '/admin/audit-log/export')} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground">{t.exportCsv}</a>
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
            <span className="text-xs">{r.actorName ?? t.system}</span>
          ) },
          { key: 'notes', header: t.colNotes, render: (r) => (
            <span className="text-xs text-muted-foreground truncate max-w-[200px] block">{r.notes ?? '—'}</span>
          ) },
        ]}
      />
    </div>
  )
}

