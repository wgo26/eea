'use client'

import { useState } from 'react'
import { approveSubmission, rejectSubmission, updateSubmissionNotes } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['review']

/**
 * Internal notes + approve/reject with reason for the submission review
 * screen. Notes are saved independently so approving without providing notes
 * never wipes what a teammate already wrote (fixed in approveSubmission).
 */
export function ReviewActions({
  submissionId,
  status,
  initialNotes,
  copy,
}: {
  submissionId: string
  status: string
  initialNotes: string | null
  copy: Copy
}) {
  const { addToast } = useToast()
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [notesBusy, setNotesBusy] = useState(false)
  const [busy, setBusy] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')

  const pending = status === 'pending'

  async function handleSaveNotes() {
    setNotesBusy(true)
    const result = await updateSubmissionNotes(submissionId, notes)
    setNotesBusy(false)
    if (result.ok) addToast(copy.toastNotesSaved, 'success')
    else addToast(result.error, 'error')
  }

  async function handleApprove() {
    setBusy(true)
    // No notes argument: preserve any notes already saved on the row.
    const result = await approveSubmission(submissionId)
    setBusy(false)
    if (result.ok) addToast(copy.toastApproved, 'success')
    else addToast(result.error, 'error')
  }

  async function handleReject() {
    if (!reason.trim()) return
    setBusy(true)
    const result = await rejectSubmission(submissionId, reason)
    setBusy(false)
    if (result.ok) {
      addToast(copy.toastRejected, 'success')
      setRejectOpen(false)
      setReason('')
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
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
        className="mt-2 inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
      >
        {copy.saveNotes}
      </button>

      {pending && (
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={handleApprove}
            disabled={busy}
            className="inline-flex items-center justify-center rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {copy.approve}
          </button>

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
                  className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {copy.cancel}
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={busy || !reason.trim()}
                  className="inline-flex items-center rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:bg-destructive/90 transition-colors disabled:opacity-50"
                >
                  {copy.reject}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRejectOpen(true)}
              className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
            >
              {copy.reject}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
