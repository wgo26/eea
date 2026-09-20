import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { isAdminRoles } from '@/lib/auth/roles'
import { getFundraisersAdmin } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { SearchBar } from '@/components/admin/filter-pills'
import { Pager } from '@/components/admin/pager'
import { StatusBadge } from '@/components/admin/status-badge'
import { localizeStatus } from '@/lib/admin/labels'
import { formatRelative, formatPrice } from '@/lib/admin/format'
import { FundraiserCard, FundraiserCreateForm } from './fundraiser-actions'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.fundraisers.title }
}

/** Public detail href for a story, mirroring lib/queries/home.ts detailHref. */
function storyHref(locale: string, type: string | null, id: string, slug: string | null): string {
  switch (type) {
    case 'photo_story':
      return `/${locale}/photo-stories/${slug ?? id}`
    case 'news':
      return `/${locale}/news/${slug ?? id}`
    case 'culture':
      return `/${locale}/culture/${slug ?? id}`
    default:
      return `/${locale}/news/${slug ?? id}`
  }
}

const PAGE_SIZE = 20

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>
}) {
  const locale = await getRequestLocale()
  const { roles } = await requireCapability('manageFundraisers', '/admin/fundraisers')
  const canDelete = isAdminRoles(roles)
  const dict = getDictionary(locale)
  const t = dict.admin.fundraisers
  const common = dict.admin.common

  const sp = await searchParams
  const search = sp.q?.trim() || undefined
  const page = Math.max(1, Number.parseInt(sp.page ?? '1', 10) || 1)

  const { rows: fundraisers, total } = await getFundraisersAdmin({
    search,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    locale,
  })
  const base = localePath(locale, '/admin/fundraisers')

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

      <FundraiserCreateForm copy={t} common={common} />

      {!canDelete ? (
        <p className="text-xs text-muted-foreground">{common.deleteAdminOnly}</p>
      ) : null}

      <div className="flex items-center gap-2">
        <SearchBar
          name="q"
          defaultValue={search}
          placeholder={common.searchPlaceholder}
          action={base}
          className="w-full sm:w-64"
        />
      </div>

      {fundraisers.length === 0 ? (
        <EmptyState message={search ? common.emptyFiltered : t.empty} />
      ) : (
        <div className="space-y-2">
          {fundraisers.map((f) => {
            const percent = f.goalAmount > 0 ? Math.min(100, Math.round((f.raisedAmount / f.goalAmount) * 100)) : 0
            return (
              <div key={f.contentItemId} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={f.closedAt ? 'closed' : 'open'} label={localizeStatus(f.closedAt ? 'closed' : 'open', dict.admin.common)} />
                      {f.storyStatus && <StatusBadge status={f.storyStatus} label={localizeStatus(f.storyStatus, dict.admin.common)} />}
                      {f.missingLocale && (
                        <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
                          {t.missingTranslation}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-1 text-sm font-medium">
                      {f.storyTitle ?? f.slug ?? f.contentItemId}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {t.story}:{' '}
                      <Link href={storyHref(locale, f.storyType, f.contentItemId, f.slug)} className="underline hover:text-foreground">
                        {f.slug ?? f.contentItemId}
                      </Link>
                    </p>
                  </div>
                  <FundraiserCard row={f} copy={t} common={common} canDelete={canDelete} />
                </div>

                <div className="mt-3 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {t.raised}: <span className="text-foreground font-medium">{formatPrice(f.raisedAmount, f.currency)}</span>
                    {' · '}
                    {t.goal}: <span className="text-foreground font-medium">{formatPrice(f.goalAmount, f.currency)}</span>
                  </span>
                  <span className="font-medium">{t.progress.replace('{percent}', String(percent))}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full rounded-full ${percent >= 100 ? 'bg-emerald-500' : 'bg-primary'}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>
                    {t.organizer}: <span className="text-foreground/80">{f.organizerName ?? '—'}</span>
                  </span>
                  {f.deadlineAt ? (
                    <span>
                      {t.deadline}: <span className="text-foreground/80">{formatRelative(f.deadlineAt, locale)}</span>
                    </span>
                  ) : (
                    <span>{t.noDeadline}</span>
                  )}
                  {f.donationUrl && (
                    <a href={f.donationUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground">
                      {t.donationUrl}
                    </a>
                  )}
                </div>
                {f.verificationNotes && (
                  <p className="mt-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs text-muted-foreground">
                    {t.verification}: {f.verificationNotes}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      <Pager
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        hrefFor={(p) => `${base}?page=${p}${search ? `&q=${encodeURIComponent(search)}` : ''}`}
        copy={common}
      />
    </div>
  )
}
