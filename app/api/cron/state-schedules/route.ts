import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger, generateCorrelationId } from '@/lib/observability/logger'
import { requireCronSecret } from '@/lib/security/cron-auth'
import { stampHeartbeat } from '@/lib/automation/heartbeat'
import { logStateEvent, setStateActive } from '@/lib/admin/state-writes'
import { isWithinWindow, type SeasonalWindow } from '@/lib/platform/seasonal-window'
import { getEffectiveState, resolveActiveStates, toSystemState } from '@/lib/platform/state-engine'
import { compileTemplatesForState } from '@/lib/content/templates-run'

export const dynamic = 'force-dynamic'

/**
 * Spec §28 — scheduled state activation. Runs daily at 00:00 UTC and evaluates
 * `state_schedules` (month/day windows, so they recur annually) against the
 * current date:
 *
 *   * inside the window  → activate the state, unless it is already live;
 *   * outside the window → deactivate it, but ONLY when this job is what lit it
 *     (`last_action = 'activated'`). An operator who activated the season by
 *     hand keeps it until they say otherwise; the schedule never silently
 *     reverts a human decision.
 *
 * `last_action`/`last_run_at` make a re-run a no-op, so overlapping or retried
 * runs cannot double-log. Service-role writes only — both tables are
 * SELECT-only under RLS. No two-person control: this is the spec §28
 * "scheduled" route, not a §44 critical-mode activation, and it cannot touch an
 * operational state (see the guard below).
 */

/** The incident console owns these (spec §26/§27) — a schedule must never light one. */
const OPERATIONAL_STATES = ['INCIDENT', 'CRITICAL']

type ScheduleRow = {
  id: string
  state_id: string
  label: string
  start_month: number
  start_day: number
  end_month: number
  end_day: number
  enabled: boolean
  last_action: string | null
}

type Transition = {
  scheduleId: string
  stateId: string
  label: string
  action: 'activated' | 'deactivated'
}

function toWindow(row: ScheduleRow): SeasonalWindow {
  return {
    startMonth: row.start_month,
    startDay: row.start_day,
    endMonth: row.end_month,
    endDay: row.end_day,
  }
}

/** Live states, so history records what each transition displaced. */
async function activeStates(admin: ReturnType<typeof createAdminClient>) {
  const { data } = await admin.from('system_states').select('*').eq('active', true)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toSystemState)
}

async function runStateSchedules(request: Request) {
  const startedAt = Date.now()
  const correlationId = generateCorrelationId()
  const denied = requireCronSecret(request, 'state-schedules', correlationId)
  if (denied) return denied

  try {
    const admin = createAdminClient()
    const now = new Date()

    const { data: scheduleData, error: scheduleError } = await admin
      .from('state_schedules')
      .select('*')
      .eq('enabled', true)
    if (scheduleError) throw new Error(scheduleError.message)
    const schedules = (scheduleData ?? []) as unknown as ScheduleRow[]

    const { data: stateData, error: stateError } = await admin
      .from('system_states')
      .select('*')
      .in(
        'id',
        schedules.map((row) => row.state_id),
      )
    if (stateError) throw new Error(stateError.message)
    const states = ((stateData ?? []) as unknown as Record<string, unknown>[]).map(toSystemState)
    const byId = new Map(states.map((state) => [state.id, state]))

    const transitions: Transition[] = []
    const skipped: string[] = []

    for (const schedule of schedules) {
      const state = byId.get(schedule.state_id)
      if (!state) {
        skipped.push(`${schedule.state_id}: no system_states row`)
        continue
      }
      if (OPERATIONAL_STATES.includes(state.id)) {
        skipped.push(`${schedule.state_id}: operational states are incident-driven`)
        continue
      }
      const inWindow = isWithinWindow(now, toWindow(schedule))
      // An expired activation is over even if `active` is still set — the
      // engine already ignores it, and this job is where the row catches up.
      const live = resolveActiveStates([state], now).length > 0

      if (inWindow && !live) {
        const previousState = getEffectiveState(await activeStates(admin))
        const written = await setStateActive(admin, state.id, true, null, { expiresAt: null })
        if (!written.ok) {
          skipped.push(`${state.id}: ${written.error}`)
          continue
        }
        await logStateEvent(admin, {
          stateId: state.id,
          action: 'activated',
          previousStateId: previousState.id,
          reason: `Scheduled: ${schedule.label}`,
          actorId: null,
        })
        transitions.push({
          scheduleId: schedule.id,
          stateId: state.id,
          label: schedule.label,
          action: 'activated',
        })

        // E6 — state-schedules compile hook: compile templates tagged with
        // this state_id. The cadence is inferred from today (daily) or if the
        // state activation is on a Monday (weekly). For simplicity we try both
        // and log results; template self-guards (cadence match) prevent double-
        // compilation. Best-effort so a template failure never breaks the
        // state transition.
        try {
          const dayOfWeek = new Date().getUTCDay()
          const cadences: ('daily' | 'weekly')[] = dayOfWeek === 1 ? ['daily', 'weekly'] : ['daily']
          for (const cadence of cadences) {
            const res = await compileTemplatesForState(state.id, cadence)
            if (res.compiled > 0) {
              logger.info('cron/state-schedules', 'state templates compiled', {
                stateId: state.id,
                cadence,
                compiled: res.compiled,
                drafted: res.drafted,
                errors: res.errors,
              })
            }
          }
        } catch (compileErr) {
          logger.warn('cron/state-schedules', 'state template compile failed', {
            stateId: state.id,
            error: compileErr instanceof Error ? compileErr.message : String(compileErr),
          })
        }
      } else if (!inWindow && state.active && schedule.last_action === 'activated') {
        const previousState = getEffectiveState(await activeStates(admin))
        const written = await setStateActive(admin, state.id, false, null)
        if (!written.ok) {
          skipped.push(`${state.id}: ${written.error}`)
          continue
        }
        await logStateEvent(admin, {
          stateId: state.id,
          action: 'deactivated',
          previousStateId: previousState.id,
          reason: `Schedule window closed: ${schedule.label}`,
          actorId: null,
        })
        transitions.push({
          scheduleId: schedule.id,
          stateId: state.id,
          label: schedule.label,
          action: 'deactivated',
        })
      }
    }

    for (const transition of transitions) {
      await admin
        .from('state_schedules')
        .update({
          last_action: transition.action,
          last_run_at: new Date().toISOString(),
        })
        .eq('id', transition.scheduleId)
    }

    const result = {
      ok: true,
      timestamp: now.toISOString(),
      durationMs: Date.now() - startedAt,
      correlationId,
      evaluated: schedules.length,
      transitions,
      skipped,
    }
    logger.info('cron/state-schedules', 'schedule evaluation complete', {
      correlationId,
      durationMs: result.durationMs,
      evaluated: result.evaluated,
      transitions: transitions.length,
    })
    return NextResponse.json(result)
  } catch (err) {
    logger.error('cron/state-schedules', 'schedule evaluation failed', {
      correlationId,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : 'State schedule job failed',
        correlationId,
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  return stampHeartbeat('state-schedules', runStateSchedules(request))
}

// Vercel Cron invokes scheduled jobs with GET — same auth semantics as POST.
export async function GET(request: Request) {
  return stampHeartbeat('state-schedules', runStateSchedules(request))
}
