'use server'

/**
 * Schedule management for the state ladder (spec §28). The states page
 * listed schedules read-only; these actions let the chief create, pause and
 * remove annual month/day windows.
 *
 * Supreme tier: `system.owner` is the gate (the page is chief-only too).
 * Every mutation lands in `audit_events` as `state.schedule_*` and
 * revalidates `/admin/states`. The `state-schedules` cron remains the only
 * runtime writer of `last_action`/`last_run_at`.
 */

import { assertCapability } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getStateBehavior, NORMAL_STATE_ID } from '@/lib/platform/state-engine'
import { auditEvent, fail, revalidateLocalized, type ActionResult } from './_shared'

/** The incident console owns these — a schedule must never light one. */
const OPERATIONAL_STATES = ['INCIDENT', 'CRITICAL']

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

function validMonthDay(month: number, day: number): boolean {
  return (
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= DAYS_IN_MONTH[month - 1]
  )
}

export type CreateScheduleInput = {
  stateId: string
  label: string
  startMonth: number
  startDay: number
  endMonth: number
  endDay: number
}

export async function createStateSchedule(input: CreateScheduleInput): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('system.owner')
    const stateId = input.stateId.trim().toUpperCase()
    const label = input.label.trim()
    if (!stateId) return { ok: false, error: 'A state is required.' }
    if (stateId === NORMAL_STATE_ID) {
      return { ok: false, error: 'Normal operations needs no schedule — clear the states that are lit.' }
    }
    if (OPERATIONAL_STATES.includes(stateId)) {
      return { ok: false, error: `${stateId} is incident-driven and cannot be scheduled.` }
    }
    if (!label || label.length > 120) {
      return { ok: false, error: 'A schedule label (max 120 characters) is required.' }
    }
    if (!validMonthDay(input.startMonth, input.startDay) || !validMonthDay(input.endMonth, input.endDay)) {
      return { ok: false, error: 'The window needs valid month/day dates.' }
    }

    const admin = createAdminClient()
    const { data: row, error: readError } = await admin
      .from('system_states')
      .select('id')
      .eq('id', stateId)
      .maybeSingle()
    if (readError) return { ok: false, error: readError.message }
    if (!row) return { ok: false, error: `Unknown system state: ${stateId}` }
    // The engine registry is the source of activation routes; the DB row
    // alone does not say whether a state may be scheduled.
    const behavior = getStateBehavior(stateId)
    if (behavior.activation.scheduled !== true) {
      return { ok: false, error: `${stateId} does not support scheduled activation.` }
    }

    const { error } = await admin.from('state_schedules').insert({
      state_id: stateId,
      label,
      start_month: input.startMonth,
      start_day: input.startDay,
      end_month: input.endMonth,
      end_day: input.endDay,
      enabled: true,
      created_by: ctx.user.id,
    })
    if (error) {
      // The unique window shape surfaces as a conflict, not a crash.
      if (error.message.includes('duplicate') || error.code === '23505') {
        return { ok: false, error: 'That exact window already exists for this state.' }
      }
      return { ok: false, error: error.message }
    }
    await auditEvent(ctx.user.id, {
      action: 'state.schedule_created',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'system_state',
      resourceId: stateId,
      metadata: {
        label,
        window: `${input.startMonth}/${input.startDay}–${input.endMonth}/${input.endDay}`,
      },
    })
    revalidateLocalized('/admin/states')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function setScheduleEnabled(id: string, enabled: boolean): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('system.owner')
    const admin = createAdminClient()
    const { data: row, error: readError } = await admin
      .from('state_schedules')
      .select('id, state_id, label')
      .eq('id', id)
      .maybeSingle()
    if (readError) return { ok: false, error: readError.message }
    if (!row) return { ok: false, error: 'Schedule not found.' }
    const { error } = await admin.from('state_schedules').update({ enabled }).eq('id', id)
    if (error) return { ok: false, error: error.message }
    await auditEvent(ctx.user.id, {
      action: enabled ? 'state.schedule_enabled' : 'state.schedule_disabled',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'system_state',
      resourceId: (row as { state_id: string }).state_id,
      metadata: { scheduleId: id, label: (row as { label: string }).label },
    })
    revalidateLocalized('/admin/states')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function deleteStateSchedule(id: string): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('system.owner')
    const admin = createAdminClient()
    const { data: row, error: readError } = await admin
      .from('state_schedules')
      .select('id, state_id, label, last_action')
      .eq('id', id)
      .maybeSingle()
    if (readError) return { ok: false, error: readError.message }
    if (!row) return { ok: false, error: 'Schedule not found.' }
    const typed = row as { state_id: string; label: string; last_action: string | null }
    if (typed.last_action === 'activated') {
      // This schedule lit the state and owns clearing it — deleting the
      // schedule first would orphan a live seasonal state.
      const { data: live } = await admin
        .from('system_states')
        .select('id')
        .eq('id', typed.state_id)
        .eq('active', true)
        .maybeSingle()
      if (live) {
        return {
          ok: false,
          error: `${typed.state_id} is still lit by this schedule — wait for the window to close or deactivate the state first.`,
        }
      }
    }
    const { error } = await admin.from('state_schedules').delete().eq('id', id)
    if (error) return { ok: false, error: error.message }
    await auditEvent(ctx.user.id, {
      action: 'state.schedule_deleted',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'system_state',
      resourceId: typed.state_id,
      metadata: { scheduleId: id, label: typed.label },
    })
    revalidateLocalized('/admin/states')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
