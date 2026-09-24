'use server'

/**
 * Incident lifecycle (plan Phase 1.4, spec §26/§27/§39/§40).
 *
 * An incident is the human operator of the system-state engine: creating one
 * activates the operational state (INCIDENT, or CRITICAL for severity
 * `critical`) and closing the last open incident releases it, restoring the
 * state it displaced. Every mutation lands in `audit_events` (spec §19) and in
 * `incident_events` — the per-incident lifecycle log the detail page renders.
 *
 * Resolution has ONE door: `closeIncident` (the plan's `resolveIncident` is the
 * same transition, minus the state release — two entry points could resolve an
 * incident while leaving critical mode lit). Forward-only transitions are
 * enforced here so the timeline always reads top-to-bottom.
 *
 * Capability note: the plan names `system.configure` for this domain; Phase 1.2
 * shipped the finer-grained `incidents.manage` key (menu + layout deep links
 * already gate on it), so incident actions assert that, and additionally pass
 * the caller's `system.configure` check through `canActivateState` — state
 * activation stays a state-configuration privilege, not an incident one.
 *
 * All writes use the service-role client: every Phase 1/2 table is SELECT-only
 * under RLS, so the cookie-scoped client could never write.
 */

import { hasCapability } from '@/lib/auth/capabilities'
import { assertCapability, type AdminContext } from '@/lib/admin/auth'
import {
  checkApproval,
  consumeApproval,
  isApprovalRequired,
  requestTwoPersonApproval,
} from '@/lib/admin/two-person-control'
import {
  getActiveStates,
  normalizeIncidentStatus,
  type IncidentStatus,
} from '@/lib/admin/queries'
import {
  canActivateState,
  getEffectiveState,
  normalizeSeverity,
  NORMAL_STATE_ID,
  type StateSeverity,
} from '@/lib/platform/state-engine'
import { createAdminClient, type InsertOf, type UpdateOf } from '@/lib/supabase/admin'
import { logStateEvent, setStateActive } from '@/lib/admin/state-writes'
import { sendNotificationToRole } from '@/lib/admin/notification-writes'
import type { Json } from '@/lib/supabase/database.types'
import { auditEvent, fail, revalidateLocalized, type ActionResult } from './_shared'

/** Spec §39 — the lifecycle runs forward only. */
const LIFECYCLE: IncidentStatus[] = [
  'investigating',
  'identified',
  'mitigating',
  'monitoring',
  'resolved',
]

/** States an incident may hold while it is open (spec §27/§29). */
const OPERATIONAL_STATES = ['INCIDENT', 'CRITICAL']

export type IncidentInput = {
  title: string
  severity?: StateSeverity | null
  description?: string | null
  affectedServices?: string[]
  owner?: string | null
  publicStatusMessage?: string | null
  internalNotes?: string | null
  startTime?: string | null
}

export type IncidentUpdate = {
  title?: string
  severity?: StateSeverity
  description?: string | null
  affectedServices?: string[]
  owner?: string | null
  publicStatusMessage?: string | null
  internalNotes?: string | null
  /** Timeline entry text; the caller passes a localized string. */
  note?: string
}

export type CreateIncidentResult = { ok: true; id: string } | { ok: false; error: string }

type Admin = ReturnType<typeof createAdminClient>

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

function dbFail(error: { message: string } | null): { ok: false; error: string } {
  return { ok: false, error: error?.message ?? 'Operation failed.' }
}

async function actorLabel(admin: Admin, ctx: AdminContext): Promise<string | null> {
  const meta = ctx.user.user_metadata as { display_name?: string } | null
  if (meta?.display_name) return meta.display_name
  const { data } = await admin
    .from('profiles')
    .select('display_name, full_name')
    .eq('id', ctx.user.id)
    .maybeSingle()
  return data?.display_name ?? data?.full_name ?? ctx.user.email ?? null
}

function appendTimeline(existing: unknown, note: string, by: string | null): Json {
  const list = Array.isArray(existing) ? existing : []
  return [...list, { at: new Date().toISOString(), note, by }] as unknown as Json
}

async function loadIncident(
  admin: Admin,
  id: string,
): Promise<{ id: string; title: string; current_status: string | null; timeline: unknown } | null> {
  const { data } = await admin
    .from('incidents')
    .select('id, title, current_status, timeline')
    .eq('id', id)
    .maybeSingle()
  return data ?? null
}

/**
 * The state the open-incident chain displaced. Every activation (create or
 * escalate) copies the target forward onto its own event, so the latest
 * operational activation always carries the state a release must restore.
 */
async function chainRestoreTarget(admin: Admin): Promise<string | null> {
  const { data } = await admin
    .from('system_state_events')
    .select('previous_state_id')
    .in('state_id', OPERATIONAL_STATES)
    .in('action', ['activated', 'escalated'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.previous_state_id ?? null
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

export async function createIncident(input: IncidentInput): Promise<CreateIncidentResult> {
  try {
    const ctx = await assertCapability('incidents.manage')
    const title = input.title?.trim()
    if (!title) return { ok: false, error: 'A title is required.' }

    const severity = normalizeSeverity(input.severity)
    const targetState = severity === 'critical' ? 'CRITICAL' : 'INCIDENT'
    const gate = canActivateState({
      allowed: hasCapability(ctx.roles, 'system.configure'),
      stateId: targetState,
      hasActiveIncident: true,
    })
    if (!gate.ok) return gate

    const admin = createAdminClient()
    const by = await actorLabel(admin, ctx)
    const now = new Date().toISOString()
    const { data, error } = await admin
      .from('incidents')
      .insert({
        title,
        severity,
        description: input.description?.trim() || null,
        affected_services: input.affectedServices ?? [],
        start_time: input.startTime || now,
        current_status: 'investigating',
        incident_owner: input.owner?.trim() || null,
        public_status_message: input.publicStatusMessage?.trim() || null,
        internal_notes: input.internalNotes?.trim() || null,
        timeline: [{ at: now, note: 'Incident created', by }] as unknown as Json,
        created_by: ctx.user.id,
      } as InsertOf<'incidents'>)
      .select('id')
      .single()
    if (error || !data) return dbFail(error)

    // Remember what the incident displaced so closeIncident can restore it.
    const previousState = getEffectiveState(await getActiveStates())
    const displaced = OPERATIONAL_STATES.includes(previousState.id)
      ? (await chainRestoreTarget(admin)) ?? NORMAL_STATE_ID
      : previousState.id === targetState
        ? null
        : previousState.id
    await setStateActive(admin, targetState, true, ctx.user.id)
    await logStateEvent(admin, {
      stateId: targetState,
      action: 'activated',
      previousStateId: displaced,
      reason: title,
      actorId: ctx.user.id,
    })
    await admin.from('incident_events').insert({
      incident_id: data.id,
      from_status: null,
      to_status: 'investigating',
      note: 'Incident created',
      actor_id: ctx.user.id,
    } as InsertOf<'incident_events'>)

    await auditEvent(ctx.user.id, {
      action: 'incident.created',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'incident',
      resourceId: data.id,
      metadata: { severity, state: targetState, restoredTo: displaced },
    })
    // §38 — an open incident is exactly the "unexpected operational situation"
    // the critical/warning categories exist for. Best-effort courtesy copy: the
    // incident row and the audit entry above are the durable record.
    await sendNotificationToRole(
      admin,
      'admin',
      {
        source: 'incidents',
        category: severity === 'critical' ? 'critical' : 'warning',
        title: `Incident: ${title}`,
        body: input.description?.trim() || undefined,
        linkPath: '/admin/incidents',
      },
      { excludeUserId: ctx.user.id },
    )
    revalidateLocalized('/admin/incidents')
    revalidateLocalized('/admin/dashboard')
    return { ok: true, id: data.id }
  } catch (e) {
    return fail(e)
  }
}

export async function updateIncident(id: string, updates: IncidentUpdate): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('incidents.manage')
    const admin = createAdminClient()
    const current = await loadIncident(admin, id)
    if (!current) return { ok: false, error: 'Incident not found.' }

    const patch: UpdateOf<'incidents'> = { updated_at: new Date().toISOString() }
    const changed: string[] = []

    if (updates.title !== undefined) {
      const title = updates.title.trim()
      if (!title) return { ok: false, error: 'A title is required.' }
      patch.title = title
      changed.push('title')
    }
    if (updates.severity !== undefined) {
      patch.severity = normalizeSeverity(updates.severity)
      changed.push('severity')
    }
    if (updates.description !== undefined) {
      patch.description = updates.description?.trim() || null
      changed.push('description')
    }
    if (updates.affectedServices !== undefined) {
      patch.affected_services = updates.affectedServices
      changed.push('affected services')
    }
    if (updates.owner !== undefined) {
      patch.incident_owner = updates.owner?.trim() || null
      changed.push('owner')
    }
    if (updates.publicStatusMessage !== undefined) {
      patch.public_status_message = updates.publicStatusMessage?.trim() || null
      changed.push('public status message')
    }
    if (updates.internalNotes !== undefined) {
      patch.internal_notes = updates.internalNotes?.trim() || null
      changed.push('internal notes')
    }
    if (changed.length === 0) return { ok: false, error: 'Nothing to update.' }

    const by = await actorLabel(admin, ctx)
    patch.timeline = appendTimeline(
      current.timeline,
      updates.note?.trim() || `Details updated (${changed.join(', ')})`,
      by,
    )

    const { error } = await admin.from('incidents').update(patch).eq('id', id)
    if (error) return dbFail(error)

    await auditEvent(ctx.user.id, {
      action: 'incident.updated',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'incident',
      resourceId: id,
      metadata: { fields: changed },
    })
    revalidateLocalized('/admin/incidents')
    revalidateLocalized(`/admin/incidents/${id}`)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Advance the lifecycle. Resolution goes through `closeIncident`, never here. */
export async function transitionIncident(
  id: string,
  toStatus: IncidentStatus,
  note?: string,
): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('incidents.manage')
    if (!LIFECYCLE.includes(toStatus)) {
      return { ok: false, error: `Unknown incident status: ${toStatus}` }
    }
    if (toStatus === 'resolved') {
      return {
        ok: false,
        error: 'Resolve an incident from the status controls — it also releases the operational state.',
      }
    }

    const admin = createAdminClient()
    const current = await loadIncident(admin, id)
    if (!current) return { ok: false, error: 'Incident not found.' }
    const from = normalizeIncidentStatus(current.current_status)
    if (from === toStatus) return { ok: false, error: `This incident is already ${toStatus}.` }
    if (from === 'resolved') {
      return { ok: false, error: 'This incident is resolved — the lifecycle does not reopen.' }
    }
    if (LIFECYCLE.indexOf(toStatus) < LIFECYCLE.indexOf(from)) {
      return { ok: false, error: `Incidents move forward (${LIFECYCLE.join(' → ')}).` }
    }

    const by = await actorLabel(admin, ctx)
    const { error } = await admin
      .from('incidents')
      .update({
        current_status: toStatus,
        updated_at: new Date().toISOString(),
        timeline: appendTimeline(current.timeline, note?.trim() || `Status: ${from} → ${toStatus}`, by),
      } as UpdateOf<'incidents'>)
      .eq('id', id)
    if (error) return dbFail(error)

    await admin.from('incident_events').insert({
      incident_id: id,
      from_status: from,
      to_status: toStatus,
      note: note?.trim() || null,
      actor_id: ctx.user.id,
    } as InsertOf<'incident_events'>)

    await auditEvent(ctx.user.id, {
      action: 'incident.status_changed',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'incident',
      resourceId: id,
      fromStatus: from,
      toStatus,
    })
    revalidateLocalized('/admin/incidents')
    revalidateLocalized(`/admin/incidents/${id}`)
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Resolve the incident and release critical/incident mode (spec §27, §39). */
export async function closeIncident(id: string, resolution?: string): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('incidents.manage')
    const admin = createAdminClient()
    const current = await loadIncident(admin, id)
    if (!current) return { ok: false, error: 'Incident not found.' }
    const from = normalizeIncidentStatus(current.current_status)
    if (from === 'resolved') return { ok: false, error: 'This incident is already resolved.' }

    const by = await actorLabel(admin, ctx)
    const now = new Date().toISOString()
    const note = resolution?.trim() || 'Incident resolved'
    const { error } = await admin
      .from('incidents')
      .update({
        current_status: 'resolved',
        resolution_notes: resolution?.trim() || null,
        resolved_at: now,
        updated_at: now,
        timeline: appendTimeline(current.timeline, note, by),
      } as UpdateOf<'incidents'>)
      .eq('id', id)
    if (error) return dbFail(error)

    await admin.from('incident_events').insert({
      incident_id: id,
      from_status: from,
      to_status: 'resolved',
      note,
      actor_id: ctx.user.id,
    } as InsertOf<'incident_events'>)

    // Another open incident keeps the operational state lit — only the last
    // resolution releases it, restoring whatever the incident chain displaced.
    const { count } = await admin
      .from('incidents')
      .select('id', { count: 'exact', head: true })
      .neq('current_status', 'resolved')

    let wasLit: string | null = null
    let restoredState: string | null = null
    if (!count) {
      wasLit = getEffectiveState(await getActiveStates()).id
      const restoreTarget = (await chainRestoreTarget(admin)) ?? NORMAL_STATE_ID
      if (wasLit !== restoreTarget) {
        // An escalated chain lit INCIDENT *and* CRITICAL; clear both.
        for (const stateId of OPERATIONAL_STATES.filter((s) => s !== restoreTarget)) {
          await setStateActive(admin, stateId, false, ctx.user.id)
        }
        await setStateActive(admin, restoreTarget, true, ctx.user.id)
        restoredState = restoreTarget
        await logStateEvent(admin, {
          stateId: restoreTarget,
          action: 'restored',
          previousStateId: wasLit,
          reason: `${current.title} resolved`,
          actorId: ctx.user.id,
        })
      }
    }

    await auditEvent(ctx.user.id, {
      action: 'incident.resolved',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'incident',
      resourceId: id,
      fromStatus: from,
      toStatus: 'resolved',
      metadata: { releasedState: wasLit, restoredState },
    })
    revalidateLocalized('/admin/incidents')
    revalidateLocalized(`/admin/incidents/${id}`)
    revalidateLocalized('/admin/dashboard')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/* ------------------------------------------------------------------ */
/* Critical mode (two-person controlled, spec §27/§44)                 */
/* ------------------------------------------------------------------ */

export type CriticalModeRequestResult =
  | { ok: true; approvalId: string; existing: boolean }
  | { ok: false; error: string }

/**
 * Step 1 of the §44 flow for critical-mode activation: one admin raises the
 * request, a second approves it, then `activateCriticalMode` runs with the
 * approval id. Raising the request checks the same authorization the
 * activation does.
 */
export async function requestCriticalModeApproval(
  id: string,
  note?: string,
): Promise<CriticalModeRequestResult> {
  try {
    const ctx = await assertCapability('incidents.manage')
    const admin = createAdminClient()
    const current = await loadIncident(admin, id)
    if (!current) return { ok: false, error: 'Incident not found.' }
    if (normalizeIncidentStatus(current.current_status) === 'resolved') {
      return { ok: false, error: 'This incident is resolved — critical mode stays off.' }
    }

    const approval = await requestTwoPersonApproval({
      action: 'incident.critical_mode',
      actorId: ctx.user.id,
      resourceType: 'incident',
      resourceId: id,
      reason: note?.trim() || null,
    })
    if (!approval.ok) return approval

    if (!approval.existing) {
      await auditEvent(ctx.user.id, {
        action: 'approval.requested',
        actorRole: ctx.roles.join(',') || null,
        resourceType: 'incident',
        resourceId: id,
        metadata: {
          approvalId: approval.id,
          requestedAction: 'incident.critical_mode',
          reason: note?.trim() || null,
          expiresAt: approval.expiresAt,
        },
      })
    }
    revalidateLocalized('/admin/approvals')
    revalidateLocalized(`/admin/incidents/${id}`)
    return { ok: true, approvalId: approval.id, existing: approval.existing }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Escalate an open incident to critical mode (spec §27). Gated by two-person
 * control (spec §44): without an approved request from a second administrator
 * this fails, and a failed attempt never consumes the approval.
 */
export async function activateCriticalMode(
  id: string,
  note?: string,
  approvalId?: string | null,
): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('incidents.manage')
    const approval = approvalId?.trim() || null
    if (isApprovalRequired('incident.critical_mode')) {
      if (!approval) {
        return {
          ok: false,
          error: 'Activating critical mode needs a second administrator’s approval — request one first.',
        }
      }
      const verdict = await checkApproval({
        approvalId: approval,
        action: 'incident.critical_mode',
        actorId: ctx.user.id,
        resourceType: 'incident',
        resourceId: id,
      })
      if (!verdict.ok) return verdict
    }

    const gate = canActivateState({
      allowed: hasCapability(ctx.roles, 'system.configure'),
      stateId: 'CRITICAL',
      hasActiveIncident: true,
    })
    if (!gate.ok) return gate

    const admin = createAdminClient()
    const current = await loadIncident(admin, id)
    if (!current) return { ok: false, error: 'Incident not found.' }
    if (normalizeIncidentStatus(current.current_status) === 'resolved') {
      return { ok: false, error: 'This incident is resolved — critical mode stays off.' }
    }

    const previousState = getEffectiveState(await getActiveStates())
    if (previousState.id === 'CRITICAL') {
      return { ok: false, error: 'Critical mode is already active.' }
    }
    // Escalating inside an existing chain must not lose the chain's restore
    // target (the difference between "release back to NORMAL" and "back to the
    // seasonal mode that was running before the incident").
    const displaced = OPERATIONAL_STATES.includes(previousState.id)
      ? (await chainRestoreTarget(admin)) ?? NORMAL_STATE_ID
      : previousState.id

    const by = await actorLabel(admin, ctx)
    const now = new Date().toISOString()
    const { error } = await admin
      .from('incidents')
      .update({
        severity: 'critical',
        updated_at: now,
        timeline: appendTimeline(
          current.timeline,
          note?.trim() || `Critical mode activated (was ${previousState.id})`,
          by,
        ),
      } as UpdateOf<'incidents'>)
      .eq('id', id)
    if (error) return dbFail(error)

    await setStateActive(admin, 'CRITICAL', true, ctx.user.id)
    await logStateEvent(admin, {
      stateId: 'CRITICAL',
      action: 'escalated',
      previousStateId: displaced,
      reason: current.title,
      actorId: ctx.user.id,
    })
    // The escalation landed — spend the approval only now, so a failed attempt
    // leaves it usable (spec §44).
    if (approval) await consumeApproval(approval)

    await auditEvent(ctx.user.id, {
      action: 'incident.critical_mode_activated',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'incident',
      resourceId: id,
      metadata: { previousState: previousState.id, restoredTo: displaced, approvalId: approval },
    })
    revalidateLocalized('/admin/incidents')
    revalidateLocalized(`/admin/incidents/${id}`)
    revalidateLocalized('/admin/dashboard')
    revalidateLocalized('/admin/approvals')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
