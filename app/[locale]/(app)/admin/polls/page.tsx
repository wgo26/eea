import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { requireCapability } from '@/lib/auth/guards'
import { isAdminRoles } from '@/lib/auth/roles'
import { getPollsAdmin } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { StatusBadge } from '@/components/admin/status-badge'
import { formatRelative } from '@/lib/admin/format'
import { PollCreateForm, PollRowActions } from './poll-actions'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.polls.title }
}

export default async function Page() {
  const locale = await getRequestLocale()
  const { roles } = await requireCapability('managePolls', '/admin/polls')
  const canDelete = isAdminRoles(roles)
  const dict = getDictionary(locale)
  const t = dict.admin.polls
  const common = dict.admin.common

  const polls = await getPollsAdmin()

  return (
    <div className="space-y-6">
      <PageHeader title={t.title} description={t.description} />

      <PollCreateForm copy={t} locale={locale} />

      {polls.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-10 text-center">
          <p className="text-sm text-muted-foreground">{t.empty}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {polls.map((poll) => (
            <div key={poll.id} className="rounded-lg border border-border bg-card p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={poll.isActive ? 'active' : 'closed'} />
                    <span className="text-xs text-muted-foreground">{formatRelative(poll.createdAt, locale)}</span>
                  </div>
                  <h3 className="mt-1.5 text-sm font-medium">{poll.question}</h3>
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
                <p className="mt-3 text-xs text-muted-foreground">{t.noOptions}</p>
              ) : (
                <ul className="mt-3 space-y-1.5">
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
