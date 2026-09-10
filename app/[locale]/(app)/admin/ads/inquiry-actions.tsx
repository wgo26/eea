'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { approveAdInquiry, rejectAdInquiry, deleteAdInquiry } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import type { AdInquiryRow, AdSlotRow } from '@/lib/admin/queries'
import type { Dictionary } from '@/lib/i18n'

type Copy = Dictionary['admin']['ads']

export function InquiryActions({ inquiry, slots, copy }: { inquiry: AdInquiryRow; slots: AdSlotRow[]; copy: Copy }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [slotId, setSlotId] = useState('')
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [reason, setReason] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  async function approve() {
    if (!slotId) return
    setBusy(true)
    const result = await approveAdInquiry(inquiry.id, { slotId, startsAt: startsAt || undefined, endsAt: endsAt || undefined })
    setBusy(false)
    addToast(result.ok ? copy.inquiryApproved : result.error, result.ok ? 'success' : 'error')
    if (result.ok) router.refresh()
  }

  async function reject() {
    setBusy(true)
    const result = await rejectAdInquiry(inquiry.id, reason)
    setBusy(false)
    if (result.ok) {
      setRejectOpen(false)
      setReason('')
      router.refresh()
    }
    addToast(result.ok ? copy.inquiryRejected : result.error, result.ok ? 'success' : 'error')
  }

  async function handleDelete() {
    setBusy(true)
    const result = await deleteAdInquiry(inquiry.id)
    setBusy(false)
    if (result.ok) {
      setDeleteOpen(false)
      addToast(copy.toastInquiryDeleted, 'success')
      router.refresh()
    } else {
      addToast(result.error, 'error')
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {slots.length === 0 ? (
        <span className="text-xs text-muted-foreground">{copy.emptySlots}</span>
      ) : (
        <select value={slotId} onChange={(e) => setSlotId(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-xs" disabled={busy} aria-label={copy.colSlot}>
          <option value="">{copy.pickSlot}</option>
          {slots.map((slot) => <option key={slot.id} value={slot.id}>{slot.name}</option>)}
        </select>
      )}
      <input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-xs" aria-label={copy.startsAt} disabled={busy} />
      <input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} className="rounded-md border border-border bg-background px-2 py-1 text-xs" aria-label={copy.endsAt} disabled={busy} />
      <button type="button" onClick={approve} disabled={busy || !slotId} title={!slotId ? copy.pickSlot : undefined} className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50">{copy.approve}</button>
      <button type="button" onClick={() => setRejectOpen(true)} disabled={busy} className="rounded-md border border-destructive/40 px-2.5 py-1 text-xs font-medium text-destructive disabled:opacity-50">{copy.reject}</button>
      <button type="button" onClick={() => setDeleteOpen(true)} disabled={busy} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/50 disabled:opacity-50">{copy.deleteInquiry}</button>
      <ConfirmDialog open={rejectOpen} onOpenChange={setRejectOpen} title={copy.rejectInquiry} description={copy.rejectionReason} confirmLabel={copy.reject} cancelLabel={copy.cancel} loading={busy} onConfirm={reject}>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} className="min-h-20 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" placeholder={copy.rejectionReason} />
      </ConfirmDialog>
      <ConfirmDialog open={deleteOpen} onOpenChange={setDeleteOpen} title={copy.deleteInquiry} description={copy.deleteInquiryConfirm} confirmLabel={copy.delete} cancelLabel={copy.cancel} loading={busy} onConfirm={handleDelete} />
    </div>
  )
}
