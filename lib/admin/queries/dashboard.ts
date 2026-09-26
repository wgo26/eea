import 'server-only'

import type { Capability } from '@/lib/auth/capabilities'
import { getBackToSchoolContentPriorities, BACK_TO_SCHOOL_WIDGET_IDS } from '@/lib/platform/back-to-school'
import { isWidgetId, type WidgetId } from '@/lib/admin/widget-layout'
import { logger } from '@/lib/observability/logger'
import {
    getSystemMetrics,
    type ErrorRate,
    type MetricComponent,
    type QueueHealth,
    type SystemStatus,
} from '@/lib/observability/metrics'
import { db, hasDatabase, safe } from './shared'
import { getActiveIncident, type IncidentRow } from './states'
// The SLA thresholds live in the pure insight helpers so the alert query and
// the SLA-toned dashboard UI (glance strip) agree on one definition.
import { SLA_CRITICAL_HOURS, SLA_WARNING_HOURS } from '../insights'

export { SLA_CRITICAL_HOURS, SLA_WARNING_HOURS }

/**
 * Phase 4.4 — the dashboard's operational layer (spec §34/§35/§52).
 *
 * `getDashboardStats()` (content-ops) answers "how much content is where".
 * This module answers the three questions spec §34 puts above the counters:
 *
 *   §34.1 "What requires attention?"  → getOperationalAlerts()
 *   §34.3 "Is the platform well?"     → getSystemHealth()
 *   §34.5 "What should I do next?"    → getPrioritizedActions()
 *
 * plus the two read models the widget registry renders from:
 * getPublishingActivity() (Publishing Calendar) and getEducationSnapshot()
 * (the Back to School season widgets, spec §23).
 *
 * Every read is service-role + `safe()`-wrapped, so a DB outage degrades the
 * widget to a zero/empty state instead of taking the dashboard down — the page
 * that reports an outage must render during one.
 */

/* ------------------------------------------------------------------ */
/* §34.1 — Operational alerts                                          */
/* ------------------------------------------------------------------ */

export type AlertId =
    | 'incident'
    | 'sla'
    | 'failed-jobs'
    | 'failed-deliveries'
    | 'open-reports'

export type AlertSeverity = 'info' | 'warning' | 'critical'

export type OperationalAlert = {
    id: AlertId
    severity: AlertSeverity
    /** Rows behind the alert — 0 for an incident (it is one row by definition). */
    count: number
    /** How long the oldest item has been waiting; null when not age-based. */
    oldestHours: number | null
    /** Locale-free path; the page prefixes it with localePath(). */
    href: string
    /** Incident id, so the alert can deep-link to the incident it describes. */
    incidentId?: string
}

/* SLA thresholds (SLA_WARNING_HOURS / SLA_CRITICAL_HOURS) live in ../insights. */

function hoursSince(value: string | null | undefined, now: Date): number | null {
    if (!value) return null
    const then = new Date(value).getTime()
    if (Number.isNaN(then)) return null
    return Math.max(0, Math.floor((now.getTime() - then) / 3_600_000))
}

/**
 * What requires attention right now (spec §34.1), highest severity first.
 *
 * Alerts are derived, never stored: each one is a live count, so the list
 * empties itself the moment the underlying queue is cleared instead of needing
 * an acknowledge step that can drift from reality.
 */
export async function getOperationalAlerts(options?: { now?: Date }): Promise<OperationalAlert[]> {
    if (!hasDatabase()) return []
    const now = options?.now ?? new Date()
    const since = new Date(now.getTime() - 24 * 3_600_000).toISOString()
    const slaCutoff = new Date(now.getTime() - SLA_WARNING_HOURS * 3_600_000).toISOString()

    try {
        const incidentPromise: Promise<IncidentRow | null> = getActiveIncident().catch(() => null)
        const [incident, staleRes, failedJobsRes, failedDeliveriesRes, reportsRes] = await Promise.all([
            incidentPromise,
            safe(
                db()
                    .from('submissions')
                    .select('submitted_at', { count: 'exact' })
                    .in('status', ['pending', 'in_review'])
                    .lt('submitted_at', slaCutoff)
                    .order('submitted_at', { ascending: true })
                    .limit(1),
            ),
            safe(
                db()
                    .from('storage_tasks')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'failed')
                    .gte('created_at', since),
            ),
            safe(
                db()
                    .from('notification_outbox')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'failed')
                    .gte('created_at', since),
            ),
            safe(
                db()
                    .from('reports')
                    .select('created_at', { count: 'exact' })
                    .eq('status', 'open')
                    .lt('created_at', slaCutoff)
                    .order('created_at', { ascending: true })
                    .limit(1),
            ),
        ])

        const alerts: OperationalAlert[] = []

        if (incident) {
            alerts.push({
                // An incident is open whatever its severity — it still needs an owner.
                id: 'incident',
                severity: incident.severity === 'critical' ? 'critical' : 'warning',
                count: 1,
                oldestHours: hoursSince(incident.startTime, now),
                href: `/admin/incidents/${incident.id}`,
                incidentId: incident.id,
            })
        }

        const slaCount = staleRes.count ?? 0
        if (slaCount > 0) {
            const oldestHours = hoursSince(
                ((staleRes.data ?? []) as { submitted_at: string | null }[])[0]?.submitted_at,
                now,
            )
            alerts.push({
                id: 'sla',
                severity: (oldestHours ?? 0) >= SLA_CRITICAL_HOURS ? 'critical' : 'warning',
                count: slaCount,
                oldestHours,
                href: '/admin/moderation?status=pending',
            })
        }

        const failedJobs = failedJobsRes.count ?? 0
        if (failedJobs > 0) {
            alerts.push({
                id: 'failed-jobs',
                severity: failedJobs > 10 ? 'critical' : 'warning',
                count: failedJobs,
                oldestHours: null,
                href: '/admin/storage-backup',
            })
        }

        const failedDeliveries = failedDeliveriesRes.count ?? 0
        if (failedDeliveries > 0) {
            alerts.push({
                id: 'failed-deliveries',
                severity: failedDeliveries > 25 ? 'critical' : 'warning',
                count: failedDeliveries,
                oldestHours: null,
                href: '/admin/notifications',
            })
        }

        const openReports = reportsRes.count ?? 0
        if (openReports > 0) {
            alerts.push({
                id: 'open-reports',
                severity: 'warning',
                count: openReports,
                oldestHours: hoursSince(
                    ((reportsRes.data ?? []) as { created_at: string | null }[])[0]?.created_at,
                    now,
                ),
                href: '/admin/safety',
            })
        }

        const rank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
        return alerts.sort((a, b) => rank[a.severity] - rank[b.severity])
    } catch (e) {
        logger.error('admin', 'getOperationalAlerts failed', { error: e })
        return []
    }
}

/* ------------------------------------------------------------------ */
/* §34.3 / §52 — System health                                         */
/* ------------------------------------------------------------------ */

export type SystemHealth = {
    status: SystemStatus
    components: MetricComponent[]
    queue: QueueHealth
    errorRate: ErrorRate
    checkedAt: string
}

/**
 * The metrics aggregate, narrowed to what a widget shows. Separated from
 * `getSystemMetrics()` so the dashboard does not depend on the metrics
 * module's full shape (runtime/uptime facts belong to the observability
 * endpoint, not a card).
 */
export async function getSystemHealth(): Promise<SystemHealth> {
    try {
        const metrics = await getSystemMetrics()
        return {
            status: metrics.status,
            components: metrics.components,
            queue: metrics.queue,
            errorRate: metrics.errorRate,
            checkedAt: metrics.timestamp,
        }
    } catch (e) {
        logger.error('admin', 'getSystemHealth failed', { error: e })
        return {
            status: 'unknown',
            components: [],
            queue: { pending: 0, failed: 0, oldestPendingAt: null },
            errorRate: { windowHours: 24, failedOps: 0, totalOps: 0, ratePct: 0 },
            checkedAt: new Date().toISOString(),
        }
    }
}

/* ------------------------------------------------------------------ */
/* Publishing activity (Publishing Calendar widget)                    */
/* ------------------------------------------------------------------ */

export type PublishingActivity = {
    /** UTC days, ascending and zero-filled, so the bar chart has no gaps. */
    days: { date: string; count: number }[]
    byType: { type: string; count: number }[]
    total: number
}

export async function getPublishingActivity(days = 14): Promise<PublishingActivity> {
    if (!hasDatabase()) return { days: [], byType: [], total: 0 }
    const window = Math.max(1, Math.min(90, days))
    try {
        const start = new Date()
        start.setUTCHours(0, 0, 0, 0)
        start.setUTCDate(start.getUTCDate() - (window - 1))

        const { data } = await safe(
            db()
                .from('content_items')
                .select('type, published_at')
                .eq('status', 'published')
                .gte('published_at', start.toISOString()),
        )

        const rows = (data ?? []) as { type: string; published_at: string | null }[]
        const perDay = new Map<string, number>()
        const perType = new Map<string, number>()
        for (const row of rows) {
            if (row.published_at) {
                const day = row.published_at.slice(0, 10)
                perDay.set(day, (perDay.get(day) ?? 0) + 1)
            }
            perType.set(row.type, (perType.get(row.type) ?? 0) + 1)
        }

        const series: { date: string; count: number }[] = []
        for (let i = 0; i < window; i++) {
            const day = new Date(start.getTime() + i * 86_400_000).toISOString().slice(0, 10)
            series.push({ date: day, count: perDay.get(day) ?? 0 })
        }

        return {
            days: series,
            byType: [...perType.entries()]
                .map(([type, count]) => ({ type, count }))
                .sort((a, b) => b.count - a.count),
            total: rows.length,
        }
    } catch (e) {
        logger.error('admin', 'getPublishingActivity failed', { error: e })
        return { days: [], byType: [], total: 0 }
    }
}

/* ------------------------------------------------------------------ */
/* §35 — Saved widget layout                                           */
/* ------------------------------------------------------------------ */

/**
 * The viewer's saved widget arrangement, or null when they have never saved one.
 *
 * Null and empty are different answers here: null is "no preference → use the
 * role defaults", while `[]` is a deliberately emptied dashboard that must stay
 * empty. Only this read reports what is stored — choosing between null, empty
 * and defaults belongs to `resolveWidgetLayout()`.
 *
 * Ids are filtered through the registry's vocabulary at read time, so a widget
 * deleted from the code cannot come back as a blank card; the layout simply
 * loses it. (The role stored on the row is deliberately ignored: a user who
 * changes role should get their layout re-evaluated against the new role, which
 * the page does via `resolveWidgetLayout`.)
 */
export async function getSavedWidgetLayout(userId: string): Promise<WidgetId[] | null> {
    if (!hasDatabase()) return null
    try {
        const { data } = await safe(
            db().from('admin_widget_layouts').select('widgets').eq('user_id', userId).maybeSingle(),
        )
        const saved = (data as { widgets: unknown } | null)?.widgets
        if (!Array.isArray(saved)) return null
        return saved.filter(isWidgetId)
    } catch (e) {
        logger.error('admin', 'getSavedWidgetLayout failed', { error: e })
        return null
    }
}

/* ------------------------------------------------------------------ */
/* §34.5 — Prioritized actions                                         */
/* ------------------------------------------------------------------ */

export type PrioritizedActionId =
    | 'resolve-incident'
    | 'restore-health'
    | 'clear-sla-backlog'
    | 'review-submissions'
    | 'triage-reports'
    | 'clear-failed-jobs'
    | 'schedule-drafts'
    | 'publish-drafts'

export type PrioritizedAction = {
    id: PrioritizedActionId
    severity: AlertSeverity
    count: number
    href: string
    /** Capability the action requires — the caller filters by this. */
    capability: Capability
}

export type PrioritizedActionInput = {
    /** The viewer's effective capabilities (legacy ∪ fine-grained roles). */
    capabilities: Capability[]
    alerts: OperationalAlert[]
    stats: { pendingSubmissions: number; scheduled: number; draftCount: number }
    systemStatus: SystemStatus
    hasActiveIncident: boolean
}

/**
 * "What should I do next?" (spec §34.5) — a pure ranking over facts the page
 * has already read, so it costs no queries and is unit-testable without a DB.
 *
 * Two rules keep it useful rather than noisy:
 *   - capability-gated: an editor is never told to clear failed storage jobs,
 *     and a moderator is never told to resolve an incident;
 *   - ordered by consequence: an open incident outranks a queue, a queue
 *     outranks housekeeping.
 */
export function getPrioritizedActions(input: PrioritizedActionInput): PrioritizedAction[] {
    const caps = new Set(input.capabilities)
    const actions: PrioritizedAction[] = []
    const alert = (id: AlertId) => input.alerts.find((a) => a.id === id)

    const incident = alert('incident')
    if (incident && caps.has('incidents.manage')) {
        actions.push({
            id: 'resolve-incident',
            severity: 'critical',
            count: 1,
            href: incident.href,
            capability: 'incidents.manage',
        })
    }

    if (input.systemStatus === 'degraded' || input.systemStatus === 'unavailable') {
        actions.push({
            id: 'restore-health',
            severity: input.systemStatus === 'unavailable' ? 'critical' : 'warning',
            count: 1,
            href: '/admin/states',
            capability: 'viewDashboard',
        })
    }

    const sla = alert('sla')
    if (sla && caps.has('moderate')) {
        actions.push({
            id: 'clear-sla-backlog',
            severity: sla.severity,
            count: sla.count,
            href: sla.href,
            capability: 'moderate',
        })
    } else if (input.stats.pendingSubmissions > 0 && caps.has('moderate')) {
        actions.push({
            id: 'review-submissions',
            severity: 'info',
            count: input.stats.pendingSubmissions,
            href: '/admin/moderation?status=pending',
            capability: 'moderate',
        })
    }

    const reports = alert('open-reports')
    if (reports && caps.has('moderate')) {
        actions.push({
            id: 'triage-reports',
            severity: reports.severity,
            count: reports.count,
            href: reports.href,
            capability: 'moderate',
        })
    }

    const failedJobs = alert('failed-jobs')
    const failedDeliveries = alert('failed-deliveries')
    if ((failedJobs || failedDeliveries) && caps.has('system.owner')) {
        const source = failedJobs ?? failedDeliveries!
        actions.push({
            id: 'clear-failed-jobs',
            severity: source.severity,
            count: (failedJobs?.count ?? 0) + (failedDeliveries?.count ?? 0),
            href: source.href,
            capability: 'system.owner',
        })
    }

    if (input.stats.scheduled > 0 && caps.has('manageContent')) {
        actions.push({
            id: 'schedule-drafts',
            severity: 'info',
            count: input.stats.scheduled,
            href: '/admin/content?status=scheduled',
            capability: 'manageContent',
        })
    }

    if (input.stats.draftCount > 0 && caps.has('manageContent')) {
        actions.push({
            id: 'publish-drafts',
            severity: 'info',
            count: input.stats.draftCount,
            href: '/admin/content?status=draft',
            capability: 'manageContent',
        })
    }

    const rank: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 }
    return actions.sort((a, b) => rank[a.severity] - rank[b.severity] || b.count - a.count)
}

/* ------------------------------------------------------------------ */
/* Back to School season widgets (spec §23)                            */
/* ------------------------------------------------------------------ */

export type EducationUpcomingDate = {
    id: string
    slug: string
    title: string
    startsAt: string | null
    venue: string | null
}

export type EducationSnapshot = {
    /** How many of the §23 priority slugs resolve to a real category. */
    categoryCount: number
    stories: number
    notices: number
    /** Published notices expiring inside the next 14 days — the alerts queue. */
    communityAlerts: number
    upcoming: EducationUpcomingDate[]
}

export const EMPTY_EDUCATION_SNAPSHOT: EducationSnapshot = {
    categoryCount: 0,
    stories: 0,
    notices: 0,
    communityAlerts: 0,
    upcoming: [],
}

/** Content types whose published items count as "education stories". */
const STORY_TYPES = ['photo_story', 'news', 'culture', 'timeline', 'micro_story']
const EDUCATION_WINDOW_DAYS = 30
const UPCOMING_WINDOW_DAYS = 30

/**
 * The season's dashboard data (spec §23). Every number is derived from the
 * content database, not from a hand-maintained list:
 *
 *   stories/notices   — published items in the §23 priority categories.
 *   communityAlerts   — published notices expiring within 14 days.
 *   upcoming          — events starting within 30 days, soonest first.
 *
 * Submissions carry no category (see the public submit form), so a seasonal
 * *submission* view cannot be filtered by taxonomy without inventing data — the
 * `education-submissions` widget therefore counts the season's relevant
 * submission types (notices + marketplace) instead, and says so in its copy.
 *
 * `categoryCount` is 0 on a fresh install (no education categories seeded):
 * the widgets surface that as a configuration hint rather than showing a
 * confident "0 stories" that would read as "nothing published".
 */
export async function getEducationSnapshot(locale: 'en' | 'fr' = 'en'): Promise<EducationSnapshot> {
    if (!hasDatabase()) return EMPTY_EDUCATION_SNAPSHOT
    try {
        const priorities = getBackToSchoolContentPriorities()
        const { data: categoryRows } = await safe(
            db().from('categories').select('id, slug').in('slug', priorities),
        )
        const categoryIds = ((categoryRows ?? []) as { id: string; slug: string }[]).map((row) => row.id)
        if (categoryIds.length === 0) {
            return { ...EMPTY_EDUCATION_SNAPSHOT, categoryCount: 0, upcoming: await getUpcomingDates(locale) }
        }

        const since = new Date(Date.now() - EDUCATION_WINDOW_DAYS * 86_400_000).toISOString()
        const alertWindow = new Date(Date.now() + 14 * 86_400_000).toISOString()

        const [storiesRes, noticesRes, alertsRes, upcoming] = await Promise.all([
            safe(
                db()
                    .from('content_items')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'published')
                    .in('type', STORY_TYPES)
                    .in('category_id', categoryIds)
                    .gte('published_at', since),
            ),
            safe(
                db()
                    .from('content_items')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'published')
                    .eq('type', 'notice')
                    .in('category_id', categoryIds)
                    .gte('published_at', since),
            ),
            safe(
                db()
                    .from('content_items')
                    .select('id', { count: 'exact', head: true })
                    .eq('status', 'published')
                    .eq('type', 'notice')
                    .gt('expires_at', new Date().toISOString())
                    .lte('expires_at', alertWindow),
            ),
            getUpcomingDates(locale),
        ])

        return {
            categoryCount: categoryIds.length,
            stories: storiesRes.count ?? 0,
            notices: noticesRes.count ?? 0,
            communityAlerts: alertsRes.count ?? 0,
            upcoming,
        }
    } catch (e) {
        logger.error('admin', 'getEducationSnapshot failed', { error: e })
        return EMPTY_EDUCATION_SNAPSHOT
    }
}

/** Events starting in the next 30 days, soonest first (the season's date board). */
async function getUpcomingDates(locale: 'en' | 'fr'): Promise<EducationUpcomingDate[]> {
    try {
        const now = new Date()
        const until = new Date(now.getTime() + UPCOMING_WINDOW_DAYS * 86_400_000).toISOString()
        const { data } = await safe(
            db()
                .from('content_items')
                .select('id, slug, events!inner(starts_at, venue_name), content_translations(locale, title)')
                .eq('status', 'published')
                .eq('type', 'event')
                .gt('events.starts_at', now.toISOString())
                .lte('events.starts_at', until)
                .order('starts_at', { referencedTable: 'events', ascending: true })
                .limit(6),
        )
        return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
            const event = (Array.isArray(row.events) ? row.events[0] : row.events) as
                | { starts_at: string | null; venue_name: string | null }
                | undefined
            const translations = (row.content_translations ?? []) as { locale: string; title: string | null }[]
            const slug = typeof row.slug === 'string' ? row.slug : String(row.id ?? '')
            const title =
                translations.find((t) => t.locale === locale)?.title ??
                translations[0]?.title ??
                slug
            return {
                id: String(row.id ?? ''),
                slug,
                title,
                startsAt: event?.starts_at ?? null,
                venue: event?.venue_name ?? null,
            }
        })
    } catch (e) {
        logger.error('admin', 'getUpcomingDates failed', { error: e })
        return []
    }
}

export { BACK_TO_SCHOOL_WIDGET_IDS }
