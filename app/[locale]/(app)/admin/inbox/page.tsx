import Link from 'next/link'
import { getRequestLocale } from '@/lib/i18n/server'
import { getDictionary } from '@/lib/i18n'
import { localePath } from '@/lib/i18n/urls'
import { requireCapability } from '@/lib/auth/guards'
import { getAdminNotifications, getUnreadNotificationCounts } from '@/lib/admin/queries'
import {
  NOTIFICATION_CATEGORIES,
  isNotificationCategory,
  type NotificationCategory,
} from '@/lib/admin/notification-centre'
import { PageHeader } from '@/components/admin/page-header'
import { Tabs } from '@/components/admin/tabs'
import { Pager } from '@/components/admin/pager'
import { EmptyState } from '@/components/admin/empty-state'
import { InboxTable, MarkAllReadButton } from './inbox-actions'

/**
 * Notification centre (plan Phase 4.5, spec §38).
 *
 * Lives at /admin/inbox, not the plan's literal /admin/notifications: that
 * route is the notification *delivery* console (outbox, channels, digest
 * subscribers) behind `manageNotifications`. Merging the two would either
 * hide the centre from every staff member who can read the dashboard, or
 * hand the delivery console to all of them — so the centre takes its own
 * route and the `viewDashboard` guard the plan specifies.
 */

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.inbox.title }
}

const PAGE_SIZE = 30

type SearchParams = {
  category?: string
  unread?: string
  page?: string
}

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { user } = await requireCapability('viewDashboard', '/admin/inbox')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.inbox

  const params = await searchParams
  // Unknown categories fall back to "all" rather than erroring — a stale tab
  // link must not become a dead end.
  const category: NotificationCategory | 'all' = isNotificationCategory(params.category)
    ? params.category
    : 'all'
  const unreadOnly = params.unread === '1'
  const page = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)

  const [{ rows, total }, counts] = await Promise.all([
    getAdminNotifications(user.id, { limit: PAGE_SIZE, page, category, unreadOnly }),
    getUnreadNotificationCounts(user.id),
  ])

  const hrefFor = (next: { category?: string; page?: number; unread?: boolean }) => {
    const sp = new URLSearchParams()
    const nextCategory = next.category ?? category
    if (nextCategory !== 'all') sp.set('category', nextCategory)
    if (next.unread ?? unreadOnly) sp.set('unread', '1')
    const nextPage = next.page ?? 1
    if (nextPage > 1) sp.set('page', String(nextPage))
    const qs = sp.toString()
    return `${localePath(locale, '/admin/inbox')}${qs ? `?${qs}` : ''}`
  }

  const categoryLabel: Record<NotificationCategory, string> = {
    info: t.catInfo,
    action_required: t.catActionRequired,
    warning: t.catWarning,
    critical: t.catCritical,
  }

  const activeUnread = category === 'all' ? counts.total : counts.byCategory[category]

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={hrefFor({ unread: !unreadOnly })}
              scroll={false}
              className="inline-flex min-h-[32px] items-center rounded-md border border-border px-2.5 py-1 text-xs font-medium transition-colors hover:bg-accent"
            >
              {unreadOnly ? t.showAll : t.unreadOnly}
            </Link>
            {activeUnread > 0 && (
              <MarkAllReadButton
                category={category}
                label={t.markAllRead}
                successToast={t.markedAllRead}
              />
            )}
          </div>
        }
      />

      <Tabs
        tabs={[
          { key: 'all', label: t.tabAll, count: counts.total },
          ...NOTIFICATION_CATEGORIES.map((c) => ({
            key: c,
            label: categoryLabel[c],
            count: counts.byCategory[c],
          })),
        ]}
        active={category}
        hrefFor={(key) => hrefFor({ category: key })}
      />

      {rows.length === 0 ? (
        <EmptyState message={unreadOnly ? t.emptyUnread : t.empty} />
      ) : (
        <InboxTable rows={rows} copy={t} common={dict.admin.common} locale={locale} />
      )}

      <Pager
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        hrefFor={(p) => hrefFor({ page: p })}
        copy={dict.admin.common}
      />
    </div>
  )
}
