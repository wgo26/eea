import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import Link from 'next/link'
import { getSubmissions } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { Tabs } from '@/components/admin/tabs'
import { StatusBadge, TypeBadge } from '@/components/admin/status-badge'
import { localizeStatus, localizeType } from '@/lib/admin/labels'
import { DataTable } from '@/components/admin/data-table'
import { formatRelative } from '@/lib/admin/format'
import { ModerationActions } from './moderation-actions'
import type { SubmissionStatus } from '@/lib/auth/roles'
import type { SubmissionRow } from '@/lib/admin/queries'

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

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; type?: string }>
}) {
  const locale = await getRequestLocale()
  await requireCapability('moderate', '/admin/moderation')
  const dict = getDictionary(locale)
  const t = dict.admin.moderation
  const tf = dict.admin.typeFilters

  const params = await searchParams
  const status = (params.status as SubmissionStatus | 'all') || 'pending'
  const type = (params.type as 'all' | 'photo_story' | 'news' | 'listing' | 'notice' | 'culture') || 'all'

  // The pending queue also covers reopened rows (in_review) — merge both.
  const [pendingRes, inReviewRes, clarificationRes, approvedRes, rejectedRes] = await Promise.all([
    getSubmissions({ status: 'pending', type: 'all', limit: 1000 }),
    getSubmissions({ status: 'in_review', type: 'all', limit: 1000 }),
    getSubmissions({ status: 'needs_clarification', type: 'all', limit: 1000 }),
    getSubmissions({ status: 'approved', type: 'all', limit: 1000 }),
    getSubmissions({ status: 'rejected', type: 'all', limit: 1000 }),
  ])
  const pendingItems = pendingRes.rows
  const inReviewItems = inReviewRes.rows
  const clarificationItems = clarificationRes.rows
  const approvedItems = approvedRes.rows
  const rejectedItems = rejectedRes.rows

  const queueFor = (): SubmissionRow[] => {
    const merged = [...pendingItems, ...inReviewItems].sort((a, b) =>
      (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''),
    )
    if (status === 'pending') return merged.filter((r) => type === 'all' || r.submissionType === type)
    if (status === 'all') return [...merged, ...clarificationItems, ...approvedItems, ...rejectedItems]
      .filter((r) => type === 'all' || r.submissionType === type)
      .sort((a, b) => (b.submittedAt ?? '').localeCompare(a.submittedAt ?? ''))
      .slice(0, 100)
    return (
      status === 'needs_clarification' ? clarificationItems : status === 'approved' ? approvedItems : rejectedItems
    ).filter((r) => type === 'all' || r.submissionType === type)
  }
  const submissions = queueFor()

  const counts: Record<string, number> = {
    pending: pendingItems.length + inReviewItems.length,
    needs_clarification: clarificationItems.length,
    approved: approvedItems.length,
    rejected: rejectedItems.length,
    all: pendingItems.length + inReviewItems.length + clarificationItems.length + approvedItems.length + rejectedItems.length,
  }

  const tabs = STATUS_KEYS.map((key) => ({
    key,
    label: t[TAB_LABELS[key]],
    count: counts[key] ?? 0,
  }))

  /** Locale-prefixed tab hrefs (checklist: never a bare /admin constant). */
  const hrefFor = (key: string) =>
    `${localePath(locale, '/admin/moderation')}?status=${key}&type=${type}`

  const typeHref = (key: string) =>
    `${localePath(locale, '/admin/moderation')}?status=${status}&type=${key}`

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
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-10 text-center">
          <p className="text-sm text-muted-foreground">{t.empty.replace('{status}', statusWord.toLowerCase())}</p>
        </div>
      ) : (
        <DataTable
          rows={submissions}
          rowKey={(r) => r.id}
          columns={[
            { key: 'type', header: t.colType, render: (r) => (
              <div className="space-y-1">
                <TypeBadge type={r.submissionType} label={localizeType(r.submissionType, dict.admin.common)} />
                <Link
                  href={localePath(locale, `/admin/moderation/${r.id}`)}
                  className="block text-xs text-primary hover:underline"
                >
                  {t.review}
                </Link>
              </div>
            ) },
            { key: 'submitter', header: t.colSubmitter, render: (r) => <SubmitterCell row={r} copy={t} /> },
            { key: 'status', header: t.colStatus, render: (r) => <StatusBadge status={r.status} label={localizeStatus(r.status, dict.admin.common)} /> },
            { key: 'submitted', header: t.colSubmitted, render: (r) => <time className="text-xs text-muted-foreground">{formatRelative(r.submittedAt)}</time> },
            { key: 'actions', header: '', render: (r) => <ModerationActions submission={r} copy={t} />, className: 'text-right' },
          ]}
        />
      )}
    </div>
  )
}

function SubmitterCell({ row, copy }: { row: SubmissionRow; copy: ReturnType<typeof getDictionary>['admin']['moderation'] }) {
  return (
    <div className="min-w-0">
      <div className="text-sm font-medium truncate">{row.guestName ?? copy.anonymous}</div>
      {row.guestEmail && <div className="text-xs text-muted-foreground truncate">{row.guestEmail}</div>}
    </div>
  )
}

