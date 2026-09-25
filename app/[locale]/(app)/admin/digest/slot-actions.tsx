'use client'

import { useState } from 'react'
import { setSlotPinned, setSlotRemoved } from '@/lib/admin/actions/digest'
import { useToast } from '@/components/admin/toast'

export type SlotCopy = {
  pin: string
  unpin: string
  drop: string
  restore: string
  toastUpdated: string
}

const btnGhost =
  'inline-flex items-center justify-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50'
const btnPinned =
  'inline-flex items-center justify-center rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300'

/** Pin/drop controls for one open digest slot (A4 panel rows). */
export function SlotRowActions({ slot, copy }: { slot: { id: string; pinned: boolean; removed: boolean }; copy: SlotCopy }) {
  const { addToast } = useToast()
  const [loading, setLoading] = useState<'pin' | 'drop' | null>(null)

  async function run(kind: 'pin' | 'drop') {
    setLoading(kind)
    const result =
      kind === 'pin'
        ? await setSlotPinned(slot.id, !slot.pinned)
        : await setSlotRemoved(slot.id, !slot.removed)
    setLoading(null)
    if (!result.ok) addToast(result.error, 'error')
    else addToast(copy.toastUpdated, 'success')
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button type="button" onClick={() => run('pin')} disabled={loading !== null} className={slot.pinned ? btnPinned : btnGhost}>
        {slot.pinned ? copy.unpin : copy.pin}
      </button>
      <button type="button" onClick={() => run('drop')} disabled={loading !== null} className={btnGhost}>
        {slot.removed ? copy.restore : copy.drop}
      </button>
    </div>
  )
}
