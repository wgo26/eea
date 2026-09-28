'use server'

import { assertStaff, assertAdmin, assertCapability } from '@/lib/admin/auth'
import { validateContentDraft, type ContentDraftInput } from '../content-validation'
import { type UpdateOf } from '@/lib/supabase/admin'
import { getRequestLocale } from '@/lib/i18n/server'
import { enqueueUser, enqueueStaff, submissionNotifyTarget } from '@/lib/notify/queue'
import { type ActionResult, audit, auditBulkOperation, fail, revalidateLocalized } from './_shared'
import { contentTypeForSubmission } from '@/lib/content/submission-types'
import { createContentRow, revalidateCreatedContent, ContentCreateError } from './content-create'
import { deleteReport, resolveReport } from './safety'

/** Statuses a reviewer can still decide on. */
const ACTIONABLE_STATUSES = ['pending', 'in_review', 'needs_clarification'] as const

/**
 * Resolve the locale the *reviewer* is working in, best-effort, so validation
 * prose reaches them in the language the rest of the screen uses. An action can
 * be invoked outside a render pass and a locale read must never fail a
 * publish, so English is the fallback.
 */
async function actorLocale(): Promise<'en' | 'fr'> {
  try {
    return (await getRequestLocale()) === 'fr' ? 'fr' : 'en'
  } catch {
    return 'en'
  }
}

/**
 * The title to show the submitter: whichever locale carries one. A French-only
 * approval used to fall through to the literal "your submission" because the
 * reviewer never typed an English title.
 */
function primaryTitle(draft: ContentDraftInput): string {
  const en = draft.translations.find((t) => t.locale === 'en')?.title?.trim()
  const fr = draft.translations.find((t) => t.locale === 'fr')?.title?.trim()
  return en || fr || 'your submission'
}

/**
 * The title to permalink from. Same rule, and the reason the approve path now
 * returns a real slug for a French story instead of `submission-xxxx`: an
 * English-first fallback plus a skipped FR translation row published an
 * un-localized URL for a French article.
 */
function primarySlugSource(draft: ContentDraftInput): string {
  return primaryTitle(draft) === 'your submission' ? draft.slugBase : primaryTitle(draft)
}

/**
 * Approve a submission AND create the real content item in one step — the core
 * review loop. Bilingual translations, photos as media_assets, location /
 * category / verification, tags, the listing/notice/event extension row and the
 * publish mode (now / scheduled / draft).
 *
 * The insert itself is delegated to `createContentRow`, the same builder the
 * Content screen's "New content" uses. Before that, the two copies had already
 * diverged: this one never wrote `events` rows (an approved culture submission
 * published with no date, venue or ticket link), never synced tags, and never
 * accepted an explicit slug.
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
      // content_item_id is read for the double-submit guard: a second click
      // used to build a second item from one submission.
      .select('id, submission_type, status, content_item_id, submitted_by')
      .eq('id', input.submissionId)
      .single()
    if (!sub) return { ok: false, error: 'Submission not found.' }
    if (sub.content_item_id) {
      return { ok: false, error: 'This submission already has a content item — use the edit drawer on it instead.' }
    }
    if (!ACTIONABLE_STATUSES.includes(sub.status as (typeof ACTIONABLE_STATUSES)[number])) {
      return { ok: false, error: `Submission is ${sub.status} and cannot be approved.` }
    }

    // The same client-safe table the review screen uses to pick the category
    // list and the form's locked content type.
    const contentType = contentTypeForSubmission(sub.submission_type)
    if (!contentType) return { ok: false, error: `Unknown submission type ${sub.submission_type}.` }

    const validationError = validateContentDraft(input.draft, input.publish !== 'draft', await actorLocale())
    if (validationError) return { ok: false, error: validationError }

    const created = await createContentRow({
      type: contentType,
      // slugBase falls back to the title in either locale, so a French-only
      // approval gets a French permalink instead of `submission-xxxx`.
      draft: { ...input.draft, slugBase: primarySlugSource(input.draft) },
      publish: input.publish,
      scheduledFor: input.scheduledFor,
      expiresAt: input.expiresAt ?? null,
      slug: input.draft.slug,
      // A community story keeps its reporter (submitted_by); the editor who
      // shaped it is the author when they picked one.
      authorFallbackId: user.id,
      submittedById: sub.submitted_by ?? null,
      supabase,
    })

    // Claim the submission for this item. The update is conditional on
    // content_item_id still being null, so two approve requests racing (double
    // click, retry, second tab) cannot both attach an item: the loser finds zero
    // rows changed and deletes the duplicate it just built.
    const approvePatch: Record<string, unknown> = {
      status: 'approved', reviewed_at: now, reviewed_by: user.id, content_item_id: created.id,
    }
    if (input.notes !== undefined) approvePatch.internal_notes = input.notes
    const { data: claimed } = await supabase
      .from('submissions')
      .update(approvePatch as UpdateOf<'submissions'>)
      .eq('id', input.submissionId)
      .is('content_item_id', null)
      .select('id')
    if (!claimed || claimed.length === 0) {
      await supabase.from('content_items').delete().eq('id', created.id)
      return { ok: false, error: 'This submission was approved by another request a moment ago — reload to see the content item.' }
    }

    await supabase.from('moderation_log').insert({
      action: input.publish === 'now' ? 'approve_publish' : input.publish === 'schedule' ? 'approve_schedule' : 'approve_draft',
      to_status: input.publish === 'draft' ? 'draft' : input.publish === 'schedule' ? 'scheduled' : 'published',
      notes: input.notes ?? null,
      submission_id: input.submissionId,
      content_item_id: created.id,
      actor_id: user.id,
    })

    revalidateCreatedContent(input.publish, ['/admin/moderation', '/admin/moderation/[id]'])

    if (input.publish !== 'draft') {
      // Notify with the title the submitter can read, not the literal "your
      // submission" a French-only approval used to produce.
      const title = primaryTitle(input.draft)
      void enqueueUser('submission.approved', sub.submitted_by, { title: title.slice(0, 140) }, '/account/submissions')

      // B5 — approval-to-suggestion hook: when content goes live the publish
      // trigger (digest_slot_on_publish) creates digest_slots for it; fire a
      // ready-for-review staff alert so editors see the new item surfaced in
      // the digest panel and can pin/drop it before the next send. Best-effort.
      if (input.publish === 'now' && created.id) {
        void enqueueStaff('digest.ready_for_review', { template: title.slice(0, 80), count: '1' }, '/admin/digest').catch(() => {})
      }
    }
    return { ok: true }
  } catch (e) {
    // A builder failure already carries an operator-facing sentence; anything
    // else is unexpected and goes through fail().
    if (e instanceof ContentCreateError) return { ok: false, error: e.message }
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
 *
 * There is deliberately no `bulkApproveSubmissions`. Approving means writing
 * the story — translations, taxonomy, media, the extension row — which is
 * per-submission editorial work that cannot be applied to a selection. The
 * version that used to live here called the content-less approve, so a
 * reviewer selecting twelve rows and clicking "Approve selected" moved twelve
 * submissions to Approved with no content item behind any of them: the
 * `content_item_id` the review screen reads as "already built" stayed null,
 * nothing was published, and the Approved tab became a pile of dead rows.
 * Reject and clarify are bulk-able because they decide *about* the submission
 * rather than authoring a post.
 */
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
