'use client'

import { updateCampaignStatus } from '@/lib/admin/actions'
import { useAdminMutation } from '@/components/admin/confirm-dialog'
import type { Dictionary } from '@/lib/i18n'
import type { AdSlotRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['ads']

export function AdSlotActions({ slot, copy }: { slot: AdSlotRow; copy: Copy }) {
  const { run, loading } = useAdminMutation()
  const campaign = slot.activeCampaign

  async function handleCampaignAction(action: 'pause' | 'activate') {
    if (!campaign) return
    const status = action === 'pause' ? 'paused' : 'active'
    await run(
      () => updateCampaignStatus(campaign.id, status),
      action === 'pause' ? copy.statusPaused : copy.statusActive,
    )
  }

  return (
    <div className="flex items-center gap-2 justify-end">
      {campaign ? (
        <button
          onClick={() => handleCampaignAction(campaign.status === 'active' ? 'pause' : 'activate')}
          disabled={loading}
          className="text-xs px-2 py-1 rounded border border-border hover:bg-accent transition-colors disabled:opacity-50"
        >
          {loading ? '…' : (campaign.status === 'active' ? copy.pause : copy.activate)}
        </button>
      ) : (
        <span className="text-xs text-muted-foreground">{copy.noCampaign}</span>
      )}
    </div>
  )
}
