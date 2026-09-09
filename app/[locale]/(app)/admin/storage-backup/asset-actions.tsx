'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { queueStorageVerification } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
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
      {busy ? '…' : copy.verifyOne}
    </button>
  )
}