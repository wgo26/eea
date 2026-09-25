'use server'

import { assertCapability, type AdminContext } from '@/lib/admin/auth'
import { audit, revalidateLocalized } from './_shared'
import { checkApproval, consumeApproval, requestTwoPersonApproval } from '@/lib/admin/two-person-control'
import { computeNextRun } from '@/lib/automation/plans'
import { logger } from '@/lib/observability/logger'

/**
 * Publish-plan writes (Stream C, C1/C3). Every create/update/delete is
 * capability-gated (manageContent) and audited. Auto-schedule plans — a
 * machine publishing without per-item review — carry the two-person control
 * (§44): the first call files an approval request, and the operation only
 * commits once a DIFFERENT admin approves and the acting admin retries with
 * the approval id (mirrors the emergency-publish gate). draft-only plans need
 * no approval: a human still publishes each compiled draft by hand.
 */

type PlanResult = { ok: true } | { ok: false; error: string; approvalRequired?: boolean; approvalId?: string }

export type PlanInput = {
  name: string
  templateId: string
  horizon: 'daily' | 'weekly'
  dayOfWeek: number | null
  runTime: string
  leadMinutes: number
  reviewMode: 'draft-only' | 'auto-schedule'
  enabled: boolean
}

function validate(input: PlanInput): string | null {
  if (!input.name.trim()) return 'A plan name is required.'
  if (!input.templateId) return 'Pick a recap template for the plan.'
  if (input.horizon === 'weekly' && (input.dayOfWeek === null || input.dayOfWeek < 0 || input.dayOfWeek > 6)) {
    return 'Weekly plans need a day of week.'
  }
  if (input.horizon === 'daily' && input.dayOfWeek !== null) {
    return 'Daily plans do not take a day of week.'
  }
  if (!Number.isFinite(input.leadMinutes) || input.leadMinutes < 5 || input.leadMinutes > 1440) {
    return 'Lead time must be between 5 and 1440 minutes.'
  }
  return null
}

/** next_run_at is computed on write so the cron has a deterministic anchor. */
function rowFor(input: PlanInput) {
  const schedule = { horizon: input.horizon, dayOfWeek: input.dayOfWeek, runTime: input.runTime }
  const next = computeNextRun(schedule, new Date())
  return {
    name: input.name.trim(),
    template_id: input.templateId,
    horizon: input.horizon,
    day_of_week: input.horizon === 'weekly' ? input.dayOfWeek : null,
    run_time: input.runTime,
    lead_minutes: Math.round(input.leadMinutes),
    review_mode: input.reviewMode,
    enabled: input.enabled,
    next_run_at: (next ?? new Date()).toISOString(),
  }
}

/**
 * The §44 gate for auto-schedule plans. Returns null when no approval is
 * needed (draft-only) or the approval is already satisfied (consumed on the
 * caller's behalf); otherwise a PlanResult to return straight to the UI.
 */
async function gateAutoSchedule(
  supabase: AdminContext['supabase'],
  user: AdminContext['user'],
  input: PlanInput,
  planId: string | null,
  approvalId: string | null | undefined,
): Promise<PlanResult | null> {
  if (input.reviewMode !== 'auto-schedule') return null
  const resourceType = 'publish_plan'
  if (!approvalId) {
    const req = await requestTwoPersonApproval({
      action: 'content.autopublish',
      actorId: user.id,
      resourceType,
      resourceId: planId,
      reason: `Release plan “${input.name}” auto-schedules compiled recaps for publishing.`,
    })
    if (!req.ok) return { ok: false, error: req.error }
    return {
      ok: false,
      error: 'A second administrator must approve an auto-schedule plan before it is saved.',
      approvalRequired: true,
      approvalId: req.id,
    }
  }
  const verdict = await checkApproval({
    approvalId,
    action: 'content.autopublish',
    actorId: user.id,
    resourceType,
    resourceId: planId,
  })
  if (!verdict.ok) return { ok: false, error: verdict.error }
  await consumeApproval(approvalId)
  return null
}

export async function createPublishPlan(input: PlanInput, approvalId?: string | null): Promise<PlanResult> {
  try {
    const invalid = validate(input)
    if (invalid) return { ok: false, error: invalid }
    const { supabase, user } = await assertCapability('manageContent')
    const gate = await gateAutoSchedule(supabase, user, input, null, approvalId ?? null)
    if (gate) return gate

    const { error } = await supabase
      .from('publish_plans')
      .insert({ ...rowFor(input), created_by: user.id })
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'plan:create', notes: input.name.trim() })
    revalidateLocalized('/admin/automations')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
  }
}

export async function updatePublishPlan(planId: string, input: PlanInput, approvalId?: string | null): Promise<PlanResult> {
  try {
    const invalid = validate(input)
    if (invalid) return { ok: false, error: invalid }
    const { supabase, user } = await assertCapability('manageContent')
    const gate = await gateAutoSchedule(supabase, user, input, planId, approvalId ?? null)
    if (gate) return gate

    const { error, count } = await supabase.from('publish_plans').update(rowFor(input), { count: 'exact' }).eq('id', planId)
    if (error) return { ok: false, error: error.message }
    if (!count) return { ok: false, error: 'Plan not found.' }
    await audit(supabase, user.id, { action: 'plan:update', entityId: planId, notes: input.name.trim() })
    revalidateLocalized('/admin/automations')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
  }
}

/** Re-enable a self-disabled plan (reset failure budget) or just flip enabled. */
export async function setPlanEnabled(planId: string, enabled: boolean): Promise<PlanResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    // Re-enabling resets the self-disable failure budget and fires the next
    // worker tick within a minute, so a fixed plan proves itself immediately.
    const patch = enabled
      ? { enabled: true, failure_count: 0, next_run_at: new Date(Date.now() + 60_000).toISOString() }
      : { enabled: false }
    const { error, count } = await supabase.from('publish_plans').update(patch, { count: 'exact' }).eq('id', planId)
    if (error) return { ok: false, error: error.message }
    if (!count) return { ok: false, error: 'Plan not found.' }
    await audit(supabase, user.id, { action: enabled ? 'plan:enable' : 'plan:disable', entityId: planId })
    revalidateLocalized('/admin/automations')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
  }
}

export async function deletePublishPlan(planId: string): Promise<PlanResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const { error, count } = await supabase.from('publish_plans').delete({ count: 'exact' }).eq('id', planId)
    if (error) return { ok: false, error: error.message }
    if (!count) return { ok: false, error: 'Plan not found.' }
    await audit(supabase, user.id, { action: 'plan:delete', entityId: planId })
    revalidateLocalized('/admin/automations')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
  }
}

/** Run every due plan right now (manual trigger of the cron's job, same runner). */
export async function runDuePlansNow(): Promise<PlanResult & { summary?: unknown }> {
  try {
    const { user } = await assertCapability('manageContent')
    const { runDuePublishPlans } = await import('@/lib/automation/publish-plans-run')
    const summary = await runDuePublishPlans()
    logger.info('admin/plans', 'manual plan run', { actorId: user.id, ...summary })
    revalidateLocalized('/admin/automations')
    return { ok: true, summary }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
  }
}
