import { getDictionary } from '@/lib/i18n'
import { getRequestLocale } from '@/lib/i18n/server'
import { requireAnyCapability } from '@/lib/auth/guards'
import { getInsights, type TopContentRow } from '@/lib/admin/analytics'
import { PageHeader } from '@/components/admin/page-header'
import { StatCard, StatGrid } from '@/components/admin/stat-card'
import { EmptyState } from '@/components/admin/empty-state'
import { TrafficChart, BreakdownBarChart, LocaleDonut, FunnelChart, shortDayLabel } from '@/components/admin/insights-charts'
import { MeterBar } from '@/components/admin/viz'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { RetroPanel } from './retro-panel'

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
 */

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.insights.title }
}

const sectionHeadingCls =
  'text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2'

type TopTableLabels = {
  emptyTop: string
  colContent: string
  colType: string
  colViews: string
  colShares: string
  colProof: string
  proofVisible: string
  proofHidden: string
}

/** Top-content table — module-level so it never resets state per render. */
function TopTable({ rows, t }: { rows: TopContentRow[]; t: TopTableLabels }) {
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.emptyTop}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
            <th className="py-2 pr-3 font-medium">{t.colContent}</th>
            <th className="py-2 pr-3 font-medium">{t.colType}</th>
            <th className="py-2 pr-3 text-right font-medium">{t.colViews}</th>
            <th className="py-2 pr-3 text-right font-medium">{t.colShares}</th>
            <th className="py-2 text-right font-medium">{t.colProof}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              <td className="max-w-60 truncate py-2 pr-3 font-medium">
                {row.title}
              </td>
              <td className="py-2 pr-3 text-muted-foreground">{row.type}</td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {row.views.toLocaleString()}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {row.shares.toLocaleString()}
              </td>
              <td className="py-2 text-right text-xs">
                {row.viewsPublic || row.sharesPublic ? (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                    {t.proofVisible}
                  </span>
                ) : (
                  <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-muted-foreground">
                    {t.proofHidden}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default async function Page() {
  await requireAnyCapability(['viewDashboard', 'analytics.read'], '/admin/insights')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.insights
  const insights = await getInsights()

  const hasAnyData =
    insights.views14d > 0 ||
    insights.funnel.submissionsReceived > 0 ||
    insights.funnel.published > 0 ||
    insights.shares14d > 0 ||
    insights.topContent.length > 0

  return (
    <div className="space-y-5">
      <PageHeader title={t.title} description={t.description} />

      {!hasAnyData ? (
        <EmptyState message={t.noData} />
      ) : (
        <>
          {/* KPI strip — answers "how much, how fast, what peaked" */}
          <StatGrid>
            <StatCard label={t.views14d} value={insights.views14d} />
            <StatCard
              label={t.views7d}
              value={insights.views7d}
              hint={`${t.prior7d}: ${insights.viewsPrior7d.toLocaleString()}`}
              {...(insights.deltaPct != null
                ? { trend: { value: insights.deltaPct, positive: insights.deltaPct >= 0 } }
                : {})}
            />
            <StatCard
              label={t.shares14d}
              value={insights.shares14d}
              hint={`${t.shares7d}: ${insights.shares7d.toLocaleString()}`}
              {...(insights.sharesDeltaPct != null
                ? { trend: { value: insights.sharesDeltaPct, positive: insights.sharesDeltaPct >= 0 } }
                : {})}
            />
            <StatCard
              label={t.engagementRate}
              value={insights.engagementRate != null ? `${insights.engagementRate}%` : '—'}
              hint={t.engagementHint}
            />
            <StatCard
              label={t.avgPerDay}
              value={insights.avgPerDay}
              hint={insights.peakDay ? `${t.peakDay}: ${shortDayLabel(insights.peakDay.day, locale)} (${insights.peakDay.count.toLocaleString()})` : undefined}
            />
            <StatCard
              label={t.bestSurface}
              value={insights.bestSurface ? insights.bestSurface.key : '—'}
              hint={insights.bestSurface ? insights.bestSurface.count.toLocaleString() : undefined}
            />
          </StatGrid>

          {/* Hero — traffic views vs shares */}
          <Card>
            <CardHeader>
              <CardTitle className={sectionHeadingCls}>{t.trafficTitle}</CardTitle>
              <CardDescription>{t.trafficHint}</CardDescription>
            </CardHeader>
            <CardContent>
              <TrafficChart
                daily={insights.daily}
                dailyShares={insights.dailyShares}
                ariaLabel={`${t.trafficTitle} — ${t.views14d}: ${insights.views14d.toLocaleString()}, ${t.shares14d}: ${insights.shares14d.toLocaleString()}`}
                viewsLabel={t.views}
                sharesLabel={t.colShares}
                locale={locale === 'fr' ? 'fr' : 'en'}
              />
            </CardContent>
          </Card>

          {/* Breakdowns — 3-column grid */}
          <div className="grid gap-5 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className={sectionHeadingCls}>{t.bySurface}</CardTitle>
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
                <CardTitle className={sectionHeadingCls}>{t.byLocale}</CardTitle>
                <CardDescription>{t.localeHint}</CardDescription>
              </CardHeader>
              <CardContent>
                <LocaleDonut rows={insights.byLocale} ariaLabel={t.byLocale} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className={sectionHeadingCls}>{t.byPlace}</CardTitle>
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

          {/* Conversion funnel */}
          <div className="grid gap-5 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <CardHeader>
                <CardTitle className={sectionHeadingCls}>{t.funnelTitle}</CardTitle>
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
                <CardTitle className={sectionHeadingCls}>{t.shareVoiceTitle}</CardTitle>
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

          {/* Lifetime per-content counters */}
          <Card>
            <CardHeader>
              <CardTitle className={sectionHeadingCls}>{t.totalsTitle}</CardTitle>
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

          {/* P5 — weekly retro narrator (generate-on-tap, aggregates only). */}
          <RetroPanel
            copy={t}
            locale={locale === 'fr' ? 'fr' : 'en'}
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

          {/* Top content tables */}
          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className={sectionHeadingCls}>{t.topViewedTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                <TopTable rows={insights.topContent} t={t} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className={sectionHeadingCls}>{t.topSharedTitle}</CardTitle>
              </CardHeader>
              <CardContent>
                <TopTable rows={insights.topShared} t={t} />
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <p className="text-xs text-muted-foreground">{t.privacyNote}</p>
    </div>
  )
}
