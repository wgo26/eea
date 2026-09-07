'use client'

import { useState } from 'react'
import { approveSubmission, rejectSubmission } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'
import type { SubmissionRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['moderation']

export function ModerationActions({ submission, copy }: { submission: SubmissionRow; copy: Copy }) {
  const { addToast } = useToast()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [loading, setLoading] = useState(false)

  if (submission.status !== 'pending' && submission.status !== 'in_review') {
    return (
      <div className="text-xs text-muted-foreground">
        {submission.reviewedAt ? copy.reviewed : submission.status}
      </div>
    )
  }

  async function handleApprove() {
    setLoading(true)
    const result = await approveSubmission(submission.id)
    setLoading(false)
    if (result.ok) {
      addToast(copy.toastApproved, 'success')
    } else {
      addToast(result.error, 'error')
    }
  }

  async function handleReject() {
    if (!reason.trim()) return
    setLoading(true)
    const result = await rejectSubmission(submission.id, reason)
    setLoading(false)
    if (result.ok) {
      addToast(copy.toastRejected, 'success')
      setRejectOpen(false)
      setReason('')
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={handleApprove}
        disabled={loading}
        className="inline-flex items-center rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 transition-colors disabled:opacity-50"
      >
        {copy.approve}
      </button>

      {rejectOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !loading && setRejectOpen(false)} />
          <div className="relative z-10 w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-xl">
            <h3 className="text-lg font-semibold">{copy.rejectTitle}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{copy.rejectBody}</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={copy.rejectPlaceholder}
              rows={3}
              className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setRejectOpen(false); setReason('') }}
                disabled={loading}
                className="inline-flex items-center justify-center rounded-md border border-border bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
              >
                {copy.cancel}
              </button>
              <button
                type="button"
                onClick={handleReject}
                disabled={loading || !reason.trim()}
                className="inline-flex items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-white hover:bg-destructive/90 transition-colors disabled:opacity-50"
              >
                {copy.reject}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setRejectOpen(true)}
          className="inline-flex items-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/50 transition-colors"
        >
          {copy.reject}
        </button>
      )}
    </div>
  )
}
