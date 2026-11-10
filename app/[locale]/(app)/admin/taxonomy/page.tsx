import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { isAdminRoles } from '@/lib/auth/roles'
import { getCategoriesAdmin, getLocationsAdmin, getLocationTypesAdmin, getLocationTagsAdmin } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { Tabs } from '@/components/admin/tabs'
import { DataTable } from '@/components/admin/data-table'
import { SearchBar } from '@/components/admin/filter-pills'
import { CategoryCreateForm, CategoryRowActions } from './category-client'
import { LocationCreateForm, LocationRowActions } from './location-client'
import { LocationTypeCreateForm, LocationTypeRowActions } from './location-type-client'
import { LocationTagCreateForm, LocationTagRowActions } from './location-tag-client'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.taxonomy.title }
}

const TYPE_LABEL_KEY: Record<string, 'photoStory' | 'news' | 'listings' | 'notices' | 'culture'> = {
  photo_story: 'photoStory',
  news: 'news',
  listing: 'listings',
  notice: 'notices',
  culture: 'culture',
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>
}) {
  const { roles } = await requireCapability('manageContent', '/admin/taxonomy')
  const canDelete = isAdminRoles(roles)
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.taxonomy
  const tf = dict.admin.typeFilters
  const common = dict.admin.common

  const params = await searchParams
  const activeTab = params.tab === 'locations' ? 'locations' : params.tab === 'location-types' ? 'location-types' : params.tab === 'location-tags' ? 'location-tags' : 'categories'
  const search = params.q?.trim() || undefined

  const [categories, locations, types, tags] = await Promise.all([
    getCategoriesAdmin(search),
    getLocationsAdmin(search),
    getLocationTypesAdmin(),
    getLocationTagsAdmin(),
  ])

  const base = localePath(locale, '/admin/taxonomy')
  const qs = search ? `&q=${encodeURIComponent(search)}` : ''

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        description={t.description}
        breadcrumb={[
          { label: dict.admin.sidebar.dashboard, href: localePath(locale, '/admin/dashboard') },
          { label: t.title },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { key: 'categories', label: t.tabCategories, count: categories.length },
            { key: 'locations', label: t.tabLocations, count: locations.length },
            { key: 'location-types', label: t.locationTypes, count: types.length },
            { key: 'location-tags', label: t.locationTags, count: tags.length },
          ]}
          active={activeTab}
          hrefFor={(key) => `${base}?tab=${key}${qs}`}
        />
        <SearchBar
          name="q"
          defaultValue={search}
          placeholder={common.searchPlaceholder}
          action={base}
          hidden={{ tab: activeTab }}
          className="w-full sm:w-64"
        />
      </div>

      {activeTab === 'categories' ? (
        <div className="space-y-5">
          <CategoryCreateForm copy={t} common={common} typeFilters={tf} />

          <DataTable
            rows={categories}
            rowKey={(r) => r.id}
            emptyMessage={search ? common.emptyFiltered : t.categoriesEmpty}
            columns={[
              {
                key: 'name',
                header: t.colName,
                render: (r) => {
                  const primary = locale === 'fr' ? (r.nameFr ?? r.nameEn ?? r.slug) : (r.nameEn ?? r.slug)
                  const secondary = locale === 'fr' ? (r.nameFr ? r.nameEn : null) : r.nameFr
                  return (
                    <div className="min-w-[140px] max-w-[240px]">
                      <div className="text-sm font-medium truncate">{primary}</div>
                      {secondary && <div className="text-xs text-muted-foreground truncate">{secondary}</div>}
                      {!r.nameFr && (
                        <div className="mt-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                          {dict.admin.common.missingFr}
                        </div>
                      )}
                    </div>
                  )
                },
              },
              { key: 'slug', header: t.colSlug, render: (r) => <span className="text-xs font-mono whitespace-nowrap">{r.slug}</span>, headerClassName: 'hidden md:table-cell', className: 'hidden md:table-cell whitespace-nowrap' },
              {
                key: 'type',
                header: t.colType,
                render: (r) => (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {tf[TYPE_LABEL_KEY[r.contentType]] ?? r.contentType}
                  </span>
                ),
                headerClassName: 'hidden sm:table-cell',
                className: 'hidden sm:table-cell whitespace-nowrap',
              },
              { key: 'usage', header: t.colUsage, render: (r) => <span className="text-xs tabular-nums whitespace-nowrap">{r.itemCount}</span>, className: 'whitespace-nowrap' },
              {
                key: 'status',
                header: t.colStatus,
                render: (r) => (
                  <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium ${r.isActive ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${r.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                    {r.isActive ? t.active : t.inactive}
                  </span>
                ),
                className: 'whitespace-nowrap',
              },
              {
                key: 'actions',
                header: '',
                stickyRight: true,
                render: (r) => (
                  <CategoryRowActions
                    category={r}
                    siblings={categories}
                    copy={t}
                    common={common}
                    typeFilters={tf}
                    canDelete={canDelete}
                  />
                ),
                className: 'text-right',
              },
            ]}
          />
        </div>
      ) : activeTab === 'locations' ? (
        <div className="space-y-5">
          <LocationCreateForm copy={t} common={common} locations={locations} types={types} tags={tags} />

          <DataTable
            rows={locations}
            rowKey={(r) => r.id}
            emptyMessage={search ? common.emptyFiltered : t.locationsEmpty}
            columns={[
              {
                key: 'name',
                header: t.colName,
                render: (r) => (
                  <div className="min-w-[140px] max-w-[240px]">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{r.name}</span>
                      <span
                        className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide border border-border bg-muted text-muted-foreground"
                        title={t.localeLabel}
                      >
                        {(r.locale ?? 'en').toUpperCase()}
                      </span>
                    </div>
                    {r.locationType && <div className="text-xs text-muted-foreground truncate">{r.locationType}</div>}
                  </div>
                ),
              },
              { key: 'slug', header: t.colSlug, render: (r) => <span className="text-xs font-mono whitespace-nowrap">{r.slug}</span>, headerClassName: 'hidden md:table-cell', className: 'hidden md:table-cell whitespace-nowrap' },
              {
                key: 'parent',
                header: t.colParent,
                render: (r) => <span className="text-xs text-muted-foreground truncate block max-w-[140px]">{r.parentName ?? '—'}</span>,
                headerClassName: 'hidden lg:table-cell',
                className: 'hidden lg:table-cell',
              },
              {
                key: 'usage',
                header: t.colUsage,
                render: (r) => (
                  <div className="text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                    <div>{r.contentCount} {t.usageContent}</div>
                    <div>{r.profileCount} {t.usageProfiles}</div>
                  </div>
                ),
                headerClassName: 'hidden sm:table-cell',
                className: 'hidden sm:table-cell whitespace-nowrap',
              },
              {
                key: 'status',
                header: t.colStatus,
                render: (r) => (
                  <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium ${r.isActive ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${r.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                    {r.isActive ? t.active : t.inactive}
                  </span>
                ),
                className: 'whitespace-nowrap',
              },
              {
                key: 'actions',
                header: '',
                stickyRight: true,
                render: (r) => (
                  <LocationRowActions
                    location={r}
                    locations={locations}
                    types={types}
                    tags={tags}
                    copy={t}
                    common={common}
                    canDelete={canDelete}
                  />
                ),
                className: 'text-right',
              },
            ]}
          />
        </div>
      ) : activeTab === 'location-types' ? (
        <div className="space-y-5">
          <LocationTypeCreateForm copy={t} common={common} />

          <DataTable
            rows={types}
            rowKey={(r) => r.id}
            emptyMessage={search ? common.emptyFiltered : t.locationsEmpty}
            columns={[
              {
                key: 'name',
                header: t.colTypeName,
                render: (r) => (
                  <div className="min-w-[140px] max-w-[240px]">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{r.nameEn}</span>
                      <span className="text-xs text-muted-foreground truncate">{r.nameFr}</span>
                    </div>
                    <span className="mt-1 inline-flex items-center rounded-full border border-border/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {r.slug}
                    </span>
                  </div>
                ),
              },
              {
                key: 'icon',
                header: t.locationTypeIcon,
                render: (r) => <span className="text-xs text-muted-foreground whitespace-nowrap">{r.icon ?? '—'}</span>,
                headerClassName: 'hidden sm:table-cell',
                className: 'hidden sm:table-cell whitespace-nowrap',
              },
              {
                key: 'color',
                header: t.locationTypeColor,
                render: (r) => (
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: r.color ?? '#000000' }} />
                    {r.color ?? '—'}
                  </span>
                ),
                headerClassName: 'hidden sm:table-cell',
                className: 'hidden sm:table-cell whitespace-nowrap',
              },
              {
                key: 'sortOrder',
                header: t.locationTypeSortOrder,
                render: (r) => <span className="text-xs tabular-nums whitespace-nowrap">{r.sortOrder}</span>,
                headerClassName: 'hidden sm:table-cell',
                className: 'hidden sm:table-cell whitespace-nowrap',
              },
              {
                key: 'actions',
                header: '',
                stickyRight: true,
                render: (r) => (
                  <LocationTypeRowActions
                    type={r}
                    types={types}
                    copy={t}
                    common={common}
                    canDelete={canDelete}
                  />
                ),
                className: 'text-right',
              },
            ]}
          />
        </div>
      ) : (
        <div className="space-y-5">
          <LocationTagCreateForm copy={t} common={common} />

          <DataTable
            rows={tags}
            rowKey={(r) => r.id}
            emptyMessage={search ? common.emptyFiltered : t.locationsEmpty}
            columns={[
              {
                key: 'name',
                header: t.colTagName,
                render: (r) => (
                  <div className="min-w-[140px] max-w-[240px]">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">{r.nameEn}</span>
                      <span className="text-xs text-muted-foreground truncate">{r.nameFr}</span>
                    </div>
                    <span className="mt-1 inline-flex items-center rounded-full border border-border/50 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {r.slug}
                    </span>
                  </div>
                ),
              },
              {
                key: 'color',
                header: t.locationTagColor,
                render: (r) => (
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: r.color ?? '#000000' }} />
                    {r.color ?? '—'}
                  </span>
                ),
                headerClassName: 'hidden sm:table-cell',
                className: 'hidden sm:table-cell whitespace-nowrap',
              },
              {
                key: 'actions',
                header: '',
                stickyRight: true,
                render: (r) => (
                  <LocationTagRowActions
                    tag={r}
                    copy={t}
                    common={common}
                    canDelete={canDelete}
                  />
                ),
                className: 'text-right',
              },
            ]}
          />
        </div>
      )}
    </div>
  )
}
