'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveBusinessClaim, rejectBusinessClaim, type ClaimRow } from '@/lib/professionals/actions'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['businessClaims']

const primaryBtn =
  'inline-flex min-h-[36px] items-center rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50'
const ghostBtn =
  'inline-flex min-h-[36px] items-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-50'

/** Approve (verify + publish) or reject one verification claim. */
export function ClaimActions({ claim, copy }: { claim: ClaimRow; copy: Copy }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const [rejecting, setRejecting] = useState(false)

  async function approve() {
    setBusy(true)
    const res = await approveBusinessClaim(claim.id)
    setBusy(false)
    if (res.ok) {
      addToast(copy.toastApproved, 'success')
      router.refresh()
    } else addToast(res.error, 'error')
  }

  async function reject() {
    setBusy(true)
    const res = await rejectBusinessClaim(claim.id, note)
    setBusy(false)
    if (res.ok) {
      addToast(copy.toastRejected, 'success')
      router.refresh()
    } else addToast(res.error, 'error')
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <button type="button" disabled={busy} onClick={() => void approve()} className={primaryBtn}>
        {copy.approve}
      </button>
      {rejecting ? (
        <span className="inline-flex items-center gap-1.5">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={copy.rejectNote}
            maxLength={500}
            className="h-8 w-44 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button type="button" disabled={busy} onClick={() => void reject()} className={ghostBtn}>
            {copy.reject}
          </button>
        </span>
      ) : (
        <button type="button" disabled={busy} onClick={() => setRejecting(true)} className={ghostBtn}>
          {copy.reject}
        </button>
      )}
    </span>
  );
}
