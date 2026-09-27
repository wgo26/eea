import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { isAdminRoles } from '@/lib/auth/roles'
import { getContentItems, getHomepageSlots, getCategoriesAdmin, getLocations } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { Tabs } from '@/components/admin/tabs'
import { Pager } from '@/components/admin/pager'
import { FilterPills, SearchBar, ActiveFilters } from '@/components/admin/filter-pills'
import { TypeFilter, SortFilter } from '@/components/admin/type-filter'
import { EmptyState } from '@/components/admin/empty-state'
import { ContentTable } from './content-table'
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
  { key: 'micro_story', dictKey: 'microStory' },
] as const

const SORT_OPTIONS = [
  { key: 'updated_desc', dictKey: 'sortUpdatedDesc' },
  { key: 'updated_asc', dictKey: 'sortUpdatedAsc' },
  { key: 'published_desc', dictKey: 'sortPublishedDesc' },
  { key: 'published_asc', dictKey: 'sortPublishedAsc' },
] as const

const VALID_SORTS = SORT_OPTIONS.map((s) => s.key)
const VALID_STATUSES = STATUS_TABS.map((s) => s.key)
const VALID_TYPES = TYPE_FILTERS.map((f) => f.key)

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; tab?: string; page?: string; q?: string; edit?: string; create?: string; sort?: string }>
}) {
  const { roles } = await requireCapability('manageContent', '/admin/content')
  const canDelete = isAdminRoles(roles)
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.content
  const tf = dict.admin.typeFilters
  const tc = dict.admin.common

  const params = await searchParams
  const status = VALID_STATUSES.includes(params.status as typeof VALID_STATUSES[number]) ? params.status! : 'all'
  const type = (VALID_TYPES.includes(params.type as typeof VALID_TYPES[number]) ? params.type : 'all') as 'all' | 'photo_story' | 'news' | 'listing' | 'notice' | 'culture' | 'micro_story'
  const activeTab = params.tab || 'content'
  const search = params.q || undefined
  const sort = VALID_SORTS.includes(params.sort as typeof VALID_SORTS[number]) ? params.sort! : 'updated_desc'
  const PAGE_SIZE = 20
  const rawPage = Number(params.page ?? '1')
  const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1

  const [content, slots, categories, locations] = await Promise.all([
     getContentItems({ status, type, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, locale, search, sort }),
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
  // Single helper so every link preserves the full filter state — one place
  // to update when a new filter (like `sort`) is added, instead of N
  // hand-built template strings drifting apart.
  const listHref = (overrides: { status?: string; type?: string; sort?: string; q?: string; page?: number; tab?: string } = {}) => {
    const s = overrides.status ?? status
    const ty = overrides.type ?? type
    const so = overrides.sort ?? sort
    const query = overrides.q !== undefined ? overrides.q : search
    const tb = overrides.tab ?? 'content'
    const p = overrides.page ?? 1
    const qs = `tab=${tb}&status=${s}&type=${ty}&sort=${so}${query ? `&q=${encodeURIComponent(query)}` : ''}${p > 1 ? `&page=${p}` : ''}`
    return `${base}?${qs}`
  }
  const listQuery = `tab=content&status=${status}&type=${type}&sort=${sort}${search ? `&q=${encodeURIComponent(search)}` : ''}`
  const statusHref = (key: string) => listHref({ status: key })
  // Search submits via GET hidden inputs (see SearchBar `hidden`), so the
  // action is the bare list URL — query-string actions get dropped by
  // browsers on GET submits.
  // The row-title edit deep-link travels to ContentTable (a Client Component)
  // as a plain STRING prefix; the table appends the row id. Closures cannot
  // cross the server → client boundary — React throws "Functions cannot be
  // passed directly to Client Components" and the whole page falls to the
  // error boundary (same rule documented on Tabs/Pager).
  const editHrefPrefix = `${base}?${listQuery}${page > 1 ? `&page=${page}` : ''}&edit=`

  const createDialog = (
    <ContentCreateDialog
      copy={t}
      common={dict.admin.common}
      typeFilters={tf}
      locations={locationOptions}
      categoriesByType={categoriesByType}
      autoOpen={params.create === 'new'}
    />
  )

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            {createDialog}
            <Link
              href={localePath(locale, '/admin/content/import')}
              className="inline-flex min-h-[32px] items-center rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {t.importButton}
            </Link>
          </div>
        }
      />
      <Tabs
        tabs={[
          { key: 'content', label: t.tabContent, count: content.total },
          { key: 'homepage', label: t.tabHomepage, count: slots.length },
        ]}
        active={activeTab}
        hrefFor={(key) => listHref({ tab: key })}
      />

      {activeTab === 'homepage' ? (
        <HomepageCuration slots={slots} copy={t} common={dict.admin.common} locale={locale} />
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
            <div className="flex flex-wrap items-center gap-2">
              <TypeFilter
                value={type}
                options={TYPE_FILTERS.map((f) => ({ key: f.key, label: tf[f.dictKey] }))}
                action={base}
                ariaLabel={t.type}
                hidden={{ tab: 'content', status, q: search, sort }}
              />
              <SortFilter
                value={sort}
                options={SORT_OPTIONS.map((s) => ({ key: s.key, label: t[s.dictKey] }))}
                action={base}
                ariaLabel={t.sortField}
                hidden={{ tab: 'content', status, type, q: search }}
              />
              <SearchBar
                name="q"
                defaultValue={search}
                placeholder={tc.searchPlaceholder}
                action={base}
                hidden={{ tab: 'content', status, type, sort }}
                className="w-full sm:w-64"
              />
            </div>
          </div>

          {/* Progressive disclosure (Phase D): the applied filters are the
              exception, not the chrome — surface them as removable chips so
              an editor never wonders whether the list is filtered. */}
          <ActiveFilters
            chips={[
              ...(status !== 'all'
                ? [{
                    key: 'status',
                    label: `${t.colStatus}: ${t[STATUS_TABS.find((s) => s.key === status)?.dictKey ?? 'statusAll']}`,
                    removeHref: listHref({ status: 'all' }),
                  }]
                : []),
              ...(type !== 'all'
                ? [{
                    key: 'type',
                    label: tf[TYPE_FILTERS.find((f) => f.key === type)?.dictKey ?? 'all'],
                    removeHref: listHref({ type: 'all' }),
                  }]
                : []),
              ...(sort !== 'updated_desc'
                ? [{
                    key: 'sort',
                    label: `${t.sortField}: ${t[SORT_OPTIONS.find((s) => s.key === sort)?.dictKey ?? 'sortUpdatedDesc']}`,
                    removeHref: listHref({ sort: 'updated_desc' }),
                  }]
                : []),
              ...(search
                ? [{
                    key: 'q',
                    label: `${tc.search}: ${search}`,
                    removeHref: listHref({ q: '' }),
                  }]
                : []),
            ]}
            clearAllHref={`${base}?tab=content`}
            labels={tc}
          />

          {content.total === 0 ? (
            <EmptyState
              message={search ? tc.emptyFiltered : t.empty}
              action={createDialog}
            />
          ) : (
            <>
            <ContentTable
              rows={content.rows}
              canDelete={canDelete}
              copy={t}
              common={tc}
              typeFilters={tf}
              locale={locale}
              locations={locationOptions}
              categoriesByType={categoriesByType}
              editId={params.edit}
              editHrefPrefix={editHrefPrefix}
            />
            <Pager
              page={page}
              pageSize={PAGE_SIZE}
              total={content.total}
              hrefFor={(p) => listHref({ page: p })}
              copy={dict.admin.common}
            />
            </>
          )}
        </>
      )}
    </div>
  )
}
