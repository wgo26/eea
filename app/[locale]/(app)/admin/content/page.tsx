import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { getContentItems, getHomepageSlots } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { Tabs } from '@/components/admin/tabs'
import { StatusBadge, TypeBadge } from '@/components/admin/status-badge'
import { DataTable } from '@/components/admin/data-table'
import { formatRelative } from '@/lib/admin/format'
import { ContentActions } from './content-actions'
import { HomepageCuration } from './homepage-curation'
import type { ContentRow } from '@/lib/admin/queries'
import Image from 'next/image'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.content.title }
}

const STATUS_TABS = [
  { key: 'all', dictKey: 'statusAll' },
  { key: 'published', dictKey: 'statusPublished' },
  { key: 'draft', dictKey: 'statusDraft' },
  { key: 'scheduled', dictKey: 'statusScheduled' },
] as const

const TYPE_FILTERS = [
  { key: 'all', dictKey: 'all' },
  { key: 'photo_story', dictKey: 'photoStory' },
  { key: 'news', dictKey: 'news' },
  { key: 'listing', dictKey: 'listings' },
  { key: 'notice', dictKey: 'notices' },
  { key: 'culture', dictKey: 'culture' },
] as const

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; tab?: string }>
}) {
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.content
  const tf = dict.admin.typeFilters

  const params = await searchParams
  const status = params.status || 'all'
  const type = (params.type as 'all' | 'photo_story' | 'news' | 'listing' | 'notice' | 'culture') || 'all'
  const activeTab = params.tab || 'content'

  const [content, slots] = await Promise.all([
    getContentItems({ status, type, limit: 100 }),
    getHomepageSlots(locale),
  ])

  const base = localePath(locale, '/admin/content')
  const statusHref = (key: string) => `${base}?tab=content&status=${key}&type=${type}`
  const typeHref = (key: string) => `${base}?tab=content&status=${status}&type=${key}`

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

      <Tabs
        tabs={[
          { key: 'content', label: t.tabContent, count: content.length },
          { key: 'homepage', label: t.tabHomepage, count: slots.length },
        ]}
        active={activeTab}
        hrefFor={(key) => `${base}?tab=${key}&status=${status}&type=${type}`}
      />

      {activeTab === 'homepage' ? (
        <HomepageCuration slots={slots} copy={t} />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {STATUS_TABS.map((s) => (
              <a
                key={s.key}
                href={statusHref(s.key)}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  status === s.key
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {t[s.dictKey]}
              </a>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            {TYPE_FILTERS.map((f) => (
              <a
                key={f.key}
                href={typeHref(f.key)}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                  type === f.key
                    ? 'bg-secondary text-secondary-foreground border-secondary'
                    : 'bg-card border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {tf[f.dictKey]}
              </a>
            ))}
          </div>

          {content.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-10 text-center">
              <p className="text-sm text-muted-foreground">{t.empty}</p>
            </div>
          ) : (
            <DataTable
              rows={content}
              rowKey={(r) => r.id}
              columns={[
                { key: 'title', header: t.colTitle, render: (r) => <ContentTitleCell row={r} copy={t} /> },
                { key: 'type', header: t.colType, render: (r) => <TypeBadge type={r.type} /> },
                { key: 'status', header: t.colStatus, render: (r) => <StatusBadge status={r.status} /> },
                { key: 'updated', header: t.colUpdated, render: (r) => <time className="text-xs text-muted-foreground">{formatRelative(r.createdAt)}</time> },
                { key: 'actions', header: '', render: (r) => <ContentActions content={r} copy={t} />, className: 'text-right' },
              ]}
            />
          )}
        </>
      )}
    </div>
  )
}

function ContentTitleCell({ row, copy }: { row: ContentRow; copy: ReturnType<typeof getDictionary>['admin']['content'] }) {
  return (
    <div className="min-w-0 flex items-center gap-3">
      {row.coverUrl ? (
        <Image src={row.coverUrl} alt="" className="h-10 w-10 rounded object-cover bg-muted shrink-0" />
      ) : (
        <div className="h-10 w-10 rounded bg-muted shrink-0" />
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium truncate">{row.title ?? copy.untitled}</div>
        {row.excerpt && <div className="text-xs text-muted-foreground truncate">{row.excerpt}</div>}
      </div>
    </div>
  )
}

