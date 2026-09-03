'use client'

import { useState } from 'react'
import { updateCampaignStatus } from '@/lib/admin/actions'
import type { Dictionary } from '@/lib/i18n'
import type { AdSlotRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['ads']

export function AdSlotActions({ slot, copy }: { slot: AdSlotRow; copy: Copy }) {
  const [busy, setBusy] = useState(false)
  const campaign = slot.activeCampaign

  async function handleCampaignAction(action: 'pause' | 'activate') {
    if (!campaign) return
    setBusy(true)
    const status = action === 'pause' ? 'paused' : 'active'
    const result = await updateCampaignStatus(campaign.id, status)
    setBusy(false)
    if (!result.ok) {
      alert(result.error)
    }
  }

  return (
    <div className="flex items-center gap-2 justify-end">
      {campaign ? (
        <button
          onClick={() => handleCampaignAction(campaign.status === 'active' ? 'pause' : 'activate')}
          disabled={busy}
          className="text-xs px-2 py-1 rounded border border-border hover:bg-accent transition-colors disabled:opacity-50"
        >
          {campaign.status === 'active' ? copy.pause : copy.activate}
        </button>
      ) : (
        <span className="text-xs text-muted-foreground">{copy.noCampaign}</span>
      )}
    </div>
  )
}
