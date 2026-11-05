import { getDictionary } from '@/lib/i18n'
import { getRequestLocale } from '@/lib/i18n/server'
import { requireAnyCapability } from '@/lib/auth/guards'
import { getInsights } from '@/lib/admin/analytics'
import { unionRows } from '@/lib/admin/content-ranking'
import { PageHeader } from '@/components/admin/page-header'
import { StatCard, StatGrid } from '@/components/admin/stat-card'
import { EmptyState } from '@/components/admin/empty-state'
import {
  TrafficChart,
  BreakdownBarChart,
  LocaleDonut,
  FunnelChart,
  shortDayLabel,
} from '@/components/admin/insights-charts'
import { MeterBar, MiniBars } from '@/components/admin/viz'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { RetroPanel } from './retro-panel'
import { ContentLeaderboard, type LeaderboardCopy } from './content-leaderboard'

/**
 * W13 — aggregate-only product Insights (audits H1–H5 metrics).
 *
 * Reads come from `getInsights()` (service-role, counters only — no IP,
 * cookie, user id or path ever reaches `analytics_daily`).
 *
 * The guard is any-of and mirrors the nav entry exactly
 * (`components/admin/nav-items.tsx`, asserted by
 * `lib/admin/nav-integrity.test.ts`). It used to be `viewDashboard` alone,
 * written when `analytics.read` did not exist; once the nav was widened so the
 * spec §17 Analyst could see Insights, the page guard stayed behind and the
 * Analyst's only visible link bounced them to not-authorized. `analytics.read`
 * is the capability the role is named for, and this page is the only aggregate
 * analytics surface, so it is the right one to accept.
 *
 * Structure answers four questions in order: how much (overview) → where from
 * (traffic) → is it converting (conversion) → what earned it (content). Every
 * section carries an id so KPI cards can deep-link into their own chart.
 */

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.insights.title }
}

function Section({
  id,
  title,
  hint,
  children,
}: {
  id: string
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 space-y-3">
      <div className="flex flex-col gap-0.5 border-b border-border pb-2 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
        <h2 id={`${id}-h`} className="text-base font-semibold tracking-tight">
          {title}
        </h2>
        {hint && <p className="text-xs text-muted-foreground sm:text-right">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

/** `home-hero` → `Home hero`: the top-surface KPI used to print the raw key. */
function humanizeKey(key: string): string {
  return key.replace(/[-_]+/g, ' ').replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

export default async function Page() {
  await requireAnyCapability(['viewDashboard', 'analytics.read'], '/admin/insights')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.insights
  const insights = await getInsights()
  const chartLocale = locale === 'fr' ? 'fr' : 'en'
  const longLocale = chartLocale === 'fr' ? 'fr-FR' : 'en-GB'

  const refreshedAt = new Intl.DateTimeFormat(longLocale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(new Date())

  const hasAnyData =
    insights.views14d > 0 ||
    insights.funnel.submissionsReceived > 0 ||
    insights.funnel.published > 0 ||
    insights.shares14d > 0 ||
    insights.topContent.length > 0

  const sparkTitles = insights.daily.map(
    (d) => `${shortDayLabel(d.day, chartLocale)} — ${d.count.toLocaleString()}`,
  )

  // Conversion ratios come from the same funnel counters the chart uses —
  // computed here (not in analytics.ts) so the summary layer stays counters
  // only and any rounding stays a presentation concern.
  const submitConversion =
    insights.funnel.submitPageViews > 0
      ? Math.round((insights.funnel.submissionsReceived / insights.funnel.submitPageViews) * 1000) / 10
      : null
  const publishRate =
    insights.funnel.submissionsReceived > 0
      ? Math.round((insights.funnel.published / insights.funnel.submissionsReceived) * 100)
      : null

  // One pool for both rankings: flipping the metric reorders the same items
  // instead of swapping in a second, differently-populated table.
  const leaderboardRows = unionRows([insights.topContent, insights.topShared])
  const leaderboardCopy: LeaderboardCopy = {
    leaderboardTitle: t.leaderboardTitle,
    topViewedTitle: t.topViewedTitle,
    topSharedTitle: t.topSharedTitle,
    colViews: t.colViews,
    colShares: t.colShares,
    colProof: t.colProof,
    proofVisible: t.proofVisible,
    proofHidden: t.proofHidden,
    emptyTop: t.emptyTop,
    per100Views: t.per100Views,
    colRank: t.colRank,
    lifetimeNote: t.lifetimeNote,
    zeroMetricNote: t.zeroMetricNote,
    openEditor: t.openEditor,
    viewLive: dict.admin.content.viewLive,
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground tabular-nums">
            <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
            {t.revalidate} {refreshedAt} UTC
          </span>
        }
      />

      {!hasAnyData ? (
        <EmptyState message={t.noData} className="py-12" />
      ) : (
        <>
          {/* 1 — how much, how fast, what peaked */}
          <Section id="overview" title={t.sectionOverview} hint={t.sectionOverviewHint}>
            <StatGrid>
              <StatCard
                label={t.views14d}
                value={insights.views14d}
                href="#traffic"
                footer={
                  <MiniBars
                    values={insights.daily.map((d) => d.count)}
                    titles={sparkTitles}
                    label={t.sparklineLabel}
                    tone="blue"
                    className="h-6"
                  />
                }
              />
              <StatCard
                label={t.views7d}
                value={insights.views7d}
                hint={`${t.prior7d}: ${insights.viewsPrior7d.toLocaleString()}`}
                href="#traffic"
                {...(insights.deltaPct != null
                  ? { trend: { value: insights.deltaPct, positive: insights.deltaPct >= 0 } }
                  : {})}
              />
              <StatCard
                label={t.shares14d}
                value={insights.shares14d}
                hint={`${t.shares7d}: ${insights.shares7d.toLocaleString()}`}
                href="#traffic"
                {...(insights.sharesDeltaPct != null
                  ? { trend: { value: insights.sharesDeltaPct, positive: insights.sharesDeltaPct >= 0 } }
                  : {})}
              />
              <StatCard
                label={t.engagementRate}
                value={insights.engagementRate != null ? `${insights.engagementRate}%` : '—'}
                hint={t.engagementHint}
                href="#conversion"
              />
              <StatCard
                label={t.avgPerDay}
                value={insights.avgPerDay}
                href="#traffic"
                hint={
                  insights.peakDay
                    ? `${t.peakDay}: ${shortDayLabel(insights.peakDay.day, chartLocale)} (${insights.peakDay.count.toLocaleString()})`
                    : undefined
                }
              />
              <StatCard
                label={t.bestSurface}
                value={insights.bestSurface ? humanizeKey(insights.bestSurface.key) : '—'}
                hint={insights.bestSurface ? insights.bestSurface.count.toLocaleString() : undefined}
                href="#traffic"
              />
            </StatGrid>
          </Section>

          {/* 2 — where the attention came from */}
          <Section id="traffic" title={t.sectionTraffic} hint={t.sectionTrafficHint}>
            <Card>
              <CardHeader>
                <CardTitle>{t.trafficTitle}</CardTitle>
                <CardDescription>{t.trafficHint}</CardDescription>
              </CardHeader>
              <CardContent>
                <TrafficChart
                  daily={insights.daily}
                  dailyShares={insights.dailyShares}
                  ariaLabel={`${t.trafficTitle} — ${t.views14d}: ${insights.views14d.toLocaleString()}, ${t.shares14d}: ${insights.shares14d.toLocaleString()}`}
                  viewsLabel={t.views}
                  sharesLabel={t.colShares}
                  locale={chartLocale}
                />
              </CardContent>
            </Card>

            <div className="grid gap-3 md:grid-cols-3">
              <Card>
                <CardHeader>
                  <CardTitle>{t.bySurface}</CardTitle>
                  <CardDescription>{t.rankedHint}</CardDescription>
                </CardHeader>
                <CardContent>
                  <BreakdownBarChart
                    rows={insights.bySurface}
                    ariaLabel={`${t.bySurface} — ${t.views}: ${insights.views14d.toLocaleString()}`}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t.byLocale}</CardTitle>
                  <CardDescription>{t.localeHint}</CardDescription>
                </CardHeader>
                <CardContent>
                  <LocaleDonut rows={insights.byLocale} ariaLabel={t.byLocale} />
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle>{t.byPlace}</CardTitle>
                  <CardDescription>{t.rankedHint}</CardDescription>
                </CardHeader>
                <CardContent>
                  <BreakdownBarChart
                    rows={insights.byPlace}
                    ariaLabel={`${t.byPlace} — ${t.views}: ${insights.views14d.toLocaleString()}`}
                  />
                </CardContent>
              </Card>
            </div>
          </Section>

          {/* 3 — is it converting */}
          <Section id="conversion" title={t.sectionConversion} hint={t.sectionConversionHint}>
            <div className="grid gap-3 lg:grid-cols-5">
              <Card className="lg:col-span-3">
                <CardHeader>
                  <CardTitle>{t.funnelTitle}</CardTitle>
                  <CardDescription>{t.funnelHint}</CardDescription>
                </CardHeader>
                <CardContent>
                  <FunnelChart
                    funnel={insights.funnel}
                    ariaLabel={t.funnelTitle}
                    labels={[t.funnelViews, t.funnelSubmitted, t.funnelPublished]}
                    endToEndLabel={t.funnelEndToEnd}
                  />
                </CardContent>
              </Card>

              {/* Shares by voice register */}
              <Card className="lg:col-span-2">
                <CardHeader>
                  <CardTitle>{t.shareVoiceTitle}</CardTitle>
                  <CardDescription>{t.shareVoiceHint}</CardDescription>
                </CardHeader>
                <CardContent>
                  <BreakdownBarChart
                    rows={insights.shareByVoice}
                    ariaLabel={t.shareVoiceTitle}
                    color="#16a34a"
                  />
                </CardContent>
              </Card>
            </div>

            <StatGrid>
              <StatCard
                label={t.submitConversion}
                value={submitConversion != null ? `${submitConversion}%` : '—'}
                hint={t.submitConversionHint}
              />
              <StatCard
                label={t.publishRate}
                value={publishRate != null ? `${publishRate}%` : '—'}
                hint={t.publishRateHint}
              />
            </StatGrid>
          </Section>

          {/* P5 — weekly retro narrator (generate-on-tap, aggregates only). */}
          <RetroPanel
            copy={t}
            locale={chartLocale}
            stats={{
              views14d: insights.views14d,
              views7d: insights.views7d,
              shares14d: insights.shares14d,
              shares7d: insights.shares7d,
              published: insights.funnel.published,
              submissions: insights.funnel.submissionsReceived,
            }}
            topTitles={insights.topContent.slice(0, 8).map((r) => r.title)}
          />

          {/* 4 — what earned it (lifetime per-content counters) */}
          <Section id="content" title={t.sectionContent} hint={t.sectionContentHint}>
            <Card>
              <CardHeader>
                <CardTitle>{t.totalsTitle}</CardTitle>
                <CardDescription>{t.proofCoverageHint}</CardDescription>
              </CardHeader>
              <CardContent>
                <StatGrid>
                  <StatCard label={t.totalViews} value={insights.totalContentViews} />
                  <StatCard label={t.totalShares} value={insights.totalContentShares} />
                  <StatCard label={t.publishedItems} value={insights.publishedItems} />
                  <StatCard
                    label={t.proofCoverage}
                    value={insights.proofCoveragePct != null ? `${insights.proofCoveragePct}%` : '—'}
                    hint={`${insights.proofVisibleCount.toLocaleString()} / ${insights.publishedItems.toLocaleString()}`}
                    footer={
                      insights.proofCoveragePct != null ? (
                        <MeterBar value={insights.proofCoveragePct} max={100} tone="emerald" />
                      ) : undefined
                    }
                  />
                </StatGrid>
                <p className="mt-2 text-xs text-muted-foreground">{t.proofHint}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t.leaderboardTitle}</CardTitle>
                <CardDescription>{t.rankedHint}</CardDescription>
              </CardHeader>
              <CardContent>
                <ContentLeaderboard
                  rows={leaderboardRows}
                  locale={chartLocale}
                  typeLabels={dict.admin.common.types as Record<string, string>}
                  copy={leaderboardCopy}
                />
              </CardContent>
            </Card>
          </Section>
        </>
      )}

      <p className="text-xs text-muted-foreground">{t.privacyNote}</p>
    </div>
  )
}
