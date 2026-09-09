import { getDictionary } from '@/lib/i18n'
import { getRequestLocale } from '@/lib/i18n/server'
import { requireCapability } from '@/lib/auth/guards'
import { getDashboardStats } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { StatCard, StatGrid } from '@/components/admin/stat-card'
import { StatusBadge, TypeBadge } from '@/components/admin/status-badge'
import { formatBytes, formatRelative } from '@/lib/admin/format'
import { localePath } from '@/lib/i18n/urls'
import Link from 'next/link'
import type { ModerationEntry } from '@/lib/admin/queries'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.dashboard.title }
}

export default async function Page() {
  await requireCapability('viewDashboard', '/admin/dashboard')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.dashboard
  const stats = await getDashboardStats()

  // SLA watch: pending queue older than 48h gets the amber treatment.
  const oldestPendingHours = stats.oldestPendingAt
    ? Math.floor((Date.now() - new Date(stats.oldestPendingAt).getTime()) / 3_600_000)
    : null
  const slaBreached = oldestPendingHours != null && oldestPendingHours >= 48
  const contentHref = (params: { status?: string; type?: string }) => {
    const sp = new URLSearchParams({ tab: 'content' })
    if (params.status) sp.set('status', params.status)
    if (params.type) sp.set('type', params.type)
    return `${localePath(locale, '/admin/content')}?${sp.toString()}`
  }
  const quickActionCls =
    'inline-flex items-center rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors'

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        description={t.description}
      />

      {/* Quick actions */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t.quickActions}</span>
        <Link href={contentHref({})} className={quickActionCls}>{t.qaCreateContent}</Link>
        <Link href={localePath(locale, '/admin/users')} className={quickActionCls}>{t.qaInviteUser}</Link>
        <Link href={localePath(locale, '/admin/ads')} className={quickActionCls}>{t.qaNewAd}</Link>
      </div>

      {/* SLA warning — oldest pending > 48h */}
      {slaBreached && oldestPendingHours != null && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <span aria-hidden>⏰</span>
          <p>{t.slaWarning.replace('{hours}', String(oldestPendingHours))}</p>
          <Link href={localePath(locale, '/admin/moderation')} className="ml-auto text-xs font-medium underline">
            {t.pending} →
          </Link>
        </div>
      )}

      {/* Submissions */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{t.submissions}</h2>
        <StatGrid>
          <StatCard label={t.pending} value={stats.pendingSubmissions} hint={t.hintAwaitingReview} href={localePath(locale, '/admin/moderation')} tone={slaBreached ? 'amber' : 'default'} />
          <StatCard label={t.publishedToday} value={stats.publishedToday} href={contentHref({ status: 'published' })} />
          <StatCard label={t.scheduled} value={stats.scheduled} href={contentHref({ status: 'scheduled' })} />
          <StatCard label={t.drafts} value={stats.draftCount} href={contentHref({ status: 'draft' })} />
        </StatGrid>
      </section>

      {/* Content */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{t.content}</h2>
        <StatGrid>
          <StatCard label={t.photoStories} value={stats.totalStories} href={contentHref({ type: 'photo_story' })} />
          <StatCard label={t.communityNews} value={stats.totalNews} href={contentHref({ type: 'news' })} />
          <StatCard label={t.buySell} value={stats.totalListings} href={localePath(locale, '/admin/listings')} />
          <StatCard label={t.notices} value={stats.totalNotices} href={contentHref({ type: 'notice' })} />
          <StatCard label={t.culture} value={stats.totalCulture} href={contentHref({ type: 'culture' })} />
        </StatGrid>
      </section>

      {/* Operations */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{t.operations}</h2>
        <StatGrid>
          <StatCard label={t.activeAds} value={stats.activeAds} href={localePath(locale, '/admin/ads')} />
          <StatCard label={t.activeListings} value={stats.activeListings} hint={t.expiringListings.replace('{count}', String(stats.expiringListings))} href={localePath(locale, '/admin/listings')} />
          <StatCard label={t.storageUsed} value={formatBytes(stats.storageUsed)} href={localePath(locale, '/admin/storage-backup')} />
        </StatGrid>
      </section>

      {/* Pending by type */}
      {stats.pendingByType.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{t.pendingByType}</h2>
          <div className="flex flex-wrap gap-2">
            {stats.pendingByType.map((item) => (
              <Link
                key={item.type}
                href={`${localePath(locale, '/admin/moderation')}?status=pending&type=${item.type}`}
                className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent"
              >
                <TypeBadge type={item.type} />
                <span className="font-medium tabular-nums">{item.count}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Recent activity */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{t.recentActivity}</h2>
        {stats.recentActivity.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            {t.noActivity}
          </div>
        ) : (
          <div className="rounded-lg border border-border overflow-hidden">
            <ul className="divide-y divide-border">
              {stats.recentActivity.map((entry) => (
                <ActivityRow key={entry.id} entry={entry} systemLabel={dict.admin.audit.system} />
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}

function ActivityRow({ entry, systemLabel }: { entry: ModerationEntry; systemLabel: string }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3 bg-card">
      <div className="mt-0.5">
        <StatusBadge status={entry.action} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{entry.actorName ?? systemLabel}</span>
          {' '}
          <span className="text-muted-foreground">{entry.action}</span>
          {entry.contentTitle && (
            <> the <span className="font-medium">{entry.contentType}</span> &ldquo;{entry.contentTitle}&rdquo;</>
          )}
        </p>
        {entry.notes && <p className="mt-0.5 text-xs text-muted-foreground truncate">{entry.notes}</p>}
      </div>
      <time className="text-xs text-muted-foreground whitespace-nowrap">{formatRelative(entry.createdAt)}</time>
    </li>
  )
}
