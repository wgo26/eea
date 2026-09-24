import Link from 'next/link'

import { formatDate } from '@/lib/admin/format'
import type { DashboardStats, EducationSnapshot } from '@/lib/admin/queries'
import type { EducationWidgetId } from '@/lib/admin/widget-layout'
import { WidgetMetric, WidgetRow } from '@/components/admin/widget-system'
import { localePath } from '@/lib/i18n/urls'
import type { Dictionary, Locale } from '@/lib/i18n'

type Copy = Pick<
  Dictionary['admin']['dashboard'],
  | 'educationNotConfigured'
  | 'educationCategories'
  | 'educationUpcomingEmpty'
  | 'educationSubmissionTypes'
  | 'educationAlerts'
  | 'notices'
  | 'buySell'
  | 'viewAll'
>

/**
 * The Back to School season's widgets (spec §23, plan Phase 4.4). Rendered from
 * the snapshot `getEducationSnapshot()` reads — no queries here — so a season
 * widget costs one shared read no matter how many of the five are on screen.
 *
 * `categoryCount === 0` means the §23 priority categories were never seeded
 * (a fresh install): the counters then render the configuration hint instead of
 * a confident "0 stories", which would read as "nothing published" rather than
 * "not set up".
 */
export function EducationWidget({
  id,
  snapshot,
  stats,
  copy,
  locale,
}: {
  id: EducationWidgetId
  snapshot: EducationSnapshot
  stats: DashboardStats
  copy: Copy
  locale: Locale
}) {
  if (snapshot.categoryCount === 0 && id !== 'upcoming-dates' && id !== 'education-submissions') {
    return (
      <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        {copy.educationNotConfigured}
      </p>
    )
  }

  const content = (query: string) => `${localePath(locale, '/admin/content')}?${query}`
  const configured = copy.educationCategories.replace('{count}', String(snapshot.categoryCount))

  switch (id) {
    case 'education-stories':
      return (
        <div className="space-y-1.5">
          <WidgetMetric value={snapshot.stories} label={configured} />
          <Link href={content('tab=content')} className="inline-block text-xs font-medium underline">
            {copy.viewAll}
          </Link>
        </div>
      )

    case 'school-notices':
      return (
        <WidgetMetric
          value={snapshot.notices}
          label={copy.notices}
          href={content('tab=content&type=notice')}
        />
      )

    case 'community-alerts':
      return (
        <WidgetMetric
          value={snapshot.communityAlerts}
          label={copy.educationAlerts}
          href={content('tab=content&type=notice')}
        />
      )

    case 'upcoming-dates':
      return snapshot.upcoming.length === 0 ? (
        <p className="text-xs text-muted-foreground">{copy.educationUpcomingEmpty}</p>
      ) : (
        <ul className="space-y-1.5">
          {snapshot.upcoming.map((item) => (
            <li key={item.id} className="flex items-baseline justify-between gap-2">
              <span className="min-w-0 truncate text-sm">{item.title}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatDate(item.startsAt, locale)}
              </span>
            </li>
          ))}
        </ul>
      )

    case 'education-submissions': {
      const pending = (type: string) =>
        stats.pendingByType.find((row) => row.type === type)?.count ?? 0
      return (
        <div className="space-y-0.5">
          <WidgetRow
            label={copy.notices}
            value={pending('notice')}
            href={`${localePath(locale, '/admin/moderation')}?status=pending&type=notice`}
          />
          <WidgetRow
            label={copy.buySell}
            value={pending('buy_sell')}
            href={`${localePath(locale, '/admin/moderation')}?status=pending&type=buy_sell`}
          />
          <p className="pt-1 text-xs text-muted-foreground">{copy.educationSubmissionTypes}</p>
        </div>
      )
    }
  }
}
