'use server'

import { assertStaff, assertAdmin, assertCapability } from '@/lib/admin/auth'
import { validateContentDraft, type ContentDraftInput } from '../content-validation'
import { type UpdateOf } from '@/lib/supabase/admin'
import { enqueueUser, enqueueStaff, submissionNotifyTarget } from '@/lib/notify/queue'
import { type ActionResult, audit, auditBulkOperation, fail, revalidateLocalized, revalidatePublicContentCache, SUBMISSION_TO_CONTENT, uniqueSlug, syncPhotos, upsertTranslations } from './_shared'
import { deleteReport, resolveReport } from './safety'

/**
 * Legacy quick-approve kept for the queue list + review-screen buttons: marks
 * the submission approved without building a content item (the Phase 3
 * approve-with-content drawer handles the full publish path). Notes are only
 * overwritten when explicitly passed, so approving never wipes a teammate's
 * saved internal notes.
 */
export async function approveSubmission(submissionId: string, notes?: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('moderate')
    const now = new Date().toISOString()

    const { data: sub } = await supabase
      .from('submissions')
      .select('id, status')
      .eq('id', submissionId)
      .single()

    if (!sub) return { ok: false, error: 'Submission not found.' }
    if (!['pending', 'in_review', 'needs_clarification'].includes(sub.status)) {
      return { ok: false, error: `Submission is ${sub.status} and cannot be approved.` }
    }

    const patch: Record<string, unknown> = { status: 'approved', reviewed_at: now, reviewed_by: user.id }
    if (notes !== undefined) patch.internal_notes = notes
    const { error } = await supabase.from('submissions').update(patch as UpdateOf<'submissions'>).eq('id', submissionId)
    if (error) return { ok: false, error: error.message }

    await supabase.from('moderation_log').insert({
      action: 'approve', to_status: 'approved', notes: notes ?? null,
      submission_id: submissionId, actor_id: user.id,
    })

    revalidateLocalized('/admin/moderation')
    revalidateLocalized('/admin/moderation/[id]')
    void submissionNotifyTarget(supabase, submissionId).then((t) =>
      enqueueUser('submission.approved', t.userId, { title: t.title }, '/account/submissions'),
    )
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Approve a submission AND create the real content item in one step (Phase 3
 * core loop): bilingual translations, photos as media_assets, location /
 * category / verification, the listing/notice extension row, and the publish
 * mode (now / scheduled / draft). Replaces the old bare-row approve that
 * left approved submissions unpublishable.
 */
export async function approveSubmissionWithContent(input: {
  submissionId: string
  draft: ContentDraftInput
  publish: 'now' | 'schedule' | 'draft'
  scheduledFor?: string
  expiresAt?: string | null
  notes?: string
}): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('moderate')
    const now = new Date().toISOString()

    const { data: sub } = await supabase
      .from('submissions')
      .select('id, submission_type, status, content_item_id, submitted_by')
      .eq('id', input.submissionId)
      .single()
    if (!sub) return { ok: false, error: 'Submission not found.' }
    if (sub.content_item_id) {
      return { ok: false, error: 'This submission already has a content item — use the edit drawer on it instead.' }
    }
    if (!['pending', 'in_review', 'needs_clarification'].includes(sub.status)) {
      return { ok: false, error: `Submission is ${sub.status} and cannot be approved.` }
    }

    const contentType = SUBMISSION_TO_CONTENT[sub.submission_type]
    if (!contentType) return { ok: false, error: `Unknown submission type ${sub.submission_type}.` }

    const validationError = validateContentDraft(input.draft, input.publish !== 'draft')
    if (validationError) return { ok: false, error: validationError }
    if (input.publish === 'schedule' && !input.scheduledFor) {
      return { ok: false, error: 'A schedule date is required when scheduling.' }
    }

    const statusPatch =
      input.publish === 'now' ? { status: 'published', published_at: now } :
      input.publish === 'schedule' ? { status: 'scheduled', scheduled_for: input.scheduledFor } :
      { status: 'draft' }
    const expiresAt = input.expiresAt || null

    const slug = await uniqueSlug(supabase, input.draft.slugBase || 'submission')
    const { data: created, error: createErr } = await supabase
      .from('content_items')
      .insert({
        type: contentType,
        slug,
        status: 'draft', // flipped to the target status once child rows exist
        verification: input.draft.verification ?? null,
        location_id: input.draft.locationId || null,
        category_id: input.draft.categoryId || null,
        submitted_by: sub.submitted_by ?? null,
        expires_at: expiresAt,
      })
      .select('id')
      .single()
    if (createErr || !created) return { ok: false, error: createErr?.message ?? 'Could not create the content item.' }

    try {
      await upsertTranslations(supabase, created.id, input.draft.translations)
      if ((input.draft.photos ?? []).length > 0 || (input.draft.attachments ?? []).length > 0) {
        await syncPhotos(supabase, created.id, input.draft.photos ?? [], [], input.draft.photographerCredit ?? null, input.draft.attachments ?? [])
      }
      if (contentType === 'listing') {
        const { error: lErr } = await supabase.from('listings').insert({
          content_item_id: created.id,
          price: input.draft.listing?.price ?? null,
          currency: input.draft.listing?.currency?.toUpperCase().slice(0, 3) ?? 'XAF',
          listing_status: 'active',
          contact_phone: input.draft.listing?.contactPhone ?? null,
          contact_email: input.draft.listing?.contactEmail ?? null,
          whatsapp_number: input.draft.listing?.whatsappNumber ?? null,
          seller_name: input.draft.listing?.sellerName?.trim() || null,
        })
        if (lErr) throw new Error(`Could not create the listing: ${lErr.message}`)
      }
      if (contentType === 'notice') {
        const { error: nErr } = await supabase.from('notices').insert({
          content_item_id: created.id,
          notice_type: input.draft.notice?.noticeType ?? 'other',
          organization_name: input.draft.notice?.organizationName ?? null,
          contact_phone: input.draft.notice?.contactPhone ?? null,
          notice_date: input.draft.notice?.noticeDate ?? null,
          expiry_date: input.draft.notice?.expiryDate ?? expiresAt,
          is_official: input.draft.verification === 'official_source' || input.draft.notice?.isOfficial === true,
        })
        if (nErr) throw new Error(`Could not create the notice: ${nErr.message}`)
      }
    } catch (e) {
      // Roll the half-built item back so a retry doesn't collide on the slug.
      await supabase.from('content_items').delete().eq('id', created.id)
      return fail(e)
    }

    const { error: flipErr } = await supabase.from('content_items').update(statusPatch).eq('id', created.id)
    if (flipErr) return { ok: false, error: flipErr.message }

    const approvePatch: Record<string, unknown> = {
      status: 'approved', reviewed_at: now, reviewed_by: user.id, content_item_id: created.id,
    }
    if (input.notes !== undefined) approvePatch.internal_notes = input.notes
    await supabase.from('submissions').update(approvePatch as UpdateOf<'submissions'>).eq('id', input.submissionId)

    await supabase.from('moderation_log').insert({
      action: input.publish === 'now' ? 'approve_publish' : input.publish === 'schedule' ? 'approve_schedule' : 'approve_draft',
      to_status: input.publish === 'draft' ? 'draft' : input.publish === 'schedule' ? 'scheduled' : 'published',
      notes: input.notes ?? null,
      submission_id: input.submissionId,
      content_item_id: created.id,
      actor_id: user.id,
    })

    if (input.publish !== 'draft') revalidatePublicContentCache()
    revalidateLocalized('/admin/moderation')
    revalidateLocalized('/admin/moderation/[id]')
    revalidateLocalized('/admin/content')
    revalidateLocalized('/admin/dashboard')
    if (input.publish !== 'draft') {
      const enTitle = input.draft.translations.find((t) => t.locale === 'en')?.title?.trim() || 'your submission'
      void enqueueUser('submission.approved', sub.submitted_by, { title: enTitle.slice(0, 140) }, '/account/submissions')

      // B5 — approval-to-suggestion hook: when content goes live the publish
      // trigger (digest_slot_on_publish) creates digest_slots for it; fire a
      // ready-for-review staff alert so editors see the new item surfaced in
      // the digest panel and can pin/drop it before the next send. Best-effort.
      if (input.publish === 'now' && created.id) {
        void enqueueStaff('digest.ready_for_review', { template: enTitle.slice(0, 80), count: '1' }, '/admin/digest').catch(() => {})
      }
    }
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function rejectSubmission(submissionId: string, reason: string): Promise<ActionResult> {
  try {
    if (!reason.trim()) return { ok: false, error: 'A reason is required when rejecting.' }
    const { supabase, user } = await assertStaff()
    const now = new Date().toISOString()

    const { data: sub } = await supabase.from('submissions').select('id, status').eq('id', submissionId).single()
    if (!sub) return { ok: false, error: 'Submission not found.' }
    if (!['pending', 'in_review', 'needs_clarification'].includes(sub.status)) {
      return { ok: false, error: `Submission is ${sub.status} and cannot be rejected.` }
    }

    await supabase.from('submissions').update({ status: 'rejected', reviewed_at: now, rejection_reason: reason }).eq('id', submissionId)
    await supabase.from('moderation_log').insert({
      action: 'reject', to_status: 'rejected', notes: reason,
      submission_id: submissionId, actor_id: user.id,
    })

    revalidateLocalized('/admin/moderation')
    revalidateLocalized('/admin/moderation/[id]')
    void submissionNotifyTarget(supabase, submissionId).then((t) =>
      enqueueUser('submission.rejected', t.userId, { title: t.title, reason: reason.trim().slice(0, 280) }, '/account/submissions'),
    )
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function updateSubmissionNotes(submissionId: string, notes: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertStaff()
    const { error } = await supabase.from('submissions').update({ internal_notes: notes }).eq('id', submissionId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'submission:notes', submissionId })
    revalidateLocalized('/admin/moderation')
    revalidateLocalized('/admin/moderation/[id]')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Bulk moderation: run the same capability- and status-checked single
 * operations over a selection. Sequential on purpose — one HTTP round trip
 * for the whole selection, with a per-item failure count surfaced to the UI.
 */
export async function bulkApproveSubmissions(ids: string[]): Promise<ActionResult> {
  let failed = 0
  for (const id of ids) {
    const result = await approveSubmission(id)
    if (!result.ok) failed += 1
  }
  await auditBulkOperation({ action: 'submission:bulk_approve', resourceType: 'submission', ids, failed })
  return failed > 0 ? { ok: false, error: `${failed} of ${ids.length} submission(s) failed.` } : { ok: true }
}

export async function bulkRejectSubmissions(ids: string[], reason: string): Promise<ActionResult> {
  if (!reason.trim()) return { ok: false, error: 'A reason is required when rejecting.' }
  let failed = 0
  for (const id of ids) {
    const result = await rejectSubmission(id, reason)
    if (!result.ok) failed += 1
  }
  await auditBulkOperation({ action: 'submission:bulk_reject', resourceType: 'submission', ids, failed, metadata: { reason: reason.trim() } })
  return failed > 0 ? { ok: false, error: `${failed} of ${ids.length} submission(s) failed.` } : { ok: true }
}

/** Phase 3 — bulk clarify: same question to a selection, per-item failures counted. */
export async function bulkRequestClarification(ids: string[], question: string): Promise<ActionResult> {
  if (!question.trim()) return { ok: false, error: 'A question is required when requesting clarification.' }
  let failed = 0
  for (const id of ids) {
    const result = await requestClarification(id, question)
    if (!result.ok) failed += 1
  }
  await auditBulkOperation({ action: 'submission:bulk_clarify', resourceType: 'submission', ids, failed })
  return failed > 0 ? { ok: false, error: `${failed} of ${ids.length} submission(s) failed.` } : { ok: true }
}

/**
 * Bulk trust & safety: resolve/dismiss/delete over a selection of community
 * reports. Same sequential per-item pattern as the moderation bulk actions.
 */
export async function bulkResolveReports(
  ids: string[],
  status: 'investigating' | 'resolved' | 'dismissed',
): Promise<ActionResult> {
  let failed = 0
  for (const id of ids) {
    const result = await resolveReport(id, status)
    if (!result.ok) failed += 1
  }
  await auditBulkOperation({ action: `report:bulk_${status}`, resourceType: 'report', ids, failed })
  return failed > 0 ? { ok: false, error: `${failed} of ${ids.length} report(s) failed.` } : { ok: true }
}

export async function bulkDeleteReports(ids: string[]): Promise<ActionResult> {
  let failed = 0
  for (const id of ids) {
    const result = await deleteReport(id)
    if (!result.ok) failed += 1
  }
  // §53 bulk deletion — the single most destructive action in the pipeline,
  // so it gets an audit_events row on top of the per-item moderation_log ones.
  await auditBulkOperation({ action: 'report:bulk_delete', resourceType: 'report', ids, failed })
  return failed > 0 ? { ok: false, error: `${failed} of ${ids.length} report(s) failed.` } : { ok: true }
}

/* ------------------------------------------------------------------ */
/* Clarification & reopen (Phase 3 moderation loop)                    */
/* ------------------------------------------------------------------ */

/**
 * Phase 3 clarification loop: send a submission back with a question instead
 * of rejecting it. The question is appended to the internal notes (visible on
 * the review screen) and the status moves to needs_clarification so it leaves
 * the pending queue without a final decision.
 */
export async function requestClarification(submissionId: string, question: string): Promise<ActionResult> {
  try {
    if (!question.trim()) return { ok: false, error: 'A question is required when requesting clarification.' }
    const { supabase, user } = await assertCapability('moderate')
    const now = new Date().toISOString()

    const { data: sub } = await supabase
      .from('submissions')
      .select('id, status, internal_notes')
      .eq('id', submissionId)
      .single()
    if (!sub) return { ok: false, error: 'Submission not found.' }
    if (!['pending', 'in_review'].includes(sub.status)) {
      return { ok: false, error: `Submission is ${sub.status} and cannot be sent back for clarification.` }
    }

    const notes = `${(sub.internal_notes ?? '').trim()}${sub.internal_notes ? '\n\n' : ''}[needs clarification] ${question.trim()}`
    await supabase
      .from('submissions')
      .update({ status: 'needs_clarification', internal_notes: notes, reviewed_at: now })
      .eq('id', submissionId)
    await supabase.from('moderation_log').insert({
      action: 'request_clarification',
      to_status: 'needs_clarification',
      notes: question,
      submission_id: submissionId,
      actor_id: user.id,
    })

    revalidateLocalized('/admin/moderation')
    revalidateLocalized('/admin/moderation/[id]')
    void submissionNotifyTarget(supabase, submissionId).then((t) =>
      enqueueUser('submission.clarification', t.userId, { title: t.title, question: question.trim().slice(0, 280) }, '/account/submissions'),
    )
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Reopen a rejected / withdrawn / needs-clarification submission for review.
 * It goes back to in_review — visible in the clarification tab and approvable
 * from the review drawer.
 */
export async function reopenSubmission(submissionId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('moderate')
    const { data: sub } = await supabase.from('submissions').select('id, status').eq('id', submissionId).single()
    if (!sub) return { ok: false, error: 'Submission not found.' }
    if (!['rejected', 'needs_clarification', 'withdrawn'].includes(sub.status)) {
      return { ok: false, error: `Submission is ${sub.status} and cannot be reopened.` }
    }

    await supabase
      .from('submissions')
      .update({ status: 'in_review', reviewed_at: new Date().toISOString() })
      .eq('id', submissionId)
    await supabase.from('moderation_log').insert({
      action: 'reopen',
      from_status: sub.status,
      to_status: 'in_review',
      submission_id: submissionId,
      actor_id: user.id,
    })

    revalidateLocalized('/admin/moderation')
    revalidateLocalized('/admin/moderation/[id]')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Permanent submission delete (admin only, Phase 2 cleanup). Removes the
 * submission row + its moderation_log history; approved submissions keep
 * their already-published content item.
 */
export async function deleteSubmission(submissionId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertAdmin()
    const { data: row } = await supabase.from('submissions').select('id, status, submission_type').eq('id', submissionId).limit(1)
    const found = (row ?? [])[0] as { id: string; status: string; submission_type: string } | undefined
    if (!found) return { ok: false, error: 'Submission not found.' }

    const { error } = await supabase.from('submissions').delete().eq('id', submissionId)
    if (error) return { ok: false, error: error.message }

    await audit(supabase, user.id, {
      action: 'moderation:delete',
      submissionId,
      notes: `${found.submission_type}/${found.status}`,
    })
    revalidateLocalized('/admin/moderation')
    revalidateLocalized('/admin/moderation/[id]')
    revalidateLocalized('/admin/dashboard')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
