import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { isAdminRoles } from '@/lib/auth/roles'
import { getPollsAdmin } from '@/lib/admin/queries'
import { localizeStatus } from '@/lib/admin/labels'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { FilterPills } from '@/components/admin/filter-pills'
import { StatusBadge } from '@/components/admin/status-badge'
import { formatRelative } from '@/lib/admin/format'
import { PollCreateForm, PollRowActions } from './poll-actions'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.polls.title }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ locale?: string }>
}) {
  const locale = await getRequestLocale()
  const { roles } = await requireCapability('managePolls', '/admin/polls')
  const canDelete = isAdminRoles(roles)
  const dict = getDictionary(locale)
  const t = dict.admin.polls
  const common = dict.admin.common

  const params = await searchParams
  const localeFilter = params.locale === 'en' || params.locale === 'fr' ? params.locale : 'all'

  const allPolls = await getPollsAdmin()
  const polls = localeFilter === 'all' ? allPolls : allPolls.filter((p) => p.locale === localeFilter)
  const base = localePath(locale, '/admin/polls')

  return (
    <div className="space-y-5">
      <PageHeader title={t.title} description={t.description} />

      <PollCreateForm copy={t} locale={locale} />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">{t.localeLabel}:</span>
        <FilterPills
          pills={[
            { key: 'all', label: t.filterAll, href: base },
            { key: 'en', label: t.filterEn, href: `${base}?locale=en` },
            { key: 'fr', label: t.filterFr, href: `${base}?locale=fr` },
          ]}
          active={localeFilter}
        />
      </div>

      {polls.length === 0 ? (
        <EmptyState message={t.empty} />
      ) : (
        <div className="space-y-2">
          {polls.map((poll) => (
            <div key={poll.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={poll.isActive ? 'active' : 'closed'} label={localizeStatus(poll.isActive ? 'active' : 'closed', common)} />
                    <span
                      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide border ${
                        poll.locale === 'fr'
                          ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300'
                          : 'border-slate-200 bg-slate-100 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300'
                      }`}
                      title={t.localeLabel}
                    >
                      {poll.locale === 'fr' ? common.localeFr : common.localeEn}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatRelative(poll.createdAt, locale)}</span>
                  </div>
                  <h3 className="mt-1 text-sm font-medium">{poll.question}</h3>
                  <p className="text-xs text-muted-foreground">
                    {poll.isActive
                      ? poll.closesAt
                        ? t.closesOn.replace('{date}', formatRelative(poll.closesAt, locale))
                        : t.noCloseDate
                      : `${t.closed} · ${poll.closesAt ? formatRelative(poll.closesAt, locale) : ''}`}
                    {' · '}
                    {poll.totalVotes} {t.votes}
                  </p>
                </div>
                <PollRowActions poll={poll} copy={t} common={common} canDelete={canDelete} />
              </div>

              {poll.options.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">{t.noOptions}</p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {poll.options.map((option) => (
                    <li key={option.id} className="flex items-center gap-2 text-xs">
                      <span className="min-w-0 flex-1 truncate text-foreground/80">{option.label}</span>
                      {option.votes === Math.max(...poll.options.map((o) => o.votes)) && option.votes > 0 && (
                        <span className="shrink-0 font-medium text-emerald-600">{t.leading}</span>
                      )}
                      <span className="shrink-0 text-muted-foreground tabular-nums">
                        {option.votes} {t.votes}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
