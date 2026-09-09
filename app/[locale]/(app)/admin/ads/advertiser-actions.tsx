'use client'

import { useState } from 'react'
import { deleteAdvertiser, updateAdvertiser } from '@/lib/admin/actions'
import { ConfirmDialog, useAdminMutation } from '@/components/admin/confirm-dialog'
import { useToast } from '@/components/admin/toast'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ui } from '@/lib/admin/ui-constants'
import type { Dictionary } from '@/lib/i18n'

type Advertiser = {
  id: string
  companyName: string | null
  contactName: string | null
  email: string | null
  phone: string | null
  totalCampaigns: number
}

export function AdvertiserActions({ advertiser, copy }: { advertiser: Advertiser; copy: Dictionary['admin']['ads'] }) {
  const { run, loading } = useAdminMutation()
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  // Edit form state
  const [companyName, setCompanyName] = useState(advertiser.companyName ?? '')
  const [contactName, setContactName] = useState(advertiser.contactName ?? '')
  const [email, setEmail] = useState(advertiser.email ?? '')
  const [phone, setPhone] = useState(advertiser.phone ?? '')

  async function handleEdit() {
    const ok = await run(
      () => updateAdvertiser(advertiser.id, { companyName, contactName, email, phone: phone || undefined }),
      copy.saved,
    )
    if (ok) setEditOpen(false)
  }

  async function handleDelete() {
    const ok = await run(() => deleteAdvertiser(advertiser.id), copy.deleted)
    if (ok) setDeleteOpen(false)
  }

  return (
    <>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={loading}
          onClick={() => {
            setCompanyName(advertiser.companyName ?? '')
            setContactName(advertiser.contactName ?? '')
            setEmail(advertiser.email ?? '')
            setPhone(advertiser.phone ?? '')
            setEditOpen(true)
          }}
          className="rounded-md border border-border px-2 py-1 text-xs disabled:opacity-50 hover:bg-accent transition-colors"
        >
          {copy.edit}
        </button>
        <button
          type="button"
          disabled={loading || advertiser.totalCampaigns > 0}
          onClick={() => setDeleteOpen(true)}
          className="rounded-md border border-destructive/40 px-2 py-1 text-xs text-destructive disabled:opacity-50"
        >
          {copy.delete}
        </button>
      </div>

      {/* Edit dialog — replaces 3× window.prompt */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.edit}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.companyName}</span>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} className={ui.input} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.contactName}</span>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} className={ui.input} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.email}</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={ui.input} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.phone}</span>
              <input value={phone} onChange={(e) => setPhone(e.target.value)} className={ui.input} />
            </label>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setEditOpen(false)} className={ui.btnSecondary} disabled={loading}>
              {copy.cancel}
            </button>
            <button type="button" onClick={handleEdit} className={ui.btnPrimary} disabled={loading}>
              {loading ? '…' : copy.saved}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm — replaces window.confirm */}
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={copy.deleteAdvertiserConfirm}
        description=""
        confirmLabel={copy.delete}
        cancelLabel={copy.cancel}
        onConfirm={handleDelete}
        loading={loading}
        tone="danger"
      />
    </>
  )
}
