'use client'

import { useState } from 'react'
import { updateAdSlot, deleteAdSlot, updateCampaignStatus } from '@/lib/admin/actions'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ui } from '@/lib/admin/ui-constants'
import type { Dictionary } from '@/lib/i18n'
import type { AdSlotRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['ads']

export function AdSlotActions({ slot, copy }: { slot: AdSlotRow; copy: Copy }) {
  const { run, loading } = useAdminMutation()
  const campaign = slot.activeCampaign
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Edit form state
  const [name, setName] = useState(slot.name)
  const [placement, setPlacement] = useState(slot.placement ?? '')
  const [dimensions, setDimensions] = useState(slot.dimensions ?? '')
  const [basePrice, setBasePrice] = useState(slot.basePrice != null ? String(slot.basePrice) : '')
  const [currency, setCurrency] = useState(slot.currency ?? '')
  const [isActive, setIsActive] = useState(slot.isActive)

  function openEdit() {
    setName(slot.name)
    setPlacement(slot.placement ?? '')
    setDimensions(slot.dimensions ?? '')
    setBasePrice(slot.basePrice != null ? String(slot.basePrice) : '')
    setCurrency(slot.currency ?? '')
    setIsActive(slot.isActive)
    setEditOpen(true)
  }

  async function handleEdit() {
    const ok = await run(
      () =>
        updateAdSlot(slot.id, {
          name: name.trim(),
          placement: placement.trim() || null,
          dimensions: dimensions.trim() || null,
          basePrice: basePrice ? Number(basePrice) : null,
          currency: currency.trim() || null,
          isActive,
        }),
      copy.toastSlotUpdated,
    )
    if (ok) setEditOpen(false)
  }

  async function handleDelete() {
    const ok = await run(() => deleteAdSlot(slot.id), copy.toastSlotDeleted)
    if (ok) setDeleteOpen(false)
  }

  async function handleCampaignToggle() {
    if (!campaign) return
    const status = campaign.status === 'active' ? 'paused' : 'active'
    await run(
      () => updateCampaignStatus(campaign.id, status),
      status === 'paused' ? copy.statusPaused : copy.statusActive,
    )
  }

  return (
    <>
      <div className="flex items-center gap-2 justify-end">
        {campaign ? (
          <button
            onClick={handleCampaignToggle}
            disabled={loading}
            className="text-xs px-2 py-1 rounded border border-border hover:bg-accent transition-colors disabled:opacity-50"
          >
            {loading ? '…' : campaign.status === 'active' ? copy.pause : copy.activate}
          </button>
        ) : (
          <span className="text-xs text-muted-foreground">{copy.noCampaign}</span>
        )}
        <button
          type="button"
          onClick={openEdit}
          disabled={loading}
          className="text-xs px-2 py-1 rounded border border-border hover:bg-accent transition-colors disabled:opacity-50"
        >
          {copy.edit}
        </button>
        <button
          type="button"
          disabled={loading || (campaign?.status === 'active')}
          onClick={() => setDeleteOpen(true)}
          className="text-xs px-2 py-1 rounded border border-destructive/40 text-destructive disabled:opacity-50"
          title={campaign?.status === 'active' ? copy.deleteSlotConfirm : undefined}
        >
          {copy.delete}
        </button>
      </div>

      {/* Edit slot dialog — wires the orphaned updateAdSlot action */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.editSlot}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.slotName}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className={ui.input} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.colPlacement}</span>
              <input value={placement} onChange={(e) => setPlacement(e.target.value)} className={ui.input} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.colSize}</span>
              <input value={dimensions} onChange={(e) => setDimensions(e.target.value)} className={ui.input} placeholder="e.g. 728×90" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{copy.basePrice}</span>
                <input type="number" min="0" step="0.01" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} className={ui.input} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{copy.currency}</span>
                <input value={currency} onChange={(e) => setCurrency(e.target.value)} className={ui.input} placeholder="USD" maxLength={3} />
              </label>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-border"
              />
              <span className="text-sm font-medium">{copy.active}</span>
            </label>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setEditOpen(false)} className={ui.btnSecondary} disabled={loading}>
              {copy.cancel}
            </button>
            <button type="button" onClick={handleEdit} className={ui.btnPrimary} disabled={loading || !name.trim()}>
              {loading ? '…' : copy.saved}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete slot confirm — wires the orphaned deleteAdSlot action */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={copy.delete}
        description={copy.deleteSlotConfirm}
        confirmLabel={copy.delete}
        cancelLabel={copy.cancel}
        onConfirm={handleDelete}
        loading={loading}
        tone="danger"
      />
    </>
  )
}
