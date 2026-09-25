import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getPublishPlans, getUpcomingReleases, getScheduledQueue } from '@/lib/admin/queries'
import { getContentTemplates } from '@/lib/admin/queries/digest'
import { getCronHeartbeatHealth } from '@/lib/automation/heartbeat'
import { PageHeader } from '@/components/admin/page-header'
import { EmptyState } from '@/components/admin/empty-state'
import { StatusBadge } from '@/components/admin/status-badge'
import { formatDateTime, formatRelative } from '@/lib/admin/format'
import { PlanCreateForm, PlanRowActions, RunDuePlansButton } from './plan-actions'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.automations.title }
}

/** Weekly plans show their day via the computed next-run date (UTC), so no
 *  extra dictionary keys are needed and the label matches the reader locale. */
function weekdayLabel(iso: string | null, loc: string): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }).format(new Date(iso))
  } catch {
    return ''
  }
}

/**
 * Automations (Stream C): the release-plan surface (C1/C4) plus the E1
 * scheduler heartbeat strip — the single place an editor sees what will run,
 * when it runs, and whether the scheduler is actually alive.
 */
export default async function Page() {
  const locale = await getRequestLocale()
  await requireCapability('manageContent', '/admin/automations')
  const dict = getDictionary(locale)
  const t = dict.admin.automations
  const common = dict.admin.common

  const [plans, templates, heartbeats, queue, upcoming] = await Promise.all([
    getPublishPlans(),
    getContentTemplates(),
    getCronHeartbeatHealth(),
    getScheduledQueue(10),
    getUpcomingReleases(),
  ])

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

      {/* E1 — scheduler health strip */}
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">{t.healthTitle}</h2>
          <RunDuePlansButton copy={t} />
        </div>
        {heartbeats.length === 0 ? (
          <p className="mt-2 text-xs text-muted-foreground">{t.healthEmpty}</p>
        ) : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {heartbeats.map((h) => (
              <li
                key={h.job}
                className={
                  h.status === 'ok'
                    ? 'rounded border border-border bg-muted/40 px-2 py-1 text-xs'
                    : 'rounded border border-destructive/40 bg-destructive/10 px-2 py-1 text-xs text-destructive'
                }
              >
                <span className="font-medium">{h.job}</span>{' '}
                {h.status !== 'ok' && (
                  <span>
                    · {h.status === 'stale' ? t.healthStale : h.status === 'failing' ? t.healthFailing : t.healthUnknown}
                  </span>
                )}
                {h.lastSuccess ? (
                  <span className="text-muted-foreground"> · {formatRelative(h.lastSuccess, locale)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* C1/C2 — release plans */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-medium">{t.plansTitle}</h2>
          <p className="text-xs text-muted-foreground">{t.plansDescription}</p>
        </div>
        <PlanCreateForm copy={t} templates={templates.map((tpl) => ({ id: tpl.id, name: locale === 'fr' && tpl.nameFr ? tpl.nameFr : tpl.name }))} />
        {plans.length === 0 ? (
          <EmptyState message={t.empty} />
        ) : (
          <ul className="space-y-2">
            {plans.map((plan) => (
              <li key={plan.id} className="rounded-lg border border-border bg-card p-3">
                <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={plan.enabled ? 'active' : 'closed'} label={plan.enabled ? t.planActive : t.planPaused} />
                      <span className="text-sm font-medium">{plan.name}</span>
                      {plan.reviewMode === 'auto-schedule' ? (
                        <span className="rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">{t.modeAutoSchedule}</span>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {plan.templateName ?? plan.templateId.slice(0, 8)}
                      {' · '}
                      {plan.horizon === 'daily'
                        ? `${t.horizonDaily} ${plan.runTime} UTC`
                        : `${t.horizonWeekly} ${weekdayLabel(plan.nextRunAt, locale)} ${plan.runTime} UTC`}
                      {plan.lastStatus ? ` · ${plan.lastStatus === 'ok' ? t.statusOk : plan.lastStatus === 'empty' ? t.statusEmpty : t.statusFailed}` : ''}
                      {plan.failureCount > 0 ? ` · ${t.failures.replace('{count}', String(plan.failureCount))}` : ''}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.nextRun}: {plan.nextRunAt ? formatDateTime(plan.nextRunAt, locale) : '—'}
                      {plan.lastRunAt ? ` · ${t.lastRun}: ${formatRelative(plan.lastRunAt, locale)}` : ''}
                    </p>
                    {plan.lastError ? <p className="mt-1 text-xs text-destructive">{plan.lastError}</p> : null}
                  </div>
                  <PlanRowActions
                    plan={{ id: plan.id, name: plan.name, enabled: plan.enabled, reviewMode: plan.reviewMode, horizon: plan.horizon, dayOfWeek: plan.dayOfWeek, runTime: plan.runTime, leadMinutes: plan.leadMinutes, templateId: plan.templateId }}
                    copy={t}
                    common={common}
                    templates={templates.map((tpl) => ({ id: tpl.id, name: locale === 'fr' && tpl.nameFr ? tpl.nameFr : tpl.name }))}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* C4 — what is next */}
      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium">{t.upcomingTitle}</h2>
          {upcoming.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">{t.upcomingEmpty}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {upcoming.map((u) => (
                <li key={`${u.name}-${u.at}`} className="flex items-baseline justify-between gap-3 text-xs">
                  <span className="truncate text-sm">{u.name}</span>
                  <span className="shrink-0 text-muted-foreground">{formatDateTime(u.at, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-medium">{t.queueTitle}</h2>
          {queue.overdue > 0 ? (
            <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{t.queueOverdue.replace('{count}', String(queue.overdue))}</p>
          ) : null}
          {queue.items.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">{t.queueEmpty}</p>
          ) : (
            <ul className="mt-2 space-y-1.5">
              {queue.items.map((q) => (
                <li key={q.id} className="flex items-baseline justify-between gap-3 text-xs">
                  <a href={localePath(locale, '/admin/content?status=scheduled')} className="min-w-0 truncate text-sm text-link hover:underline">
                    {q.title}
                  </a>
                  <span className="shrink-0 text-muted-foreground">{formatDateTime(q.at, locale)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  )
}
