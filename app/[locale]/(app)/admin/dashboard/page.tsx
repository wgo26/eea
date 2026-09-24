import { getDictionary } from '@/lib/i18n'
import { getRequestLocale } from '@/lib/i18n/server'
import { requireCapability } from '@/lib/auth/guards'
import { effectiveCapabilities } from '@/lib/auth/admin-roles'
import { isAdminRoles } from '@/lib/auth/roles'
import {
  getActiveStates,
  getDashboardStats,
  getEducationSnapshot,
  getOperationalAlerts,
  getPrioritizedActions,
  getPublishingActivity,
  getSavedWidgetLayout,
  getSystemHealth,
} from '@/lib/admin/queries'
import { getDemoDataCounts } from '@/lib/admin/demo-data'
import {
  BASE_WIDGET_IDS,
  WIDGET_IDS,
  isEducationSeasonActive,
  isEducationWidget,
  resolveWidgetLayout,
  type WidgetId,
} from '@/lib/admin/widget-layout'
import { DemoDataCard } from './demo-data-card'
import { PageHeader } from '@/components/admin/page-header'
import { CommandCenter } from '@/components/admin/command-center'
import { GlanceStrip } from '@/components/admin/glance-strip'
import { OverviewSection } from '@/components/admin/overview-section'
import { WidgetBoard } from '@/components/admin/widget-board'
import { WidgetBody, widgetTitles, type WidgetData } from '@/components/admin/widget-system'
import { EducationWidget } from '@/components/admin/widget-education'
import { buttonVariants } from '@/components/ui/button'
import { localePath } from '@/lib/i18n/urls'
import { FilePlus, Megaphone, UserPlus } from 'lucide-react'
import Link from 'next/link'

export async function generateMetadata(): Promise<{ title: string }> {
  const locale = await getRequestLocale()
  return { title: getDictionary(locale).admin.dashboard.title }
}

/**
 * Phase 4.4 → "command centre UX" upgrade — the dashboard (spec §34/§35).
 *
 * The page answers spec §34's five questions in reading order:
 *   1. glance strip   — is everything OK right now? (health, alerts, the SLA
 *                       clock and today's publishing in one scannable row)
 *   2. command center — what requires attention, and what to do about it
 *   3. overview band  — how much content is where, now with share meters, a
 *                       content-mix bar, the storage split and the editorial
 *                       pipeline funnel (the old Content + Operations bands,
 *                       unified into one section)
 *   4. widget board   — the arrangement the viewer saved (role defaults).
 *
 * All visualisations are hand-rolled CSS — the project carries no chart
 * library (see components/admin/viz.tsx) — and every number comes from
 * queries the page has already run: no widget adds a query on the render
 * path, and a DB outage degrades a card instead of the page.
 */
export default async function Page() {
  const { user, roles, adminRoles } = await requireCapability('viewDashboard', '/admin/dashboard')
  const locale = await getRequestLocale()
  const dict = getDictionary(locale)
  const t = dict.admin.dashboard
  const severity = dict.admin.statesPage.severity

  const [stats, alerts, health, activity, education, savedLayout, activeStates] = await Promise.all([
    getDashboardStats(),
    getOperationalAlerts(),
    getSystemHealth(),
    getPublishingActivity(),
    getEducationSnapshot(locale),
    getSavedWidgetLayout(user.id),
    getActiveStates(),
  ])
  // Demo-data sweep is admin-only: editors see neither the card nor the counts.
  const demoCounts = isAdminRoles(roles) ? await getDemoDataCounts() : null

  const role = isAdminRoles(roles) ? 'admin' : 'editor'
  const seasonActive = isEducationSeasonActive(
    new Date(),
    activeStates.map((state) => state.id),
  )
  const layout = resolveWidgetLayout(savedLayout, role, seasonActive)

  const actions = getPrioritizedActions({
    capabilities: [...effectiveCapabilities(roles, adminRoles)],
    alerts,
    stats: {
      pendingSubmissions: stats.pendingSubmissions,
      scheduled: stats.scheduled,
      draftCount: stats.draftCount,
    },
    systemStatus: health.status,
    hasActiveIncident: alerts.some((alert) => alert.id === 'incident'),
  })

  const data: WidgetData = { stats, alerts, health, activity }
  const titles = widgetTitles(t)
  const renderWidget = (id: WidgetId) =>
    isEducationWidget(id) ? (
      <EducationWidget id={id} snapshot={education} stats={stats} copy={t} locale={locale} />
    ) : (
      <WidgetBody
        id={id}
        data={data}
        copy={t}
        severity={severity}
        locale={locale}
        common={dict.admin.common}
        systemLabel={dict.admin.audit.system}
        deletedLabel={dict.admin.audit.deletedUser}
      />
    )

  const widgets = layout.map((id) => ({ id, content: renderWidget(id) }))
  // The catalogue only offers widgets the season allows, so an add can never
  // save an arrangement that `resolveWidgetLayout` would silently trim.
  const catalog = (seasonActive ? WIDGET_IDS : BASE_WIDGET_IDS).map((id) => ({
    id,
    title: titles[id],
  }))

  const contentHref = (params: { status?: string; type?: string }) => {
    const sp = new URLSearchParams({ tab: 'content' })
    if (params.status) sp.set('status', params.status)
    if (params.type) sp.set('type', params.type)
    return `${localePath(locale, '/admin/content')}?${sp.toString()}`
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t.title}
        description={t.description}
        actions={
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 hidden text-xs font-medium uppercase tracking-wide text-muted-foreground xl:inline">{t.quickActions}</span>
            <Link href={contentHref({})} aria-label={t.qaCreateContent} title={t.qaCreateContent} className={buttonVariants({ variant: 'default', size: 'sm' })}>
              <FilePlus aria-hidden="true" />
              <span className="hidden min-[480px]:inline">{t.qaCreateContent}</span>
            </Link>
            <Link href={localePath(locale, '/admin/users')} aria-label={t.qaInviteUser} title={t.qaInviteUser} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <UserPlus aria-hidden="true" />
              <span className="hidden min-[480px]:inline">{t.qaInviteUser}</span>
            </Link>
            <Link href={localePath(locale, '/admin/ads')} aria-label={t.qaNewAd} title={t.qaNewAd} className={buttonVariants({ variant: 'outline', size: 'sm' })}>
              <Megaphone aria-hidden="true" />
              <span className="hidden min-[480px]:inline">{t.qaNewAd}</span>
            </Link>
          </div>
        }
      />

      {/* Is everything OK right now? One scannable status row (§34.3/§34.4). */}
      <GlanceStrip health={health} alerts={alerts} stats={stats} copy={t} severity={severity} locale={locale} />

      {/* §34.1 + §34.5 — what requires attention, and what to do about it. */}
      <CommandCenter alerts={alerts} actions={actions} copy={t} severity={severity} locale={locale} />

      {/* §34.2 — the fixed counter band, unified: shares, meters, pipeline. */}
      <OverviewSection stats={stats} copy={t} locale={locale} />

      {/* §35 — the arrangement the viewer saved (role defaults when none). */}
      <WidgetBoard widgets={widgets} catalog={catalog} copy={t} cancelLabel={dict.admin.common.cancel} />

      {/* Demo data sweep — admin only (clear seeded sample content before real data) */}
      {demoCounts && <DemoDataCard copy={t} cancelLabel={dict.admin.common.cancel} counts={demoCounts} />}
    </div>
  )
}
