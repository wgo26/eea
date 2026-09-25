import 'server-only'

import { logger } from '@/lib/observability/logger'
import { db, hasDatabase, safe } from './shared'

/**
 * Publish-plan reads (Stream C) + the E1 heartbeat strip. The automations
 * admin page owns the whole automation surface: release plans, their next
 * slots, and scheduler health from one place.
 */

export type PublishPlanRow = {
  id: string
  name: string
  templateId: string
  templateName: string | null
  horizon: 'daily' | 'weekly'
  dayOfWeek: number | null
  runTime: string
  leadMinutes: number
  reviewMode: 'draft-only' | 'auto-schedule'
  enabled: boolean
  nextRunAt: string | null
  lastRunAt: string | null
  lastStatus: string | null
  lastError: string | null
  failureCount: number
}

/** Every plan (ordered by next run), each labelled with its template name. */
export async function getPublishPlans(): Promise<PublishPlanRow[]> {
  if (!hasDatabase()) return []
  const { data, error } = await safe(
    db()
      .from('publish_plans')
      .select(
        `id, name, template_id, horizon, day_of_week, run_time, lead_minutes, review_mode,
         enabled, next_run_at, last_run_at, last_status, last_error, failure_count,
         template:content_templates(name)`,
      )
      .order('next_run_at', { ascending: true }),
  )
  if (error) logger.error('admin', 'getPublishPlans failed', { error })
  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const tpl = (Array.isArray(row.template) ? row.template[0] : row.template) as { name?: string } | undefined
    return {
      id: row.id as string,
      name: row.name as string,
      templateId: row.template_id as string,
      templateName: tpl?.name ?? null,
      horizon: (row.horizon === 'daily' ? 'daily' : 'weekly') as 'daily' | 'weekly',
      dayOfWeek: (row.day_of_week as number | null) ?? null,
      runTime: row.run_time as string,
      leadMinutes: (row.lead_minutes as number) ?? 60,
      reviewMode: (row.review_mode === 'auto-schedule' ? 'auto-schedule' : 'draft-only') as 'draft-only' | 'auto-schedule',
      enabled: Boolean(row.enabled),
      nextRunAt: (row.next_run_at as string | null) ?? null,
      lastRunAt: (row.last_run_at as string | null) ?? null,
      lastStatus: (row.last_status as string | null) ?? null,
      lastError: (row.last_error as string | null) ?? null,
      failureCount: (row.failure_count as number) ?? 0,
    }
  })
}

/** The next 10 upcoming release slots across active plans, soonest first (C4). */
export async function getUpcomingReleases(): Promise<{ name: string; at: string; mode: string }[]> {
  const plans = (await getPublishPlans()).filter((p) => p.enabled && p.nextRunAt)
  return plans
    .slice(0, 10)
    .map((p) => ({ name: p.name, at: p.nextRunAt as string, mode: p.reviewMode }))
}

/** The next N scheduled content items (already-queued items) + due-soon count. */
export async function getScheduledQueue(limit = 10): Promise<{ items: { id: string; title: string; at: string }[]; overdue: number }> {
  if (!hasDatabase()) return { items: [], overdue: 0 }
  const nowIso = new Date().toISOString()
  const { data } = await safe(
    db()
      .from('content_items')
      .select('id, scheduled_for, translations:content_translations(title)')
      .eq('status', 'scheduled')
      .not('scheduled_for', 'is', null)
      .gt('scheduled_for', nowIso)
      .order('scheduled_for', { ascending: true })
      .limit(limit),
  )
  const items = ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const trs = Array.isArray(row.translations) ? row.translations : row.translations ? [row.translations] : []
    const title = (trs.find((t: { locale?: string; title?: string }) => t.locale === 'en')?.title
      ?? (trs[0] as { title?: string })?.title ?? 'Untitled') as string
    return { id: row.id as string, title, at: row.scheduled_for as string }
  })
  const { count } = await safe(
    db()
      .from('content_items')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'scheduled')
      .lte('scheduled_for', nowIso),
  )
  return { items, overdue: count ?? 0 }
}
