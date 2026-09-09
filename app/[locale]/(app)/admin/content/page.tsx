import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { isAdminRoles } from '@/lib/auth/roles'
import { getContentItems, getHomepageSlots, getCategoriesAdmin, getLocations } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { Tabs } from '@/components/admin/tabs'
import { PaginationBar } from '@/components/admin/pagination'
import { StatusBadge, TypeBadge } from '@/components/admin/status-badge'
import { localizeStatus, localizeType } from '@/lib/admin/labels'
import { DataTable } from '@/components/admin/data-table'
import { FilterPills, SearchBar } from '@/components/admin/filter-pills'
import { EmptyState } from '@/components/admin/empty-state'
import { formatRelative } from '@/lib/admin/format'
import { ContentActions } from './content-actions'
import { ContentBulkActions } from './content-bulk-actions'
import Link from 'next/link'
import { ContentCreateDialog, ContentDeleteButton, ContentEditTrigger } from './content-dialogs'
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
  searchParams: Promise<{ status?: string; type?: string; tab?: string; page?: string; q?: string; edit?: string }>
}) {
  const { roles } = await requireCapability('manageContent', '/admin/content')
  const canDelete = isAdminRoles(roles)
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.content
  const tf = dict.admin.typeFilters
  const tc = dict.admin.common

  const params = await searchParams
  const status = params.status || 'all'
  const type = (params.type as 'all' | 'photo_story' | 'news' | 'listing' | 'notice' | 'culture') || 'all'
  const activeTab = params.tab || 'content'
  const search = params.q || undefined
  const PAGE_SIZE = 20
  const rawPage = Number(params.page ?? '1')
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1

  const [content, slots, categories, locations] = await Promise.all([
    getContentItems({ status, type, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, locale, search }),
    getHomepageSlots(locale),
    getCategoriesAdmin(),
    getLocations(),
  ])

  // Group categories by content_type for the create/edit dialogs.
  const categoriesByType: Record<string, { id: string; name: string }[]> = {}
  for (const c of categories) {
    if (!c.isActive) continue
    const name = locale === 'fr' ? (c.nameFr ?? c.nameEn ?? c.slug) : (c.nameEn ?? c.slug)
    const entry = { id: c.id, name }
    categoriesByType[c.contentType] = [...(categoriesByType[c.contentType] ?? []), entry]
  }
  const locationOptions = locations.map((l) => ({ id: l.id, name: l.name }))

  const base = localePath(locale, '/admin/content')
  const statusHref = (key: string) => `${base}?tab=content&status=${key}&type=${type}${search ? `&q=${encodeURIComponent(search)}` : ''}`
  const typeHref = (key: string) => `${base}?tab=content&status=${status}&type=${key}${search ? `&q=${encodeURIComponent(search)}` : ''}`
  const searchAction = `${base}?tab=content&status=${status}&type=${type}`

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

      <Tabs
        tabs={[
          { key: 'content', label: t.tabContent, count: content.total },
          { key: 'homepage', label: t.tabHomepage, count: slots.length },
        ]}
        active={activeTab}
        hrefFor={(key) => `${base}?tab=${key}&status=${status}&type=${type}`}
      />

      {activeTab === 'homepage' ? (
        <HomepageCuration slots={slots} copy={t} locale={locale} />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <FilterPills
              pills={STATUS_TABS.map((s) => ({
                key: s.key,
                label: t[s.dictKey],
                href: statusHref(s.key),
              }))}
              active={status}
            />
            <SearchBar
              name="q"
              defaultValue={search}
              placeholder={tc.searchPlaceholder}
              action={searchAction}
              className="w-full sm:w-64"
            />
          </div>

          <FilterPills
            pills={TYPE_FILTERS.map((f) => ({
              key: f.key,
              label: tf[f.dictKey],
              href: typeHref(f.key),
            }))}
            active={type}
          />

          <div className="flex justify-end gap-2">
            <Link
              href={localePath(locale, '/admin/content/import')}
              className="inline-flex min-h-[36px] items-center rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.importButton}
            </Link>
            <ContentCreateDialog
              copy={t}
              common={dict.admin.common}
              typeFilters={tf}
              locations={locationOptions}
              categoriesByType={categoriesByType}
            />
          </div>

          {content.total === 0 ? (
            <EmptyState
              message={search ? tc.emptyFiltered : t.empty}
              action={<ContentCreateDialog copy={t} common={dict.admin.common} typeFilters={tf} locations={locationOptions} categoriesByType={categoriesByType} />}
            />
          ) : (
            <>
            <ContentBulkActions
              rows={content.rows}
              canDelete={canDelete}
              copy={t}
              common={tc}
            />
            <DataTable
              rows={content.rows}
              rowKey={(r) => r.id}
              columns={[
                { key: 'title', header: t.colTitle, render: (r) => <ContentTitleCell row={r} copy={t} locale={locale} /> },
                { key: 'type', header: t.colType, render: (r) => <TypeBadge type={r.type} label={localizeType(r.type, dict.admin.common)} /> },
                { key: 'status', header: t.colStatus, render: (r) => <StatusBadge status={r.status} label={localizeStatus(r.status, dict.admin.common)} /> },
                { key: 'updated', header: t.colUpdated, render: (r) => <time className="text-xs text-muted-foreground">{formatRelative(r.updatedAt ?? r.createdAt)}</time> },
                {
                  key: 'actions',
                  header: '',
                  render: (r) => (
                    <div className="flex items-center justify-end gap-2">
                      <ContentEditTrigger
                        content={r}
                        copy={t}
                        common={dict.admin.common}
                        locations={locationOptions}
                        categoriesByType={categoriesByType}
                        autoOpen={params.edit === r.id}
                      />
                      <ContentActions content={r} copy={t} common={dict.admin.common} />
                      {canDelete && <ContentDeleteButton content={r} copy={t} common={dict.admin.common} />}
                    </div>
                  ),
                  className: 'text-right',
                },
              ]}
            />
            <PaginationBar
              page={page}
              pageSize={PAGE_SIZE}
              total={content.total}
              copy={dict.admin.common}
              hrefFor={(p) => `${base}?tab=content&status=${status}&type=${type}${search ? `&q=${encodeURIComponent(search)}` : ''}&page=${p}`}
            />
            </>
          )}
        </>
      )}
    </div>
  )
}

function ContentTitleCell({ row, copy, locale }: { row: ContentRow; copy: ReturnType<typeof getDictionary>['admin']['content']; locale: string }) {
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
        {row.missingLocale && (
          <span
            className="mt-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
            title={copy.bilingualHint}
          >
            {locale === 'fr' ? 'FR manquant — EN affiché' : 'FR missing — showing EN'}
          </span>
        )}
      </div>
    </div>
  )
}
