import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getSubmissions, getSubmissionCounts } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { FilterPills, SearchBar, ActiveFilters } from '@/components/admin/filter-pills'
import { Tabs } from '@/components/admin/tabs'
import { Pager } from '@/components/admin/pager'
import { ModerationBulkTable } from './moderation-bulk-actions'
import type { SubmissionStatus } from '@/lib/auth/roles'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.moderation.title }
}

const STATUS_KEYS: (SubmissionStatus | 'all')[] = ['pending', 'needs_clarification', 'approved', 'rejected', 'all']

const TYPE_FILTERS: { key: 'all' | 'photo_story' | 'news' | 'listing' | 'notice' | 'culture'; dictKey: 'all' | 'photoStory' | 'news' | 'listings' | 'notices' | 'culture' }[] = [
  { key: 'all', dictKey: 'all' },
  { key: 'photo_story', dictKey: 'photoStory' },
  { key: 'news', dictKey: 'news' },
  { key: 'listing', dictKey: 'listings' },
  { key: 'notice', dictKey: 'notices' },
  { key: 'culture', dictKey: 'culture' },
]

/** Queue label for a tab key (clarification tab shows the needs_clarification rows). */
const TAB_LABELS: Record<string, keyof ReturnType<typeof getDictionary>['admin']['moderation']> = {
  pending: 'tabPending',
  needs_clarification: 'tabClarification',
  approved: 'tabApproved',
  rejected: 'tabRejected',
  all: 'tabAll',
}

const PAGE_SIZE = 20

const ALL_STATUSES: SubmissionStatus[] = ['pending', 'in_review', 'needs_clarification', 'approved', 'rejected']

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string; page?: string; q?: string; sort?: string }>
}) {
  const locale = await getRequestLocale()
  await requireCapability('moderate', '/admin/moderation')
  const dict = getDictionary(locale)
  const t = dict.admin.moderation
  const tf = dict.admin.typeFilters
  const tc = dict.admin.common

  const params = await searchParams
  const status = (params.status as SubmissionStatus | 'all') || 'pending'
  const type = (params.type as 'all' | 'photo_story' | 'news' | 'listing' | 'notice' | 'culture') || 'all'
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)
  const search = params.q?.trim() || undefined
  const sort = params.sort === 'oldest' ? 'oldest' : 'newest'

  // The pending queue also covers reopened rows (in_review) — fold both in.
  const statusFilter: SubmissionStatus[] | 'all' =
    status === 'pending'
      ? ['pending', 'in_review']
      : status === 'all'
        ? ALL_STATUSES
        : [status]

  // One paginated server query for the visible page + cheap index-only head
  // counts for the tab badges (replaces the 5×1000-row fetch + client merge).
  const [{ rows: submissions, total }, counts] = await Promise.all([
    getSubmissions({ status: statusFilter, type, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE, search, order: sort }),
    getSubmissionCounts(),
  ])

  const tabs = STATUS_KEYS.map((key) => ({
    key,
    label: t[TAB_LABELS[key]],
    count: (counts as Record<string, number>)[key === 'all' ? 'total' : key] ?? 0,
  }))

  /** Locale-prefixed tab/type/page/sort hrefs (checklist: never a bare /admin constant). */
  const qs = search ? `&q=${encodeURIComponent(search)}` : ''
  const hrefFor = (key: string) =>
    `${localePath(locale, '/admin/moderation')}?status=${key}&type=${type}&sort=${sort}${qs}`

  const typeHref = (key: string) =>
    `${localePath(locale, '/admin/moderation')}?status=${status}&type=${key}&sort=${sort}${qs}`

  const pageHref = (p: number) =>
    `${localePath(locale, '/admin/moderation')}?status=${status}&type=${type}&page=${p}&sort=${sort}${qs}`

  const sortHref = (dir: 'newest' | 'oldest') =>
    `${localePath(locale, '/admin/moderation')}?status=${status}&type=${type}&sort=${dir}${qs}`

  const searchAction = `${localePath(locale, '/admin/moderation')}?status=${status}&type=${type}&sort=${sort}`
  const isFiltered = type !== 'all' || !!search

  const statusWord =
    status === 'pending' ? t.tabPending
    : status === 'needs_clarification' ? t.tabClarification
    : status === 'approved' ? t.tabApproved
    : status === 'rejected' ? t.tabRejected
    : t.tabAll

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

      <Tabs tabs={tabs} active={status} hrefFor={hrefFor} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{t.typeLabel}</span>
          <FilterPills
            pills={TYPE_FILTERS.map((f) => ({
              key: f.key,
              label: tf[f.dictKey],
              href: typeHref(f.key),
            }))}
            active={type}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center text-xs text-muted-foreground">
            {sort === 'newest' ? (
              <Link href={sortHref('oldest')} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                {t.sortOldest}
              </Link>
            ) : (
              <Link href={sortHref('newest')} className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">
                {t.sortNewest}
              </Link>
            )}
          </span>
          <SearchBar
            name="q"
            defaultValue={search}
            placeholder={tc.searchPlaceholder}
            action={searchAction}
            className="w-full sm:w-64"
          />
        </div>
      </div>

      {/* Active filters as removable chips (Phase D) — same rationale as the
          content library: a filtered queue must announce itself. The tab
          (status) is not a chip: it is the queue identity, always visible. */}
      <ActiveFilters
        chips={[
          ...(type !== 'all'
            ? [{
                key: 'type',
                label: `${t.typeLabel}: ${tf[TYPE_FILTERS.find((f) => f.key === type)!.dictKey]}`,
                removeHref: typeHref('all'),
              }]
            : []),
          ...(search
            ? [{
                key: 'q',
                label: `${tc.search}: ${search}`,
                removeHref: `${localePath(locale, '/admin/moderation')}?status=${status}&type=${type}&sort=${sort}`,
              }]
            : []),
        ]}
        clearAllHref={localePath(locale, '/admin/moderation')}
        labels={tc}
      />

      {submissions.length === 0 ? (
        <EmptyState
          message={isFiltered ? tc.emptyFiltered : t.empty.replace('{status}', statusWord.toLowerCase())}
          secondaryAction={
            isFiltered ? (
              <Link
                href={localePath(locale, '/admin/moderation')}
                className="text-xs text-muted-foreground hover:text-foreground hover:underline"
              >
                {tc.clearFilters}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ModerationBulkTable
          rows={submissions}
          copy={t}
          common={tc}
          locale={locale}
        />
      )}

      <Pager page={page} pageSize={PAGE_SIZE} total={total} hrefFor={pageHref} copy={dict.admin.common} />
    </div>
  )
}