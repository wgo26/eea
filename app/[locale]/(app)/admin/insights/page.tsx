import { getDictionary } from '@/lib/i18n'
import { getRequestLocale } from '@/lib/i18n/server'
import { requireCapability } from '@/lib/auth/guards'
import { getInsights } from '@/lib/admin/analytics'
import { PageHeader } from '@/components/admin/page-header'
import { StatCard, StatGrid } from '@/components/admin/stat-card'
import { EmptyState } from '@/components/admin/empty-state'
import { DailyLineChart, BreakdownBarChart, LocaleDonut, FunnelChart } from '@/components/admin/insights-charts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * W13 — aggregate-only product Insights (audits H1–H5 metrics).
 *
 * Reads come from `getInsights()` (service-role, counters only — no IP,
 * cookie, user id or path ever reaches `analytics_daily`). Guard reuses
 * `viewDashboard` so admins and editors see it; no new capability was
 * added to keep the capability matrix stable.
 */

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.insights.title }
}

const sectionHeadingCls =
  'text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2'

export default async function Page() {
  await requireCapability('viewDashboard', '/admin/insights')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.insights
  const insights = await getInsights()

  const hasAnyData =
    insights.views14d > 0 ||
    insights.funnel.submissionsReceived > 0 ||
    insights.funnel.published > 0

  return (
    <div className="space-y-5">
      <PageHeader title={t.title} description={t.description} />

      {!hasAnyData ? (
        <EmptyState message={t.noData} />
      ) : (
        <>
          {/* Summary KPIs */}
          <StatGrid>
            <StatCard label={t.views14d} value={insights.views14d} />
            <StatCard
              label={t.views7d}
              value={insights.views7d}
              {...(insights.deltaPct != null
                ? { trend: { value: insights.deltaPct, positive: insights.deltaPct >= 0 } }
                : {})}
            />
            <StatCard label={t.prior7d} value={insights.viewsPrior7d} />
          </StatGrid>

          {/* Daily trend — area line chart */}
          <Card>
            <CardHeader>
              <CardTitle className={sectionHeadingCls}>{t.daily}</CardTitle>
            </CardHeader>
            <CardContent>
              <DailyLineChart
                daily={insights.daily}
                ariaLabel={`${t.daily} — ${t.views14d}: ${insights.views14d.toLocaleString()}`}
              />
            </CardContent>
          </Card>

          {/* Breakdowns — 3-column grid */}
          <div className="grid gap-5 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className={sectionHeadingCls}>{t.bySurface}</CardTitle>
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
              </CardHeader>
              <CardContent>
                <LocaleDonut rows={insights.byLocale} ariaLabel={t.byLocale} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className={sectionHeadingCls}>{t.byPlace}</CardTitle>
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
          <Card>
            <CardHeader>
              <CardTitle className={sectionHeadingCls}>{t.funnelTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <FunnelChart
                funnel={insights.funnel}
                ariaLabel={t.funnelTitle}
              />
            </CardContent>
          </Card>
        </>
      )}

      <p className="text-xs text-muted-foreground">{t.privacyNote}</p>
    </div>
  )
}
