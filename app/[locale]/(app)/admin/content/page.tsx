import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { isAdminRoles } from '@/lib/auth/roles'
import { getContentItems, getHomepageSlots, getCategoriesAdmin, getLocations } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { Tabs } from '@/components/admin/tabs'
import { PaginationBar } from '@/components/admin/pagination'
import { FilterPills, SearchBar } from '@/components/admin/filter-pills'
import { EmptyState } from '@/components/admin/empty-state'
import { ContentTable } from './content-bulk-actions'
import Link from 'next/link'
import { ContentCreateDialog } from './content-dialogs'
import { HomepageCuration } from './homepage-curation'

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
            <ContentTable
              rows={content.rows}
              canDelete={canDelete}
              copy={t}
              common={tc}
              typeLabels={dict.admin.common}
              locale={locale}
              locations={locationOptions}
              categoriesByType={categoriesByType}
              editId={params.edit}
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
