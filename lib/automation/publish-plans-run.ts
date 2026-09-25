import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/observability/logger'
import { compileTemplate } from '@/lib/content/templates-run'
import { sendNotificationToRole } from '@/lib/admin/notification-writes'
import { computeNextRun, scheduledForForRun } from './plans'

/**
 * Publish-plan runner (Stream C). The /api/cron/publish-plans route calls
 * `runDuePublishPlans()` every 30 minutes:
 *
 *   due plan → compile its template into a draft (lib/content/templates-run)
 *            → draft-only: draft waits in the editorial queue (default).
 *            → auto-schedule: draft flips to status='scheduled',
 *              scheduled_for = slot + lead_minutes, and the EXISTING pg_cron
 *              publisher (20260904000000) takes it live on its own.
 *
 * Two-person control (C3): auto-schedule is a machine publishing without a
 * human — every creation/edit of an auto-schedule plan requires a second
 * admin (action `content.autopublish`, enforced in the action layer). The
 * runner itself never requests approvals; it executes what is on file.
 *
 * Self-healing (C5): 3 consecutive failures disable the plan and file an
 * "Automation" critical notification to admins, so a broken recipe cannot
 * silently spam the drafts queue every slot.
 */

export type PlanRunSummary = {
  due: number
  compiled: number
  scheduled: number
  empty: number
  failed: number
  disabled: string[]
}

type PlanRow = {
  id: string
  name: string
  template_id: string
  horizon: string
  day_of_week: number | null
  run_time: string
  lead_minutes: number
  review_mode: string
  next_run_at: string | null
  failure_count: number
}

const MAX_FAILURES = 3

export async function runDuePublishPlans(now: Date = new Date()): Promise<PlanRunSummary> {
  const summary: PlanRunSummary = { due: 0, compiled: 0, scheduled: 0, empty: 0, failed: 0, disabled: [] }
  const db = createAdminClient()
  const { data, error } = await db
    .from('publish_plans')
    .select('id, name, template_id, horizon, day_of_week, run_time, lead_minutes, review_mode, next_run_at, failure_count')
    .eq('enabled', true)
    .lte('next_run_at', now.toISOString())
    .limit(25)
  if (error) {
    logger.error('automation/plans', 'plan fetch failed', { error: error.message })
    return summary
  }
  const plans = (data ?? []) as PlanRow[]
  if (plans.length === 0) return summary
  summary.due = plans.length

  for (const plan of plans) {
    try {
      const next = computeNextRun(
        { horizon: plan.horizon as 'daily' | 'weekly', dayOfWeek: plan.day_of_week, runTime: plan.run_time },
        now,
      )
      if (!next) {
        // Malformed schedule: disable it rather than spin on it forever.
        await db.from('publish_plans').update({ enabled: false, last_status: 'failed', last_error: 'Invalid schedule shape.', next_run_at: now.toISOString() }).eq('id', plan.id)
        summary.failed += 1
        summary.disabled.push(plan.name)
        continue
      }

      const res = await compileTemplate(plan.template_id)
      if (!res.ok) {
        summary.failed += 1
        const failureCount = plan.failure_count + 1
        const disabled = failureCount >= MAX_FAILURES
        await db
          .from('publish_plans')
          .update({
            last_status: 'failed',
            last_error: (res.error ?? 'compile failed').slice(0, 300),
            last_run_at: now.toISOString(),
            next_run_at: next.toISOString(),
            failure_count: failureCount,
            enabled: disabled ? false : true,
          })
          .eq('id', plan.id)
        if (disabled) {
          summary.disabled.push(plan.name)
          await escalatePlanFailure(db, plan)
        }
        continue
      }

      const added = res.added ?? 0
      let scheduledFor: string | null = null
      if (res.draftId && plan.review_mode === 'auto-schedule' && added > 0) {
        const target = scheduledForForRun(
          { horizon: plan.horizon as 'daily' | 'weekly', dayOfWeek: plan.day_of_week, runTime: plan.run_time },
          now,
          plan.lead_minutes,
        )
        scheduledFor = target.toISOString()
        // Guard: only drafts move to scheduled — never touch a row an editor
        // has already advanced or claimed.
        const { error: scheduleError, count } = await db
          .from('content_items')
          .update({ status: 'scheduled', scheduled_for: scheduledFor }, { count: 'exact' })
          .eq('id', res.draftId)
          .eq('status', 'draft')
        if (scheduleError || !count) {
          logger.warn('automation/plans', 'auto-schedule skipped (draft moved?)', {
            planId: plan.id,
            draftId: res.draftId,
            error: scheduleError?.message ?? 'status no longer draft',
          })
          scheduledFor = null
        }
      }

      if (scheduledFor) summary.scheduled += 1
      else if (added > 0) summary.compiled += 1
      else summary.empty += 1

      await db
        .from('publish_plans')
        .update({
          last_status: added > 0 ? 'ok' : 'empty',
          last_error: null,
          last_run_at: now.toISOString(),
          next_run_at: next.toISOString(),
          failure_count: 0,
        })
        .eq('id', plan.id)
    } catch (e) {
      summary.failed += 1
      logger.error('automation/plans', 'plan run exception', { planId: plan.id, error: e instanceof Error ? e.message : String(e) })
    }
  }
  return summary
}

/** C5 — escalation: the plan stopped itself; admins must know, not discover. */
async function escalatePlanFailure(db: ReturnType<typeof createAdminClient>, plan: PlanRow): Promise<void> {
  try {
    await sendNotificationToRole(db, 'admin', {
      source: 'automation',
      category: 'critical',
      title: `Release plan disabled: ${plan.name}`,
      body: `After ${MAX_FAILURES} failed compiles the plan “${plan.name}” is disabled. Fix the template or re-enable the plan from Automations.`,
      linkPath: '/admin/automations',
    })
  } catch (e) {
    logger.error('automation/plans', 'escalation notification failed', { planId: plan.id, error: e instanceof Error ? e.message : String(e) })
  }
}
