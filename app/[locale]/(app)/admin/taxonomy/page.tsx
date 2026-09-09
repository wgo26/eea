import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { isAdminRoles } from '@/lib/auth/roles'
import { getCategoriesAdmin, getLocationsAdmin } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { Tabs } from '@/components/admin/tabs'
import { DataTable } from '@/components/admin/data-table'
import { CategoryCreateForm, CategoryRowActions } from './category-client'
import { LocationCreateForm, LocationRowActions } from './location-client'

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
  searchParams: Promise<{ tab?: string }>
}) {
  const { roles } = await requireCapability('manageContent', '/admin/taxonomy')
  const canDelete = isAdminRoles(roles)
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.taxonomy
  const tf = dict.admin.typeFilters
  const common = dict.admin.common

  const params = await searchParams
  const activeTab = params.tab === 'locations' ? 'locations' : 'categories'

  const [categories, locations] = await Promise.all([getCategoriesAdmin(), getLocationsAdmin()])

  const base = localePath(locale, '/admin/taxonomy')

  return (
    <div className="space-y-5">
      <PageHeader title={t.title} description={t.description} />

      <Tabs
        tabs={[
          { key: 'categories', label: t.tabCategories, count: categories.length },
          { key: 'locations', label: t.tabLocations, count: locations.length },
        ]}
        active={activeTab}
        hrefFor={(key) => `${base}?tab=${key}`}
      />

      {activeTab === 'categories' ? (
        <div className="space-y-5">
          <CategoryCreateForm copy={t} common={common} typeFilters={tf} />

          <DataTable
            rows={categories}
            rowKey={(r) => r.id}
            emptyMessage={t.categoriesEmpty}
            columns={[
              {
                key: 'name',
                header: t.colName,
                render: (r) => {
                  const primary = locale === 'fr' ? (r.nameFr ?? r.nameEn ?? r.slug) : (r.nameEn ?? r.slug)
                  const secondary = locale === 'fr' ? (r.nameFr ? r.nameEn : null) : r.nameFr
                  return (
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{primary}</div>
                      {secondary && <div className="text-xs text-muted-foreground truncate">{secondary}</div>}
                      {!r.nameFr && (
                        <div className="mt-1 inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                          {dict.admin.common.missingFr}
                        </div>
                      )}
                    </div>
                  )
                },
              },
              { key: 'slug', header: t.colSlug, render: (r) => <span className="text-xs font-mono">{r.slug}</span> },
              {
                key: 'type',
                header: t.colType,
                render: (r) => (
                  <span className="text-xs text-muted-foreground">
                    {tf[TYPE_LABEL_KEY[r.contentType]] ?? r.contentType}
                  </span>
                ),
              },
              { key: 'usage', header: t.colUsage, render: (r) => <span className="text-xs tabular-nums">{r.itemCount}</span> },
              {
                key: 'status',
                header: t.colStatus,
                render: (r) => (
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${r.isActive ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${r.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                    {r.isActive ? t.active : t.inactive}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: '',
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
      ) : (
        <div className="space-y-5">
          <LocationCreateForm copy={t} common={common} locations={locations} />

          <DataTable
            rows={locations}
            rowKey={(r) => r.id}
            emptyMessage={t.locationsEmpty}
            columns={[
              {
                key: 'name',
                header: t.colName,
                render: (r) => (
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium truncate">{r.name}</span>
                      <span
                        className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide border border-border bg-muted text-muted-foreground"
                        title={t.localeLabel}
                      >
                        {(r.locale ?? 'en').toUpperCase()}
                      </span>
                    </div>
                    {r.locationType && <div className="text-xs text-muted-foreground truncate">{r.locationType}</div>}
                  </div>
                ),
              },
              { key: 'slug', header: t.colSlug, render: (r) => <span className="text-xs font-mono">{r.slug}</span> },
              {
                key: 'parent',
                header: t.colParent,
                render: (r) => <span className="text-xs text-muted-foreground">{r.parentName ?? '—'}</span>,
              },
              {
                key: 'usage',
                header: t.colUsage,
                render: (r) => (
                  <div className="text-xs tabular-nums text-muted-foreground">
                    <div>{r.contentCount} {t.usageContent}</div>
                    <div>{r.profileCount} {t.usageProfiles}</div>
                  </div>
                ),
              },
              {
                key: 'status',
                header: t.colStatus,
                render: (r) => (
                  <span className={`inline-flex items-center gap-1 text-xs font-medium ${r.isActive ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${r.isActive ? 'bg-emerald-500' : 'bg-muted-foreground/30'}`} />
                    {r.isActive ? t.active : t.inactive}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: '',
                render: (r) => (
                  <LocationRowActions
                    location={r}
                    locations={locations}
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
