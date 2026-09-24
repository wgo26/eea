import Link from 'next/link'

import { formatBytes, formatPercent } from '@/lib/admin/format'
import type { DashboardStats } from '@/lib/admin/queries'
import { localePath } from '@/lib/i18n/urls'
import type { Dictionary, Locale } from '@/lib/i18n'
import { StatCard, StatGrid } from '@/components/admin/stat-card'
import { MeterBar, PROVIDER_TONES, StackedBar, type StackSegment, type VizTone } from '@/components/admin/viz'

type Copy = Pick<
  Dictionary['admin']['dashboard'],
  | 'overview'
  | 'contentMix'
  | 'pipeline'
  | 'storageProviders'
  | 'photoStories'
  | 'communityNews'
  | 'buySell'
  | 'notices'
  | 'culture'
  | 'activeAds'
  | 'activeListings'
  | 'expiringListings'
  | 'storageUsed'
  | 'drafts'
  | 'scheduled'
  | 'publishedToday'
  | 'pending'
>

type ContentRow = {
  key: string
  label: string
  value: number
  href: string
  tone: VizTone
}

const sectionHeadingCls = 'text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2'

/** Dot colours for the content-mix legend — mirrors StackedBar's tones. */
const CONTENT_TONE_DOT: Record<VizTone, string> = {
  primary: 'bg-primary/70',
  emerald: 'bg-emerald-500/85',
  amber: 'bg-amber-500/85',
  red: 'bg-red-500/85',
  blue: 'bg-blue-500/85',
  violet: 'bg-violet-500/85',
  muted: 'bg-muted-foreground/40',
}

/**
 * The dashboard's fixed counter band, unified into one "Overview" section:
 * a content-mix share bar, per-card share meters, a provider split for
 * storage, and the editorial pipeline — every value and link the old
 * Content/Operations bands showed, now with the context that makes the
 * numbers readable. Pure render over `getDashboardStats()`; no queries.
 */
export function OverviewSection({
  stats,
  copy,
  locale,
}: {
  stats: DashboardStats
  copy: Copy
  locale: Locale
}) {
  const contentHref = (type: string) => `${localePath(locale, '/admin/content')}?tab=content&type=${type}`
  const statusHref = (status: string) => `${localePath(locale, '/admin/content')}?tab=content&status=${status}`

  const contentRows: ContentRow[] = [
    { key: 'photo_story', label: copy.photoStories, value: stats.totalStories, href: contentHref('photo_story'), tone: 'primary' },
    { key: 'news', label: copy.communityNews, value: stats.totalNews, href: contentHref('news'), tone: 'blue' },
    { key: 'listing', label: copy.buySell, value: stats.totalListings, href: localePath(locale, '/admin/listings'), tone: 'violet' },
    { key: 'notice', label: copy.notices, value: stats.totalNotices, href: contentHref('notice'), tone: 'amber' },
    { key: 'culture', label: copy.culture, value: stats.totalCulture, href: contentHref('culture'), tone: 'emerald' },
  ]
  const contentTotal = contentRows.reduce((sum, row) => sum + row.value, 0)

  const storageSegments: StackSegment[] = stats.storageByProvider.map((row, index) => ({
    key: row.provider,
    value: row.bytes,
    tone: PROVIDER_TONES[index % PROVIDER_TONES.length],
    title: `${row.provider.toUpperCase()} — ${formatPercent(row.bytes, stats.storageUsed)}`,
  }))

  const pipeline = [
    { label: copy.drafts, value: stats.draftCount, href: statusHref('draft'), tone: 'blue' as const },
    { label: copy.scheduled, value: stats.scheduled, href: statusHref('scheduled'), tone: 'violet' as const },
    { label: copy.publishedToday, value: stats.publishedToday, href: statusHref('published'), tone: 'emerald' as const },
    { label: copy.pending, value: stats.pendingSubmissions, href: `${localePath(locale, '/admin/moderation')}?status=pending`, tone: 'amber' as const },
  ]
  const pipelinePeak = Math.max(1, ...pipeline.map((stage) => stage.value))

  return (
    <section>
      <h2 className={sectionHeadingCls}>{copy.overview}</h2>

      {contentTotal > 0 && (
        <div className="mb-3 rounded-lg border border-border bg-card p-3">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-sm font-medium text-foreground">{copy.contentMix}</span>
            <span className="text-xs tabular-nums text-muted-foreground">{contentTotal}</span>
          </div>
          <StackedBar
            className="mt-2"
            label={copy.contentMix}
            segments={contentRows.map((row) => ({
              key: row.key,
              value: row.value,
              tone: row.tone,
              title: `${row.label} — ${row.value}`,
            }))}
          />
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {contentRows.map((row) => (
              <li key={row.key}>
                <Link
                  href={row.href}
                  className="inline-flex items-baseline gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span className={`size-2 shrink-0 rounded-full ${CONTENT_TONE_DOT[row.tone]}`} aria-hidden="true" />
                  <span>{row.label}</span>
                  <span className="font-medium tabular-nums text-foreground">{row.value}</span>
                  <span className="tabular-nums">({formatPercent(row.value, contentTotal)})</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <StatGrid>
        {contentRows.map((row) => (
          <StatCard
            key={row.key}
            label={row.label}
            value={row.value}
            href={row.href}
            footer={
              contentTotal > 0 ? (
                <div className="space-y-1">
                  <MeterBar value={row.value} max={contentTotal} tone={row.tone} />
                  <span className="text-xs text-muted-foreground">{formatPercent(row.value, contentTotal)}</span>
                </div>
              ) : undefined
            }
          />
        ))}
        <StatCard label={copy.activeAds} value={stats.activeAds} href={localePath(locale, '/admin/ads')} />
        <StatCard
          label={copy.activeListings}
          value={stats.activeListings}
          tone={stats.expiringListings > 0 ? 'amber' : 'default'}
          hint={stats.expiringListings > 0 ? copy.expiringListings.replace('{count}', String(stats.expiringListings)) : undefined}
          href={localePath(locale, '/admin/listings')}
        />
        <StatCard
          label={copy.storageUsed}
          value={formatBytes(stats.storageUsed)}
          href={localePath(locale, '/admin/storage-backup')}
          footer={
            storageSegments.length > 0 ? (
              <div className="space-y-1">
                <StackedBar segments={storageSegments} label={copy.storageProviders} />
                <span className="text-xs uppercase tracking-wide text-muted-foreground">
                  {stats.storageByProvider.map((row) => row.provider).join(' · ')}
                </span>
              </div>
            ) : undefined
          }
        />
      </StatGrid>

      {/* The pipeline: four stages of the same editorial flow, scaled against
          each other so the biggest blocker is visible at a glance. */}
      <div className="mt-3 rounded-lg border border-border bg-card p-3">
        <h3 className="text-sm font-medium text-foreground">{copy.pipeline}</h3>
        <div className="mt-2 space-y-0.5">
          {pipeline.map((stage) => (
            <Link
              key={stage.label}
              href={stage.href}
              className="flex items-center gap-3 rounded-md px-1 py-1 transition-colors hover:bg-accent/50"
            >
              <span className="w-32 shrink-0 truncate text-xs text-muted-foreground">{stage.label}</span>
              <MeterBar className="min-w-0 flex-1" value={stage.value} max={pipelinePeak} tone={stage.tone} />
              <span className="w-10 shrink-0 text-right text-sm font-medium tabular-nums">{stage.value}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
