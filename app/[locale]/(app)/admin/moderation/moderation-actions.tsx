'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveSubmission, deleteSubmission, rejectSubmission } from '@/lib/admin/actions'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'
import type { SubmissionRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['moderation']

const btnPrimary =
  'inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50'
const btnGhost =
  'inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50'
const btnDanger =
  'inline-flex items-center justify-center rounded-md border border-destructive/40 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50'

/**
 * Queue row actions: quick approve, reject with reason, and admin-only
 * permanent delete for spam / test rows.
 */
export function ModerationActions({ submission, copy }: { submission: SubmissionRow; copy: Copy }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [rejectOpen, setRejectOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  const actionable =
    submission.status === 'pending' ||
    submission.status === 'in_review' ||
    submission.status === 'needs_clarification'

  async function handleApprove() {
    setLoading(true)
    const result = await approveSubmission(submission.id)
    setLoading(false)
    if (result.ok) {
      addToast(copy.toastApproved, 'success')
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  async function handleReject() {
    if (!reason.trim()) return
    setLoading(true)
    const result = await rejectSubmission(submission.id, reason.trim())
    setLoading(false)
    if (result.ok) {
      addToast(copy.toastRejected, 'success')
      setRejectOpen(false)
      setReason('')
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  async function handleDelete() {
    setLoading(true)
    const result = await deleteSubmission(submission.id)
    setLoading(false)
    if (result.ok) {
      addToast(copy.toastDeleted, 'success')
      setDeleteOpen(false)
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  if (!actionable) {
    return (
      <div className="flex items-center justify-end gap-1.5">
        <span className="text-xs text-muted-foreground">{copy.reviewed}</span>
        <button type="button" onClick={() => setDeleteOpen(true)} disabled={loading} className={btnDanger}>
          {copy.delete}
        </button>
        <ConfirmDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          title={copy.deleteConfirmTitle}
          description={copy.deleteConfirmBody}
          confirmLabel={copy.delete}
          cancelLabel={copy.cancel}
          loading={loading}
          onConfirm={handleDelete}
        />
      </div>
    )
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      <button type="button" onClick={handleApprove} disabled={loading} className={btnPrimary}>
        {copy.approve}
      </button>
      <button type="button" onClick={() => setRejectOpen(true)} disabled={loading} className={btnGhost}>
        {copy.reject}
      </button>
      <button type="button" onClick={() => setDeleteOpen(true)} disabled={loading} title={copy.deleteHint} className={btnDanger}>
        {copy.delete}
      </button>

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={copy.rejectTitle}
        description={copy.rejectBody}
        confirmLabel={copy.reject}
        cancelLabel={copy.cancel}
        loading={loading}
        tone="default"
        onConfirm={handleReject}
      >
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={copy.rejectPlaceholder}
          rows={3}
          className="mt-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={copy.deleteConfirmTitle}
        description={`${copy.deleteConfirmBody} ${copy.deleteHint}`}
        confirmLabel={copy.delete}
        cancelLabel={copy.cancel}
        loading={loading}
        onConfirm={handleDelete}
      />
    </div>
  )
}

