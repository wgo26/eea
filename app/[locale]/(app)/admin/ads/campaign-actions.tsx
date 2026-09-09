'use client'

import { useState } from 'react'
import { deleteAdCampaign, updateAdCampaign, updateCampaignStatus } from '@/lib/admin/actions'
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
import type { AdCampaignRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['ads']

export function CampaignActions({ campaign, copy }: { campaign: AdCampaignRow; copy: Copy }) {
  const { run, loading } = useAdminMutation()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Edit form state — reset to campaign values each time the dialog opens
  const [name, setName] = useState(campaign.name)
  const [destinationUrl, setDestinationUrl] = useState(campaign.destinationUrl ?? '')

  function openEdit() {
    setName(campaign.name)
    setDestinationUrl(campaign.destinationUrl ?? '')
    setEditOpen(true)
  }

  async function handleEdit() {
    const ok = await run(
      () => updateAdCampaign(campaign.id, { name: name.trim(), destinationUrl: destinationUrl.trim() || null }),
      copy.saved,
    )
    if (ok) setEditOpen(false)
  }

  async function handleToggle() {
    const next = campaign.status === 'active' ? 'paused' : 'active'
    await run(() => updateCampaignStatus(campaign.id, next), copy.saved)
  }

  const isBusy = loading

  async function handleDelete() {
    const ok = await run(() => deleteAdCampaign(campaign.id), copy.deleted)
    if (ok) setDeleteOpen(false)
  }

  return (
    <>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={handleToggle}
          disabled={isBusy}
          className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50 hover:bg-accent transition-colors"
        >
          {campaign.status === 'active' ? copy.pause : copy.activate}
        </button>
        <button
          type="button"
          onClick={openEdit}
          disabled={isBusy}
          className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50 hover:bg-accent transition-colors"
        >
          {copy.edit}
        </button>
        <button
          type="button"
          disabled={isBusy || campaign.status === 'active'}
          onClick={() => setDeleteOpen(true)}
          className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive disabled:opacity-50"
        >
          {copy.delete}
        </button>
      </div>

      {/* Edit dialog — replaces window.prompt×2 */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.edit}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.campaignName}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={ui.input}
                placeholder={copy.campaignName}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.destinationUrl}</span>
              <input
                type="url"
                value={destinationUrl}
                onChange={(e) => setDestinationUrl(e.target.value)}
                className={ui.input}
                placeholder="https://…"
              />
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

      {/* Delete confirm — replaces window.confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={copy.delete}
        description={copy.deleteCampaignConfirm}
        confirmLabel={copy.delete}
        cancelLabel={copy.cancel}
        onConfirm={handleDelete}
        loading={loading}
        tone="danger"
      />
    </>
  )
}
