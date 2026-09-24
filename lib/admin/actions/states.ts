'use server'

/**
 * Operational controls for the state ladder (plan Phase 4.2, spec §27/§28/§29).
 *
 * The incident console owns INCIDENT/CRITICAL — creating an incident lights
 * them and resolving the last one releases them, under two-person control for
 * critical mode (spec §44). A generic "activate state" button that could also
 * light critical mode would be a second door into the same transition with
 * weaker rules, so these actions refuse operational states and point at the
 * incident console instead.
 *
 * Everything else on the ladder (SEASONAL, BACK_TO_SCHOOL, HIGH_ACTIVITY,
 * MAINTENANCE, DEGRADED, RECOVERY) is operator/automation configuration:
 * `system.configure` is the gate, and every transition lands in
 * `system_state_events` plus `audit_events` (spec §19/§27).
 *
 * Deactivation restores the previous state for free: states are independent
 * flags, so clearing the top one re-exposes the next live state — or NORMAL —
 * through the same precedence resolver every surface already reads.
 */

import { assertCapability } from '@/lib/admin/auth'
import { getActiveIncident, getActiveStates } from '@/lib/admin/queries'
import { logStateEvent, setStateActive } from '@/lib/admin/state-writes'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  canActivateState,
  getEffectiveState,
  getStateBehavior,
  NORMAL_STATE_ID,
} from '@/lib/platform/state-engine'
import { auditEvent, fail, revalidateLocalized, type ActionResult } from './_shared'

/** States the incident console owns (spec §26/§27). */
const OPERATIONAL_STATES = ['INCIDENT', 'CRITICAL']

function normalizeStateId(stateId: string): string {
  return stateId.trim().toUpperCase()
}

/** A short human reason is what makes the history readable (spec §27). */
function reasonFor(reason: string | undefined, fallback: string): string {
  return reason?.trim() || fallback
}

function revalidateStateSurfaces() {
  revalidateLocalized('/admin/dashboard')
  revalidateLocalized('/admin/states')
}

export async function activateState(stateId: string, reason?: string): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('system.configure')
    const id = normalizeStateId(stateId)

    if (OPERATIONAL_STATES.includes(id)) {
      return {
        ok: false,
        error: `Activate ${id} from the incident console — an incident records who declared it and what it displaced.`,
      }
    }
    if (id === NORMAL_STATE_ID) {
      return {
        ok: false,
        error: 'Normal operations is not activated — clear the states that are lit.',
      }
    }
    const gate = canActivateState({ allowed: true, stateId: id })
    if (!gate.ok) return gate

    const admin = createAdminClient()
    const { data: row, error: readError } = await admin
      .from('system_states')
      .select('active')
      .eq('id', id)
      .maybeSingle()
    if (readError) return { ok: false, error: readError.message }
    if (!row) {
      return { ok: false, error: `Unknown system state: ${id}` }
    }
    if (row.active) {
      return { ok: false, error: `${id} is already active.` }
    }

    const previousState = getEffectiveState(await getActiveStates())
    const behavior = getStateBehavior(id)
    const expiresAt =
      behavior.defaultDurationHours && behavior.defaultDurationHours > 0
        ? new Date(Date.now() + behavior.defaultDurationHours * 3_600_000).toISOString()
        : null

    const written = await setStateActive(admin, id, true, ctx.user.id, { expiresAt })
    if (!written.ok) return written
    await logStateEvent(admin, {
      stateId: id,
      action: 'activated',
      previousStateId: previousState.id,
      reason: reasonFor(reason, 'Activated from operational controls'),
      actorId: ctx.user.id,
    })

    await auditEvent(ctx.user.id, {
      action: 'state.activated',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'system_state',
      resourceId: id,
      metadata: { previousState: previousState.id, expiresAt, form: 'operational_controls' },
    })
    revalidateStateSurfaces()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function deactivateState(stateId: string, reason?: string): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('system.configure')
    const id = normalizeStateId(stateId)

    if (id === NORMAL_STATE_ID) {
      return { ok: false, error: 'Normal operations cannot be deactivated.' }
    }
    if (OPERATIONAL_STATES.includes(id)) {
      return {
        ok: false,
        error: `Close the incident instead — ${id} is released when the last open incident is resolved.`,
      }
    }
    // An open incident outranks every manually activated state, so clearing one
    // while an incident runs would change nothing visible and mislead the log.
    if (await hasOpenIncident()) {
      return {
        ok: false,
        error: 'An incident is still open — resolve it before changing the state ladder.',
      }
    }

    const admin = createAdminClient()
    const { data: row, error: readError } = await admin
      .from('system_states')
      .select('active')
      .eq('id', id)
      .maybeSingle()
    if (readError) return { ok: false, error: readError.message }
    if (!row) return { ok: false, error: `Unknown system state: ${id}` }
    if (!row.active) return { ok: false, error: `${id} is not active.` }

    const previousState = getEffectiveState(await getActiveStates())
    const written = await setStateActive(admin, id, false, ctx.user.id)
    if (!written.ok) return written
    await logStateEvent(admin, {
      stateId: id,
      action: 'deactivated',
      previousStateId: previousState.id,
      reason: reasonFor(reason, 'Deactivated from operational controls'),
      actorId: ctx.user.id,
    })

    await auditEvent(ctx.user.id, {
      action: 'state.deactivated',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'system_state',
      resourceId: id,
      metadata: { previousState: previousState.id, form: 'operational_controls' },
    })
    revalidateStateSurfaces()
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** An open incident outranks the whole ladder, so a manual edit would be a no-op. */
async function hasOpenIncident(): Promise<boolean> {
  return (await getActiveIncident()) !== null
}
