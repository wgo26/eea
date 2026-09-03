'use client'

import { useState } from 'react'
import { assignHomepageSlot, toggleSlotActive } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import type { Dictionary } from '@/lib/i18n'
import type { HomepageSlot } from '@/lib/admin/queries'
import Image from 'next/image'

type Copy = Dictionary['admin']['content']

export function HomepageCuration({ slots, copy }: { slots: HomepageSlot[]; copy: Copy }) {
  const { addToast } = useToast()
  const [loading, setLoading] = useState<string | null>(null)

  async function handleAssign(slotId: string, contentItemId: string | null) {
    setLoading(slotId)
    const result = await assignHomepageSlot(slotId, contentItemId)
    setLoading(null)
    if (result.ok) {
      addToast(copy.slotUpdated, 'success')
    } else {
      addToast(result.error, 'error')
    }
  }

  async function handleToggleActive(slotId: string, isActive: boolean) {
    setLoading(slotId)
    const result = await toggleSlotActive(slotId, isActive)
    setLoading(null)
    if (result.ok) {
      addToast(isActive ? copy.slotActivated : copy.slotDeactivated, 'success')
    } else {
      addToast(result.error, 'error')
    }
  }

  // Group slots by their key prefix for display
  const grouped = slots.reduce<Record<string, HomepageSlot[]>>((acc, slot) => {
    const prefix = slot.slotKey.split('_')[0]
    if (!acc[prefix]) acc[prefix] = []
    acc[prefix].push(slot)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([prefix, groupSlots]) => (
        <div key={prefix}>
          <h3 className="text-sm font-medium text-muted-foreground uppercase tracking-wide mb-3">
            {prefix}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {groupSlots.map((slot) => (
              <SlotCard
                key={slot.id}
                slot={slot}
                copy={copy}
                loading={loading === slot.id}
                onAssign={(id) => handleAssign(slot.id, id)}
                onToggleActive={(active) => handleToggleActive(slot.id, active)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function SlotCard({
  slot,
  copy,
  loading,
  onAssign,
  onToggleActive,
}: {
  slot: HomepageSlot
  copy: Copy
  loading: boolean
  onAssign: (contentItemId: string | null) => void
  onToggleActive: (active: boolean) => void
}) {
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  return (
    <div className={`rounded-lg border bg-card p-4 ${slot.isActive ? 'border-border' : 'border-dashed opacity-60'}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div>
          <div className="text-sm font-medium">{slot.slotKey}</div>
          <div className="text-xs text-muted-foreground">{copy.position.replace('{n}', String(slot.sortOrder))}</div>
        </div>
        <button
          type="button"
          onClick={() => onToggleActive(!slot.isActive)}
          disabled={loading}
          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium border transition-colors ${
            slot.isActive
              ? 'bg-emerald-100 border-emerald-200 text-emerald-800'
              : 'bg-muted border-border text-muted-foreground'
          }`}
        >
          {slot.isActive ? copy.active : copy.inactive}
        </button>
      </div>

      {slot.contentItemId && slot.title ? (
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/30 p-2 mb-3">
          {slot.coverUrl && (
            <Image src={slot.coverUrl} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium truncate">{slot.title}</div>
            {slot.type && <div className="text-xs text-muted-foreground">{slot.type}</div>}
          </div>
          <button
            type="button"
            onClick={() => onAssign(null)}
            className="text-xs text-destructive hover:underline"
          >
            {copy.remove}
          </button>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 mb-3 text-center">
          <p className="text-xs text-muted-foreground mb-2">{copy.noContentAssigned}</p>
          <button
            type="button"
            onClick={() => setShowSearch(true)}
            className="text-xs text-primary hover:underline"
          >
            {copy.assignContent}
          </button>
        </div>
      )}

      {showSearch && (
        <div className="mt-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={copy.searchContent}
            className="w-full rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {copy.searchContentHint}
            <button type="button" onClick={() => setShowSearch(false)} className="ml-1 text-destructive hover:underline">{copy.cancel}</button>
          </p>
        </div>
      )}
    </div>
  )
}
