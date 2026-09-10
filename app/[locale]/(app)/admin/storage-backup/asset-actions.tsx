'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { deleteMediaAsset, queueStorageVerification } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import type { Dictionary } from '@/lib/i18n'

/** Per-asset verification — queues the checksum job for this media row only. */
export function AssetVerifyButton({ mediaId, copy }: { mediaId: string; copy: Dictionary['admin']['storage'] }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true)
        const result = await queueStorageVerification(mediaId)
        setBusy(false)
        if (result.ok) {
          addToast(copy.toastVerifyQueued, 'success')
          router.refresh()
        } else {
          addToast(result.error, 'error')
        }
      }}
      className="inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
    >
      {busy ? copy.queuing : copy.verifyOne}
    </button>
  )
}

/** Per-asset delete — permanent. ConfirmDialog instead of window.confirm. */
export function AssetDeleteButton({
  mediaId,
  inUse,
  copy,
}: {
  mediaId: string
  inUse: boolean
  copy: Dictionary['admin']['storage']
}) {
  const router = useRouter()
  const { run, loading } = useAdminMutation()
  const [confirmOpen, setConfirmOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        className="inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
      >
        {copy.deleteOne}
      </button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={copy.deleteTitle}
        description={inUse ? `${copy.deleteBody} ${copy.deleteBodyInUse}` : copy.deleteBody}
        confirmLabel={copy.deleteConfirm}
        cancelLabel={copy.cancel}
        loading={loading}
        onConfirm={async () => {
          const ok = await run(() => deleteMediaAsset(mediaId), copy.toastDeleted)
          if (ok) router.refresh()
        }}
      />
    </>
  )
}
