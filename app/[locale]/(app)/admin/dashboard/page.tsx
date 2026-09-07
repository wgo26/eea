import { getDictionary } from '@/lib/i18n'
import { getRequestLocale } from '@/lib/i18n/server'
import { requireCapability } from '@/lib/auth/guards'
import { getDashboardStats } from '@/lib/admin/queries'
import { PageHeader } from '@/components/admin/page-header'
import { StatCard, StatGrid } from '@/components/admin/stat-card'
import { StatusBadge, TypeBadge } from '@/components/admin/status-badge'
import { formatBytes, formatRelative } from '@/lib/admin/format'
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

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        description={t.description}
      />

      {/* Submissions */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{t.submissions}</h2>
        <StatGrid>
          <StatCard label={t.pending} value={stats.pendingSubmissions} hint={t.hintAwaitingReview} />
          <StatCard label={t.publishedToday} value={stats.publishedToday} />
          <StatCard label={t.scheduled} value={stats.scheduled} />
          <StatCard label={t.drafts} value={stats.draftCount} />
        </StatGrid>
      </section>

      {/* Content */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{t.content}</h2>
        <StatGrid>
          <StatCard label={t.photoStories} value={stats.totalStories} />
          <StatCard label={t.communityNews} value={stats.totalNews} />
          <StatCard label={t.buySell} value={stats.totalListings} />
          <StatCard label={t.notices} value={stats.totalNotices} />
          <StatCard label={t.culture} value={stats.totalCulture} />
        </StatGrid>
      </section>

      {/* Operations */}
      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{t.operations}</h2>
        <StatGrid>
          <StatCard label={t.activeAds} value={stats.activeAds} />
          <StatCard label={t.activeListings} value={stats.expiringListings} />
          <StatCard label={t.storageUsed} value={formatBytes(stats.storageUsed)} />
        </StatGrid>
      </section>

      {/* Pending by type */}
      {stats.pendingByType.length > 0 && (
        <section>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">{t.pendingByType}</h2>
          <div className="flex flex-wrap gap-2">
            {stats.pendingByType.map((item) => (
              <div key={item.type} className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-sm">
                <TypeBadge type={item.type} />
                <span className="font-medium tabular-nums">{item.count}</span>
              </div>
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
                <ActivityRow key={entry.id} entry={entry} />
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  )
}

function ActivityRow({ entry }: { entry: ModerationEntry }) {
  return (
    <li className="flex items-start gap-3 px-4 py-3 bg-card">
      <div className="mt-0.5">
        <StatusBadge status={entry.action} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{entry.actorName ?? 'System'}</span>
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
