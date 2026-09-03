import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { getRecentModeration } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { DataTable } from '@/components/admin/data-table'
import { formatDateTime, formatRelative } from '@/lib/admin/format'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.audit.title }
}

export default async function Page() {
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.audit

  const entries = await getRecentModeration(50)

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

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
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-secondary text-secondary-foreground">
              {r.action}
            </span>
          ) },
          { key: 'content', header: t.colContent, render: (r) => (
            <div className="min-w-0">
              {r.contentTitle ? (
                <div className="text-sm font-medium truncate">{r.contentTitle}</div>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
              {r.contentType && <div className="text-xs text-muted-foreground">{r.contentType}</div>}
            </div>
          ) },
          { key: 'transition', header: t.colTransition, render: (r) => (
            <div className="text-xs text-muted-foreground">
              {r.fromStatus && <span>{r.fromStatus}</span>}
              {r.fromStatus && r.toStatus && <span> → </span>}
              {r.toStatus && <span className="font-medium text-foreground">{r.toStatus}</span>}
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

