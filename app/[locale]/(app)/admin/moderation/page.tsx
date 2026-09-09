import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getSubmissions, getSubmissionCounts } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
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
  searchParams: Promise<{ status?: string; type?: string; page?: string }>
}) {
  const locale = await getRequestLocale()
  await requireCapability('moderate', '/admin/moderation')
  const dict = getDictionary(locale)
  const t = dict.admin.moderation
  const tf = dict.admin.typeFilters

  const params = await searchParams
  const status = (params.status as SubmissionStatus | 'all') || 'pending'
  const type = (params.type as 'all' | 'photo_story' | 'news' | 'listing' | 'notice' | 'culture') || 'all'
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)

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
    getSubmissions({ status: statusFilter, type, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE }),
    getSubmissionCounts(),
  ])

  const tabs = STATUS_KEYS.map((key) => ({
    key,
    label: t[TAB_LABELS[key]],
    count: (counts as Record<string, number>)[key === 'all' ? 'total' : key] ?? 0,
  }))

  /** Locale-prefixed tab hrefs (checklist: never a bare /admin constant). */
  const hrefFor = (key: string) =>
    `${localePath(locale, '/admin/moderation')}?status=${key}&type=${type}`

  const typeHref = (key: string) =>
    `${localePath(locale, '/admin/moderation')}?status=${status}&type=${key}`

  const pageHref = (p: number) =>
    `${localePath(locale, '/admin/moderation')}?status=${status}&type=${type}&page=${p}`

  const statusWord =
    status === 'pending' ? t.tabPending
    : status === 'needs_clarification' ? t.tabClarification
    : status === 'approved' ? t.tabApproved
    : status === 'rejected' ? t.tabRejected
    : t.tabAll

  return (
    <div className="space-y-5">
      <PageHeader title={t.title} description={t.description} />

      <Tabs tabs={tabs} active={status} hrefFor={hrefFor} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t.typeLabel}</span>
        {TYPE_FILTERS.map((f) => (
          <a
            key={f.key}
            href={typeHref(f.key)}
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
              type === f.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {tf[f.dictKey]}
          </a>
        ))}
      </div>

      {submissions.length === 0 ? (
        <EmptyState message={t.empty.replace('{status}', statusWord.toLowerCase())} />
      ) : (
        <ModerationBulkTable
          rows={submissions}
          copy={t}
          common={dict.admin.common}
          commonLabels={dict.admin.common}
          locale={locale}
        />
      )}

      <Pager page={page} pageSize={PAGE_SIZE} total={total} hrefFor={pageHref} copy={dict.admin.common} />
    </div>
  )
}

