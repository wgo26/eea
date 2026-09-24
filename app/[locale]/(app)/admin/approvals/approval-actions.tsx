'use client'

import { useState } from 'react'
import { approveApproval, rejectApproval } from '@/lib/admin/actions/approvals'
import { useAdminMutation, ConfirmDialog } from '@/components/admin/confirm-dialog'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['approvals']
type CommonCopy = Dictionary['admin']['common']

const btnPrimary =
  'inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50'
const btnGhost =
  'inline-flex items-center justify-center rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50'

/**
 * Approve / reject controls for one request. The server action re-checks the
 * capability and the self-approval ban; this component only decides whether to
 * offer the buttons at all, so a UI state can never widen authorization.
 */
export function ApprovalActions({
  approvalId,
  actionLabel,
  isOwn,
  canDecide,
  copy,
  common,
}: {
  approvalId: string
  actionLabel: string
  isOwn: boolean
  canDecide: boolean
  copy: Copy
  common: CommonCopy
}) {
  const { run, loading } = useAdminMutation()
  const [rejectOpen, setRejectOpen] = useState(false)

  if (isOwn) {
    return <p className="max-w-[220px] text-xs text-muted-foreground">{copy.selfNote}</p>
  }
  if (!canDecide) {
    return <p className="max-w-[220px] text-xs text-muted-foreground">{copy.noCapability}</p>
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={btnPrimary}
        disabled={loading}
        onClick={() => run(() => approveApproval(approvalId), copy.toastApproved)}
      >
        {copy.approve}
      </button>
      <button type="button" className={btnGhost} disabled={loading} onClick={() => setRejectOpen(true)}>
        {copy.reject}
      </button>

      <ConfirmDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={copy.rejectTitle}
        description={`${actionLabel} — ${copy.rejectBody}`}
        confirmLabel={copy.reject}
        cancelLabel={common.cancel}
        loading={loading}
        tone="danger"
        onConfirm={async () => {
          const ok = await run(() => rejectApproval(approvalId), copy.toastRejected)
          if (ok) setRejectOpen(false)
        }}
      />
    </div>
  )
}

/** Compact second-signature explanation rendered above the decision panel. */
export function ApprovalQueueHint({ copy }: { copy: Copy }) {
  return <p className="text-xs text-muted-foreground">{copy.approveBody}</p>
}
