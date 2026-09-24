'use server'

/**
 * Two-person approval decisions (plan Phase 2.3, spec §44).
 *
 * The approving administrator must hold the capability the gated action
 * requires — the queue is not a way to hand out authority you do not have —
 * and must not be the requester. Approval only authorizes the requester to run
 * the action once, inside `APPROVAL_USE_HOURS`; it never performs the action
 * itself (see lib/admin/two-person-control.ts for the full flow).
 *
 * The read side lives here too (`getApprovalState`) so the revocation panels
 * have one import for the whole approval surface.
 */

import { assertStaff } from '@/lib/admin/auth'
import {
  approverCapabilities,
  approveTwoPersonApproval,
  isTwoPersonAction,
  rejectTwoPersonApproval,
  twoPersonActionCapability,
} from '@/lib/admin/two-person-control'
import { getApprovalById, getApprovalForResource } from '@/lib/admin/queries/approvals'
import type { ApprovalListRow } from '@/lib/admin/queries/approvals'
import { auditEvent, fail, revalidateLocalized, type ActionResult } from './_shared'

/* ------------------------------------------------------------------ */
/* Decide                                                              */
/* ------------------------------------------------------------------ */

async function respond(
  approvalId: string,
  decision: 'approved' | 'rejected',
): Promise<ActionResult> {
  try {
    const ctx = await assertStaff()
    const row = await getApprovalById(approvalId)
    if (!row) return { ok: false, error: 'That approval request was not found.' }
    if (row.actorId === ctx.user.id) {
      return { ok: false, error: 'A second administrator must decide this request — you raised it.' }
    }
    if (!isTwoPersonAction(row.action)) {
      return { ok: false, error: 'This request is not for a two-person controlled action.' }
    }

    const caps = await approverCapabilities(ctx.supabase, ctx.user.id, ctx.roles)
    if (!caps.has(twoPersonActionCapability(row.action))) {
      return {
        ok: false,
        error: 'Deciding this request needs the capability the action itself requires.',
      }
    }

    const result =
      decision === 'approved'
        ? await approveTwoPersonApproval(approvalId, ctx.user.id)
        : await rejectTwoPersonApproval(approvalId, ctx.user.id)
    if (!result.ok) return result

    await auditEvent(ctx.user.id, {
      action: decision === 'approved' ? 'approval.approved' : 'approval.rejected',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'approval',
      resourceId: approvalId,
      // Spec §19 — ids and action keys only, never secret material.
      metadata: {
        gatedAction: row.action,
        targetResourceType: row.resourceType,
        targetResourceId: row.resourceId,
        requestedBy: row.actorId,
      },
    })
    revalidateLocalized('/admin/approvals')
    if (row.resourceType === 'api_credential' && row.resourceId) {
      revalidateLocalized(`/admin/secrets/${row.resourceId}`)
    }
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function approveApproval(approvalId: string): Promise<ActionResult> {
  return respond(approvalId, 'approved')
}

export async function rejectApproval(approvalId: string): Promise<ActionResult> {
  return respond(approvalId, 'rejected')
}

/* ------------------------------------------------------------------ */
/* Read                                                                */
/* ------------------------------------------------------------------ */

/**
 * The calling admin's own live request for a resource — the secrets revocation
 * panel renders its "awaiting a second signature" / "approved, revoke now"
 * states from this. Other admins' requests for the same resource are surfaced
 * by the queue page instead, so this never becomes a second queue.
 */
export async function getApprovalState(
  action: string,
  resourceType: string,
  resourceId: string | null | undefined,
): Promise<ApprovalListRow | null> {
  try {
    const ctx = await assertStaff()
    return await getApprovalForResource(action, resourceType, resourceId, ctx.user.id)
  } catch {
    return null
  }
}
