'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  rejectSubmission,
  updateSubmissionNotes,
  requestClarification,
  reopenSubmission,
} from '@/lib/admin/actions/moderation'
import { aiModerationResponse } from '@/lib/admin/actions/ai'
import { useToast } from '@/components/admin/toast'
import { ApproveContentDialog } from './approve-content-dialog'
import type { Dictionary } from '@/lib/i18n'
import type { SubmissionRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['review']
type Option = { id: string; name: string }

/**
 * Review screen actions: internal notes, the approve dialog (which renders the
 * *same* ContentForm the Content screen uses — see approve-content-dialog.tsx),
 * reject with reason, request clarification, and reopen.
 *
 * The approve path used to be a bespoke 640-line drawer in this file. It had
 * drifted to roughly half the fields of the form beside it — no story blocks,
 * tags, slug, SEO, byline, share line, event fields, per-photo alt/caption,
 * media library, preview, autosave or intelligence layer — so a post approved
 * from the queue was a lesser artifact than one created in Content, and
 * finishing it meant opening the edit drawer anyway. Approving is editing now.
 */
export function ReviewActions({
  submission,
  copy,
  contentCopy,
  common,
  typeFilters,
  locations = [],
  categories = [],
  locale = 'en',
}: {
  submission: SubmissionRow
  copy: Copy
  /** The content dictionary: the approve dialog renders the shared form. */
  contentCopy: Dictionary['admin']['content']
  common: Dictionary['admin']['common']
  typeFilters: Dictionary['admin']['typeFilters']
  locations?: Option[]
  categories?: Option[]
  /** Reviewer locale for drafted decision text (defaults to English). */
  locale?: 'en' | 'fr'
}) {
  const { addToast } = useToast()
  const router = useRouter()
  const [notes, setNotes] = useState(submission.internalNotes ?? '')
  const [notesBusy, setNotesBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [clarifyOpen, setClarifyOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [drafting, setDrafting] = useState<null | 'reject' | 'clarify'>(null)

  // The submission in one text blob: what the decision-text drafter reads when
  // the reviewer typed no points of their own yet.
  const submissionText = useMemo(
    () =>
      Object.entries(submission.payload ?? {})
        .map(([k, v]) => `${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
        .join('\n')
        .slice(0, 1500),
    [submission.payload],
  )

  /**
   * Draft the message the submitter will receive — rejection reason or
   * clarification question — from the reviewer's typed points (or the bare
   * submission). The model writes into the textarea for review, never sends:
   * the submitter gets notified, so tone matters and the reviewer edits first.
   */
  async function handleDraftDecision(kind: 'reject' | 'clarify') {
    if (drafting) return
    setDrafting(kind)
    try {
      const res = await aiModerationResponse({
        decision: kind,
        submissionType: submission.submissionType,
        submissionText,
        points: kind === 'reject' ? reason : question,
        locale,
      })
      if (!res.ok) {
        addToast(res.error, 'error')
        return
      }
      if (kind === 'reject') setReason(res.note)
      else setQuestion(res.note)
      addToast(copy.toastAiDrafted, 'success')
    } catch (e) {
      addToast(e instanceof Error ? e.message : 'Operation failed', 'error')
    } finally {
      setDrafting(null)
    }
  }

  const actionable =
    submission.status === 'pending' ||
    submission.status === 'in_review' ||
    submission.status === 'needs_clarification'
  const hasContentItem = !!submission.contentItemId

  async function handleSaveNotes() {
    setNotesBusy(true)
    const result = await updateSubmissionNotes(submission.id, notes)
    setNotesBusy(false)
    if (result.ok) addToast(copy.toastNotesSaved, 'success')
    else addToast(result.error, 'error')
  }

  async function handleReject() {
    if (!reason.trim()) return
    setBusy(true)
    const result = await rejectSubmission(submission.id, reason)
    setBusy(false)
    if (result.ok) {
      addToast(copy.toastRejected, 'success')
      setRejectOpen(false)
      setReason('')
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  async function handleClarify() {
    if (!question.trim()) return
    setBusy(true)
    const result = await requestClarification(submission.id, question)
    setBusy(false)
    if (result.ok) {
      addToast(copy.toastClarified, 'success')
      setClarifyOpen(false)
      setQuestion('')
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  async function handleReopen() {
    setBusy(true)
    const result = await reopenSubmission(submission.id)
    setBusy(false)
    if (result.ok) {
      addToast(copy.toastReopened, 'success')
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <section id="review-decision" className="rounded-lg border border-border bg-card p-4 scroll-mt-4">
      <h2 className="text-sm font-medium">{copy.notes}</h2>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder={copy.notesPlaceholder}
        rows={4}
        className="mt-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      />
      <button
        type="button"
        onClick={handleSaveNotes}
        disabled={notesBusy}
        className="mt-2 inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
      >
        {copy.saveNotes}
      </button>

      {/* Approve means writing the story, so it opens the shared content form
          rather than flipping a status. A submission that already produced an
          item is edited through the content drawer instead (the link lives in
          the sidebar above), because approving it twice must never build twice. */}
      {actionable && !hasContentItem ? (
        <div className="mt-4">
          <ApproveContentDialog
            submission={submission}
            copy={copy}
            contentCopy={contentCopy}
            common={common}
            typeFilters={typeFilters}
            locations={locations}
            categories={categories}
            onDone={() => router.refresh()}
          />
        </div>
      ) : null}
      {/* Reject and clarify decide *about* a submission rather than authoring a
          post, so they stay quick inline actions — and both are bulk-able from
          the queue, which approving deliberately is not. */}
      {actionable ? (
        <div className="mt-2 flex flex-col gap-2">
          {clarifyOpen ? (
            <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950/30">
              <p className="text-xs text-muted-foreground">{copy.clarifyBody}</p>
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder={copy.clarifyPlaceholder}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setClarifyOpen(false); setQuestion('') }}
                  disabled={busy}
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {copy.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDraftDecision('clarify')}
                  disabled={busy || drafting !== null}
                  title={copy.draftWithAi}
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {drafting === 'clarify' ? copy.draftingAi : `✨ ${copy.draftWithAi}`}
                </button>
                <button
                  type="button"
                  onClick={handleClarify}
                  disabled={busy || !question.trim()}
                  className="inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-700 disabled:opacity-50"
                >
                  {copy.clarify}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setClarifyOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-amber-400 hover:text-foreground"
            >
              {copy.clarify}
            </button>
          )}

          {rejectOpen ? (
            <div className="space-y-2 rounded-md border border-destructive/40 bg-background p-3">
              <p className="text-xs text-muted-foreground">{copy.rejectBody}</p>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={copy.rejectPlaceholder}
                rows={3}
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-destructive"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setRejectOpen(false); setReason('') }}
                  disabled={busy}
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {copy.cancel}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDraftDecision('reject')}
                  disabled={busy || drafting !== null}
                  title={copy.draftWithAi}
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent disabled:opacity-50"
                >
                  {drafting === 'reject' ? copy.draftingAi : `✨ ${copy.draftWithAi}`}
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={busy || !reason.trim()}
                  className="inline-flex items-center rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-destructive/90 disabled:opacity-50"
                >
                  {copy.reject}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRejectOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:border-destructive/50 hover:text-destructive"
            >
              {copy.reject}
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={handleReopen}
          disabled={busy}
          className="mt-4 inline-flex w-full items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          {copy.reopen}
        </button>
      )}
    </section>
  )
}

