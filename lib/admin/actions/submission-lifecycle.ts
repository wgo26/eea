'use server'

/**
 * Submission lifecycle enhancement (plan Phase 5.2, spec §4–§5).
 *
 * The six-state pipeline RECEIVED → AUTOMATED CHECKS → EDITORIAL REVIEW →
 * (REQUEST CHANGES | REJECT | ESCALATE | APPROVE) → SCHEDULE → PUBLISH is
 * recorded in `submission_reviews` (every transition, automated or
 * editorial) and `submission_escalations` (open assignments with resolution).
 * The existing moderation actions stay the approval mechanism; these actions
 * add the routing layer around them: escalation, automated pre-checks and
 * explicit editor assignment.
 *
 * Every mutation lands in `moderation_log` (content-pipeline trail) and
 * `audit_events` (system trail, spec §19).
 */

import { assertCapability } from '@/lib/admin/auth'
import { createAdminClient, type UpdateOf } from '@/lib/supabase/admin'
import {
  audit,
  auditEvent,
  fail,
  revalidateLocalized,
  type ActionResult,
} from './_shared'

export type SubmissionLifecycleResult = { ok: true } | { ok: false; error: string }

/** Statuses an open submission may be routed from (spec §4). */
const ROUTABLE = new Set(['pending', 'in_review', 'needs_clarification'])

/** Lightweight safety scan vocabulary for the automated check (spec §5). */
const FLAG_WORDS = ['scam', 'ponzi', 'get-rich-quick', 'click here to win', 'send money first']

function extractTitle(payload: unknown): string {
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const t = (payload as Record<string, unknown>).title
    if (typeof t === 'string') return t
  }
  return ''
}

async function logReview(
  admin: ReturnType<typeof createAdminClient>,
  actorId: string,
  submissionId: string,
  statusFrom: string | null,
  statusTo: string,
  reviewType: 'automated' | 'editorial',
  notes: string | null,
): Promise<void> {
  await admin.from('submission_reviews').insert({
    submission_id: submissionId,
    reviewer_id: reviewType === 'editorial' ? actorId : null,
    status_from: statusFrom,
    status_to: statusTo,
    notes,
    review_type: reviewType,
  })
}

/**
 * Spec §4 ESCALATE: move a submission to editorial review with an escalation
 * flag — records the review transition, opens the escalation assignment and
 * routes `assigned_editor_id` when a target editor is given.
 */
export async function escalateSubmission(
  submissionId: string,
  reason: string,
  assignedTo?: string | null,
): Promise<SubmissionLifecycleResult> {
  try {
    const ctx = await assertCapability('moderate')
    const clean = reason.trim().slice(0, 1000)
    if (!clean) return { ok: false, error: 'An escalation reason is required.' }
    const admin = createAdminClient()

    const { data: sub } = await admin
      .from('submissions')
      .select('id, status')
      .eq('id', submissionId)
      .maybeSingle()
    if (!sub) return { ok: false, error: 'Submission not found.' }
    const from = (sub as { status: string }).status
    if (!ROUTABLE.has(from)) return { ok: false, error: `Submission is ${from} and cannot be escalated.` }

    const patch: Record<string, unknown> = { status: 'in_review' }
    if (assignedTo) patch.assigned_editor_id = assignedTo
    const { error } = await admin
      .from('submissions')
      .update(patch as UpdateOf<'submissions'>)
      .eq('id', submissionId)
    if (error) return { ok: false, error: error.message }

    await admin.from('submission_escalations').insert({
      submission_id: submissionId,
      reason: clean,
      escalated_by: ctx.user.id,
      assigned_to: assignedTo ?? null,
    })
    await logReview(admin, ctx.user.id, submissionId, from, 'in_review', 'editorial', `Escalated: ${clean}`)

    await audit(admin, ctx.user.id, {
      action: 'escalate',
      submissionId,
      fromStatus: from,
      toStatus: 'in_review',
      notes: clean,
    })
    await auditEvent(ctx.user.id, {
      action: 'submission.escalated',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'submission',
      resourceId: submissionId,
      metadata: { from: from, assignedTo: assignedTo ?? null },
    })
    revalidateLocalized('/admin/moderation')
    revalidateLocalized('/admin/moderation/[id]')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Spec §4 AUTOMATED CHECKS + spec §5 suspicious-submission flagging:
 * duplicate detection (same type, overlapping title, still open) and a
 * lightweight content-safety scan. Records an `automated` review row and, on
 * flags, routes the submission to `in_review` so an editor must clear it.
 */
export async function autoCheckSubmission(
  submissionId: string,
): Promise<{ ok: true; flags: string[] } | { ok: false; error: string }> {
  try {
    const ctx = await assertCapability('moderate')
    const admin = createAdminClient()

    const { data: sub } = await admin
      .from('submissions')
      .select('id, submission_type, status, payload')
      .eq('id', submissionId)
      .maybeSingle()
    if (!sub) return { ok: false, error: 'Submission not found.' }
    const row = sub as { id: string; submission_type: string; status: string; payload: unknown }
    const flags: string[] = []

    const title = extractTitle(row.payload).toLowerCase()
    if (title.length >= 12) {
      const { data: siblings } = await admin
        .from('submissions')
        .select('id, payload')
        .eq('submission_type', row.submission_type)
        .in('status', ['pending', 'in_review', 'needs_clarification'])
        .neq('id', submissionId)
        .limit(50)
      const needle = title.split(/\s+/).filter((w) => w.length > 4).slice(0, 6)
      const dupes = ((siblings ?? []) as { id: string; payload: unknown }[]).filter((s) => {
        const other = extractTitle(s.payload).toLowerCase()
        return needle.length > 0 && needle.filter((w) => other.includes(w)).length >= Math.min(3, needle.length)
      })
      if (dupes.length > 0) flags.push(`possible_duplicate:${dupes.length}`)
    }

    const haystack = `${title} ${JSON.stringify(row.payload ?? '').slice(0, 4000)}`.toLowerCase()
    if (FLAG_WORDS.some((w) => haystack.includes(w))) flags.push('safety_keywords')

    const note = flags.length === 0 ? 'Automated checks passed.' : `Automated checks flagged: ${flags.join(', ')}.`
    await logReview(admin, ctx.user.id, submissionId, row.status, flags.length === 0 ? row.status : 'in_review', 'automated', note)
    if (flags.length > 0 && row.status !== 'in_review') {
      await admin.from('submissions').update({ status: 'in_review' } as UpdateOf<'submissions'>).eq('id', submissionId)
    }

    await audit(admin, ctx.user.id, {
      action: 'auto_check',
      submissionId,
      fromStatus: row.status,
      toStatus: flags.length === 0 ? row.status : 'in_review',
      notes: note,
    })
    await auditEvent(ctx.user.id, {
      action: 'submission.auto_checked',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'submission',
      resourceId: submissionId,
      metadata: { flags },
    })
    revalidateLocalized('/admin/moderation')
    return { ok: true, flags }
  } catch (e) {
    return fail(e)
  }
}

/** Route a submission to a specific editor without changing its status. */
export async function assignEditor(
  submissionId: string,
  editorId: string,
): Promise<SubmissionLifecycleResult> {
  try {
    const ctx = await assertCapability('moderate')
    if (!editorId) return { ok: false, error: 'An editor is required.' }
    const admin = createAdminClient()

    const { data: sub } = await admin
      .from('submissions')
      .select('id, status')
      .eq('id', submissionId)
      .maybeSingle()
    if (!sub) return { ok: false, error: 'Submission not found.' }
    const from = (sub as { status: string }).status

    const { error } = await admin
      .from('submissions')
      .update({ assigned_editor_id: editorId } as UpdateOf<'submissions'>)
      .eq('id', submissionId)
    if (error) return { ok: false, error: error.message }

    await logReview(admin, ctx.user.id, submissionId, from, from, 'editorial', `Assigned to editor ${editorId}.`)
    await audit(admin, ctx.user.id, {
      action: 'assign_editor',
      submissionId,
      fromStatus: from,
      toStatus: from,
      notes: editorId,
    })
    await auditEvent(ctx.user.id, {
      action: 'submission.editor_assigned',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'submission',
      resourceId: submissionId,
      metadata: { editorId },
    })
    revalidateLocalized('/admin/moderation')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/** Close an open escalation once the assigned work is resolved. */
export async function resolveEscalation(escalationId: string): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('moderate')
    const admin = createAdminClient()
    const { data } = await admin
      .from('submission_escalations')
      .select('id, submission_id, resolved_at')
      .eq('id', escalationId)
      .maybeSingle()
    if (!data) return { ok: false, error: 'Escalation not found.' }
    if ((data as { resolved_at: string | null }).resolved_at) return { ok: false, error: 'Escalation is already resolved.' }
    const { error } = await admin
      .from('submission_escalations')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', escalationId)
    if (error) return { ok: false, error: error.message }
    await auditEvent(ctx.user.id, {
      action: 'submission.escalation_resolved',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'submission_escalation',
      resourceId: escalationId,
      metadata: { submissionId: (data as { submission_id: string }).submission_id },
    })
    revalidateLocalized('/admin/moderation')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
