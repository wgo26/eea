'use client'

import { useState } from 'react'
import { deleteAdCampaign, updateAdCampaign, updateCampaignStatus } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'
import type { AdCampaignRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['ads']

export function CampaignActions({ campaign, copy }: { campaign: AdCampaignRow; copy: Copy }) {
  const { addToast } = useToast()
  const [busy, setBusy] = useState(false)

  async function toggle() {
    setBusy(true)
    const result = await updateCampaignStatus(campaign.id, campaign.status === 'active' ? 'paused' : 'active')
    setBusy(false)
    addToast(result.ok ? copy.saved : result.error, result.ok ? 'success' : 'error')
  }

  async function edit() {
    const name = window.prompt(copy.campaignName, campaign.name)
    if (name === null) return
    const destinationUrl = window.prompt(copy.destinationUrl, campaign.destinationUrl ?? '')
    if (destinationUrl === null) return
    setBusy(true)
    const result = await updateAdCampaign(campaign.id, { name, destinationUrl })
    setBusy(false)
    addToast(result.ok ? copy.saved : result.error, result.ok ? 'success' : 'error')
  }

  async function remove() {
    if (!window.confirm(copy.deleteCampaignConfirm)) return
    setBusy(true)
    const result = await deleteAdCampaign(campaign.id)
    setBusy(false)
    addToast(result.ok ? copy.deleted : result.error, result.ok ? 'success' : 'error')
  }

  return <div className="flex justify-end gap-2"><button type="button" onClick={toggle} disabled={busy} className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50">{campaign.status === 'active' ? copy.pause : copy.activate}</button><button type="button" onClick={edit} disabled={busy} className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50">{copy.edit}</button><button type="button" onClick={remove} disabled={busy || campaign.status === 'active'} className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive disabled:opacity-50">{copy.delete}</button></div>
}
