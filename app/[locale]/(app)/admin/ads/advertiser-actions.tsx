'use client'

import { useState } from 'react'
import { deleteAdvertiser, updateAdvertiser } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'

export function AdvertiserActions({ advertiser, copy }: { advertiser: { id: string; companyName: string | null; contactName: string | null; email: string | null; phone: string | null; totalCampaigns: number }; copy: Dictionary['admin']['ads'] }) {
  const { addToast } = useToast()
  const [busy, setBusy] = useState(false)

  async function edit() {
    const companyName = window.prompt(copy.companyName, advertiser.companyName ?? '')
    if (companyName === null) return
    const contactName = window.prompt(copy.contactName, advertiser.contactName ?? '')
    if (contactName === null) return
    const email = window.prompt(copy.email, advertiser.email ?? '')
    if (email === null) return
    setBusy(true)
    const result = await updateAdvertiser(advertiser.id, { companyName, contactName, email, phone: advertiser.phone ?? undefined })
    setBusy(false)
    addToast(result.ok ? copy.saved : result.error, result.ok ? 'success' : 'error')
  }

  async function remove() {
    if (!window.confirm(copy.deleteAdvertiserConfirm)) return
    setBusy(true)
    const result = await deleteAdvertiser(advertiser.id)
    setBusy(false)
    addToast(result.ok ? copy.deleted : result.error, result.ok ? 'success' : 'error')
  }

  return (
    <div className="flex justify-end gap-2">
      <button type="button" disabled={busy} onClick={edit} className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50">{copy.edit}</button>
      <button type="button" disabled={busy || advertiser.totalCampaigns > 0} onClick={remove} className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive disabled:opacity-50">{copy.delete}</button>
    </div>
  )
}
