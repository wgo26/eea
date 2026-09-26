'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, RefreshCw } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { getDictionary, type Locale } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { fillCopy } from '@/lib/admin/format'
import { ALERT_SEVERITY_TONE, alertLabel } from '@/lib/admin/labels'
import type { AlertSeverity, OperationalAlert } from '@/lib/admin/queries/dashboard'
import type { AttentionTopic, SchedulerIssue } from '@/lib/admin/attention'
import { attentionCount, attentionTone, buildAttentionTopics } from '@/lib/admin/attention'
import { useLocaleFromPath } from '@/components/site-header'
import { cn } from '@/lib/utils'

/**
 * The attention centre (AppShell).
 *
 * Replaces the bell that printed two numbers (pending submissions + unread
 * mail) with the derived operational alerts the data layer had already been
 * producing for the dashboard, alongside the viewer's own queues and the
 * scheduler's health. Alerts arrive already filtered by capability on the
 * server, so every row rendered here is a screen the viewer can actually open.
 *
 * Two things the old bell could not do: say WHAT is waiting, and go quiet. The
 * refresh in the header re-runs the layout — clearing a queue from a dialog
 * leaves the badge stale otherwise, since nothing else re-renders the shell.
 */

const TONE_BADGE: Record<'calm' | 'notice' | 'urgent', string> = {
  calm: '',
  notice: 'bg-amber-500 text-amber-950',
  urgent: 'bg-destructive text-destructive-foreground',
}

export function AdminAttention({
  alerts,
  schedulerIssues,
  pendingSubmissions,
  unreadNotifications,
  actionableApprovals,
  overdueScheduled,
  dashboardHref,
}: {
  alerts: OperationalAlert[]
  schedulerIssues: SchedulerIssue[]
  pendingSubmissions: number
  unreadNotifications: number
  actionableApprovals: number
  overdueScheduled: number
  dashboardHref: string
}) {
  const locale = useLocaleFromPath()
  const dict = getDictionary(locale)
  const router = useRouter()
  const topbar = dict.admin.topbar
  const dashboard = dict.admin.dashboard

  const ordered = buildAttentionTopics(
    {
      alerts,
      pendingSubmissions,
      unreadNotifications,
      actionableApprovals,
      overdueScheduled,
    },
    {
      alertLabel: (alert) => alertLabel(alert, dashboard),
      workLabel: {
        submissions: topbar.work.submissions,
        approvals: topbar.work.approvals,
        mail: topbar.work.mail,
        'overdue-scheduled': topbar.work.overdue,
      },
      workHref: {
        submissions: '/admin/moderation',
        approvals: '/admin/approvals',
        mail: '/admin/inbox',
        'overdue-scheduled': '/admin/content?status=scheduled',
      },
    },
  )

  const total = attentionCount(ordered)
  const tone = attentionTone(ordered)
  const severityName: Record<AlertSeverity, string> = dict.admin.statesPage.severity

  // Operational problems and personal queues read differently: a chief scanning
  // four rows needs to know which of them are the platform's fault.
  const alertTopics = ordered.filter((topic) => topic.group === 'alerts')
  const workTopics = ordered.filter((topic) => topic.group === 'work')
  const quiet = ordered.length === 0 && schedulerIssues.length === 0

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            aria-label={total > 0 ? fillCopy(topbar.attentionAria, { count: total }) : dashboard.alertsClear}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Bell className="h-4 w-4" aria-hidden />
            {total > 0 && (
              <span
                className={cn(
                  'absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums ring-2 ring-card',
                  TONE_BADGE[tone],
                )}
              >
                {total > 99 ? '99+' : total}
              </span>
            )}
          </button>
        }
      />
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="flex items-center justify-between gap-2 font-normal">
          <span className="text-sm font-medium text-foreground">{dashboard.alertsHeading}</span>
          <button
            type="button"
            onClick={() => router.refresh()}
            className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
            {topbar.refresh}
          </button>
        </DropdownMenuLabel>
        {quiet && <p className="px-2 py-2 text-xs text-muted-foreground">{dashboard.alertsClear}</p>}

        {alertTopics.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {alertTopics.map((topic) => (
              <AttentionRow key={topic.id} topic={topic} severityName={severityName} locale={locale} />
            ))}
          </>
        )}

        {workTopics.length > 0 && (
          <>
            <DropdownMenuSeparator />
            {workTopics.map((topic) => (
              <AttentionRow key={topic.id} topic={topic} severityName={severityName} locale={locale} />
            ))}
          </>
        )}

        {schedulerIssues.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>{topbar.schedulerHeading}</DropdownMenuLabel>
            {schedulerIssues.map((issue) => (
              <DropdownMenuItem
                key={issue.job}
                render={<Link href={localePath(locale, issue.href)} />}
                className="items-start"
              >
                <span
                  aria-hidden
                  className={cn(
                    'mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full',
                    issue.status === 'failing' ? 'bg-destructive' : 'bg-amber-500',
                  )}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{schedulerLabel(issue, topbar)}</span>
                  <span className="block truncate text-xs text-muted-foreground tabular-nums">
                    {fillCopy(topbar.schedulerGrace, { hours: issue.graceHours })} · {issue.job}
                  </span>
                </span>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {ordered.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem render={<Link href={dashboardHref} />}>{topbar.viewAll}</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** One attention line: the fact, how long it has waited, and how bad it is. */
function AttentionRow({
  topic,
  severityName,
  locale,
}: {
  topic: AttentionTopic
  severityName: Record<AlertSeverity, string>
  locale: Locale
}) {
  const dict = getDictionary(locale)
  return (
    <DropdownMenuItem render={<Link href={localePath(locale, topic.href)} />} className="items-start">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{topic.label}</span>
        {topic.oldestHours != null && (
          <span className="block truncate text-xs text-muted-foreground tabular-nums">
            {fillCopy(dict.admin.dashboard.alertOldest, { hours: topic.oldestHours })}
          </span>
        )}
      </span>
      {topic.severity && (
        <span
          className={cn(
            'mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
            ALERT_SEVERITY_TONE[topic.severity],
          )}
        >
          {severityName[topic.severity]}
        </span>
      )}
    </DropdownMenuItem>
  )
}

/** A failing job, a silent job and a job that never ran read differently. */
function schedulerLabel(
  issue: SchedulerIssue,
  copy: { schedulerStale: string; schedulerFailing: string; schedulerUnknown: string },
): string {
  if (issue.status === 'failing') return fillCopy(copy.schedulerFailing, { job: issue.job })
  if (issue.status === 'unknown') return fillCopy(copy.schedulerUnknown, { job: issue.job })
  return fillCopy(copy.schedulerStale, { job: issue.job, hours: issue.silenceHours ?? 0 })
}
