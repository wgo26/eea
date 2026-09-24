import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { type Capability } from '@/lib/auth/capabilities'
import type { AppRole } from '@/lib/auth/types'
import { createAdminClient, type InsertOf } from '@/lib/supabase/admin'
import { getAdminRoles } from '@/lib/auth/roles'
import { effectiveCapabilities } from '@/lib/auth/admin-roles'
import { sendNotificationToRole } from '@/lib/admin/notification-writes'

/**
 * Two-person control (plan Phase 2.3, spec §44).
 *
 * "A single administrator must not be able to unilaterally perform highly
 * destructive or security-critical actions." The gated flow is:
 *
 *   1. the acting admin requests approval  → `requestTwoPersonApproval`
 *   2. a DIFFERENT admin holding the action's capability approves it
 *      (lib/admin/actions/approvals.ts)
 *   3. the acting admin re-runs the gated action with the approval id, which
 *      verifies it here (`checkApproval`) and marks it used AFTER the operation
 *      succeeds (`consumeApproval`) so an approval is single-use and cannot
 *      authorize a second attempt.
 *
 * Pending requests expire (`APPROVAL_TTL_HOURS`) and an approved request must be
 * executed within `APPROVAL_USE_HOURS` of the approval — an approval is never a
 * standing authorization. Approvals never carry secret material: `reason` is
 * operator prose, and audit metadata for these rows stays to ids and action
 * keys (spec §19).
 */

/** Spec §44 — the operations that demand a second signature. */
export const TWO_PERSON_ACTIONS = {
  'secret.revoke': {
    label: 'Production secret revocation',
    capability: 'secrets.revoke',
  },
  'incident.critical_mode': {
    label: 'Critical-mode activation',
    capability: 'incidents.manage',
  },
  'emergency.publish': {
    label: 'Emergency publishing',
    capability: 'manageContent',
  },
  'branding.publish': {
    label: 'Global branding changes',
    capability: 'branding.publish',
  },
  'data.destructive': {
    label: 'Destructive data operations',
    capability: 'system.configure',
  },
  'permissions.escalate': {
    label: 'Permission escalation',
    capability: 'manageUsers',
  },
  'auth.configure': {
    label: 'Authentication configuration changes',
    capability: 'system.configure',
  },
} as const satisfies Record<string, { label: string; capability: Capability }>

export type TwoPersonAction = keyof typeof TWO_PERSON_ACTIONS

export function isTwoPersonAction(value: string): value is TwoPersonAction {
  return value in TWO_PERSON_ACTIONS
}

/** Whether the given operation key requires a second administrator. */
export function isApprovalRequired(action: TwoPersonAction | string): boolean {
  return isTwoPersonAction(action)
}

export function twoPersonActionLabel(action: string): string {
  return isTwoPersonAction(action) ? TWO_PERSON_ACTIONS[action].label : action
}

export function twoPersonActionCapability(action: TwoPersonAction): Capability {
  return TWO_PERSON_ACTIONS[action].capability
}

/** Request window: how long a pending request may wait for a second admin. */
export const APPROVAL_TTL_HOURS = 24
/** Execution window after approval — approvals are not standing authorizations. */
export const APPROVAL_USE_HOURS = 2

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'consumed'

export type ApprovalRow = {
  id: string
  action: string
  actorId: string
  actorName: string | null
  resourceType: string
  resourceId: string | null
  reason: string | null
  approverId: string | null
  approverName: string | null
  status: ApprovalStatus
  createdAt: string
  expiresAt: string
  respondedAt: string | null
}

/** State of the request while it is still awaiting a second signature. */
export function isPendingUsable(row: Pick<ApprovalRow, 'status' | 'expiresAt'>): boolean {
  return row.status === 'pending' && Date.parse(row.expiresAt) > Date.now()
}

/** An approved request is usable for a bounded window after the approval. */
export function approvalUseDeadline(row: Pick<ApprovalRow, 'respondedAt'>): number | null {
  if (!row.respondedAt) return null
  const at = Date.parse(row.respondedAt)
  return Number.isNaN(at) ? null : at + APPROVAL_USE_HOURS * 3_600_000
}

function asName(value: unknown): string | null {
  const row = (Array.isArray(value) ? value[0] : value) as
    | { display_name: string | null; full_name: string | null }
    | null
    | undefined
  return row?.display_name ?? row?.full_name ?? null
}

export function toApprovalRow(row: Record<string, unknown>): ApprovalRow {
  return {
    id: row.id as string,
    action: row.action as string,
    actorId: row.actor_id as string,
    actorName: asName(row.actor),
    resourceType: row.resource_type as string,
    resourceId: (row.resource_id as string | null) ?? null,
    reason: (row.reason as string | null) ?? null,
    approverId: (row.approver_id as string | null) ?? null,
    approverName: asName(row.approver),
    status: (row.status as ApprovalStatus) ?? 'pending',
    createdAt: row.created_at as string,
    expiresAt: row.expires_at as string,
    respondedAt: (row.responded_at as string | null) ?? null,
  }
}

export const APPROVAL_COLUMNS = `id, action, actor_id, resource_type, resource_id, reason,
  approver_id, status, created_at, expires_at, responded_at,
  actor:profiles!two_person_approvals_actor_id_fkey(display_name, full_name),
  approver:profiles!two_person_approvals_approver_id_fkey(display_name, full_name)`

/**
 * Capabilities for the approvals surface: the legacy `app_role` layer plus the
 * `user_admin_roles` layer (Phase 2.1), so a `platform_admin` with no legacy
 * `admin` row still qualifies as an approver.
 */
export async function approverCapabilities(
  supabase: SupabaseClient,
  userId: string,
  roles: AppRole[],
): Promise<Set<Capability>> {
  return effectiveCapabilities(roles, await getAdminRoles(supabase, userId))
}

/* ------------------------------------------------------------------ */
/* Request                                                             */
/* ------------------------------------------------------------------ */

export type ApprovalRequest = {
  action: TwoPersonAction
  actorId: string
  resourceType: string
  resourceId?: string | null
  reason?: string | null
}

export type ApprovalRequestResult =
  | { ok: true; id: string; expiresAt: string; existing: boolean }
  | { ok: false; error: string }

/**
 * Creates (or reuses) the pending request for the caller. Re-running the
 * request while one is still pending returns that request instead of queueing a
 * duplicate — the approval queue should read as a list of distinct decisions.
 */
export async function requestTwoPersonApproval(
  input: ApprovalRequest,
): Promise<ApprovalRequestResult> {
  try {
    const admin = createAdminClient()
    const pending = admin
      .from('two_person_approvals')
      .select('id, expires_at')
      .eq('action', input.action)
      .eq('actor_id', input.actorId)
      .eq('resource_type', input.resourceType)
      .eq('status', 'pending')
      .gte('expires_at', new Date().toISOString())
    const { data: existing } = await (input.resourceId
      ? pending.eq('resource_id', input.resourceId)
      : pending.is('resource_id', null)
    )
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (existing) {
      return { ok: true, id: existing.id, expiresAt: existing.expires_at, existing: true }
    }

    const expiresAt = new Date(Date.now() + APPROVAL_TTL_HOURS * 3_600_000).toISOString()
    const { data, error } = await admin
      .from('two_person_approvals')
      .insert({
        action: input.action,
        actor_id: input.actorId,
        resource_type: input.resourceType,
        resource_id: input.resourceId ?? null,
        reason: input.reason?.trim() || null,
        status: 'pending',
        expires_at: expiresAt,
      } as InsertOf<'two_person_approvals'>)
      .select('id')
      .single()
    if (error || !data) return { ok: false, error: error?.message ?? 'Could not create the request.' }

    // §38 — a request awaiting a second signature is the canonical "Action
    // Required" notification. Best-effort: the approval row above is the
    // durable artifact; a failed courtesy copy must not fail the request.
    await sendNotificationToRole(
      admin,
      'admin',
      {
        source: 'approvals',
        category: 'action_required',
        title: 'Approval needed: ' + twoPersonActionLabel(input.action),
        body: input.reason?.trim() || undefined,
        linkPath: '/admin/approvals',
        expiresAt,
      },
      { excludeUserId: input.actorId },
    )
    return { ok: true, id: data.id, expiresAt, existing: false }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not create the request.' }
  }
}

/* ------------------------------------------------------------------ */
/* Verify / consume                                                    */
/* ------------------------------------------------------------------ */

export type ApprovalVerdict = { ok: true; row: ApprovalRow } | { ok: false; error: string }

function mismatch(row: ApprovalRow, input: ApprovalCheck): string | null {
  if (row.action !== input.action) return `This approval is for ${twoPersonActionLabel(row.action)}, not this action.`
  if (row.resourceType !== input.resourceType) return 'This approval is for a different kind of resource.'
  if ((row.resourceId ?? '') !== (input.resourceId ?? '')) return 'This approval is for a different resource.'
  if (row.actorId !== input.actorId) {
    return 'Only the administrator who requested the approval may carry out this action.'
  }
  return null
}

export type ApprovalCheck = {
  approvalId: string
  action: TwoPersonAction
  actorId: string
  resourceType: string
  resourceId?: string | null
}

/**
 * Read-only verification used by gated actions BEFORE they perform the
 * operation. The caller consumes the approval afterwards.
 */
export async function checkApproval(input: ApprovalCheck): Promise<ApprovalVerdict> {
  try {
    const { data, error } = await createAdminClient()
      .from('two_person_approvals')
      .select(APPROVAL_COLUMNS)
      .eq('id', input.approvalId)
      .maybeSingle()
    if (error || !data) return { ok: false, error: 'That approval request was not found.' }
    const row = toApprovalRow(data as unknown as Record<string, unknown>)

    const wrong = mismatch(row, input)
    if (wrong) return { ok: false, error: wrong }

    if (row.status === 'pending') {
      return {
        ok: false,
        error: Date.parse(row.expiresAt) > Date.now()
          ? 'This action is awaiting a second administrator’s approval.'
          : 'This approval request has expired — request a new one.',
      }
    }
    if (row.status === 'rejected') return { ok: false, error: 'This approval request was rejected.' }
    if (row.status === 'consumed') return { ok: false, error: 'This approval has already been used.' }
    if (row.status === 'expired') return { ok: false, error: 'This approval request has expired — request a new one.' }

    const deadline = approvalUseDeadline(row)
    if (!deadline || deadline < Date.now()) {
      return { ok: false, error: 'This approval was granted more than two hours ago — request a new one.' }
    }
    return { ok: true, row }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not verify the approval.' }
  }
}

/**
 * Single-use enforcement: called by the gated action only after the operation
 * succeeded, so a failed attempt leaves the approval available for a retry.
 */
export async function consumeApproval(approvalId: string): Promise<void> {
  try {
    await createAdminClient()
      .from('two_person_approvals')
      .update({ status: 'consumed' })
      .eq('id', approvalId)
      .eq('status', 'approved')
  } catch {
    /* Consumption is best-effort; the use window still bounds a replay. */
  }
}

/* ------------------------------------------------------------------ */
/* Respond                                                             */
/* ------------------------------------------------------------------ */

export type ApprovalResponseResult = { ok: true } | { ok: false; error: string }

async function respond(
  approvalId: string,
  actorId: string,
  status: 'approved' | 'rejected',
): Promise<ApprovalResponseResult & { row?: ApprovalRow }> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('two_person_approvals')
      .select(APPROVAL_COLUMNS)
      .eq('id', approvalId)
      .maybeSingle()
    if (error || !data) return { ok: false, error: 'Approval request not found.' }
    const row = toApprovalRow(data as unknown as Record<string, unknown>)

    if (row.actorId === actorId) {
      return { ok: false, error: 'A second administrator must approve this request — you raised it.' }
    }
    if (row.status !== 'pending') {
      return { ok: false, error: `This request is already ${row.status}.` }
    }
    if (Date.parse(row.expiresAt) < Date.now()) {
      return { ok: false, error: 'This request has expired — the requester must raise a new one.' }
    }

    const { error: writeError } = await admin
      .from('two_person_approvals')
      .update({
        status,
        approver_id: actorId,
        responded_at: new Date().toISOString(),
      })
      .eq('id', approvalId)
      .eq('status', 'pending')
    if (writeError) return { ok: false, error: writeError.message }
    return { ok: true, row: { ...row, status, approverId: actorId, respondedAt: new Date().toISOString() } }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not record the response.' }
  }
}

export async function approveTwoPersonApproval(
  approvalId: string,
  actorId: string,
): Promise<ApprovalResponseResult & { row?: ApprovalRow }> {
  return respond(approvalId, actorId, 'approved')
}

export async function rejectTwoPersonApproval(
  approvalId: string,
  actorId: string,
): Promise<ApprovalResponseResult & { row?: ApprovalRow }> {
  return respond(approvalId, actorId, 'rejected')
}
