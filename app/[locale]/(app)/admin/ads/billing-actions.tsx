'use client'

import { useState } from 'react'
import { Banknote, FileText } from 'lucide-react'
import { markAdCampaignPaid, setAdCampaignInvoice, voidAdCampaignInvoice } from '@/lib/admin/actions/ads'
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

const BADGE: Record<string, string> = {
  paid: 'bg-emerald-500/15 text-emerald-600',
  invoiced: 'bg-amber-500/15 text-amber-600',
  unpaid: 'bg-muted text-muted-foreground',
}

/**
 * W15 — the ad-sale loop in one row: quote (rate card) → invoice reference →
 * paid, plus a void path for corrections. Money moves out-of-band in this
 * market, so these buttons exist to make the *record* auditable — every
 * transition is written to moderation_log by the server action.
 */
export function BillingActions({ campaign, copy }: { campaign: AdCampaignRow; copy: Copy }) {
  const { run, loading } = useAdminMutation()
  const [invoiceOpen, setInvoiceOpen] = useState(false)
  const [paidOpen, setPaidOpen] = useState(false)
  const [voidOpen, setVoidOpen] = useState(false)
  const [reference, setReference] = useState(campaign.invoiceReference ?? '')
  const [amount, setAmount] = useState(
    campaign.agreedPrice != null ? String(campaign.agreedPrice) : '',
  )

  const status = campaign.paymentStatus ?? 'unpaid'
  const badgeClass = BADGE[status] ?? BADGE.unpaid
  const badgeLabel =
    status === 'paid' ? copy.paymentPaid : status === 'invoiced' ? copy.paymentInvoiced : copy.paymentUnpaid

  function openInvoice() {
    setReference(campaign.invoiceReference ?? '')
    setAmount(campaign.agreedPrice != null ? String(campaign.agreedPrice) : '')
    setInvoiceOpen(true)
  }

  async function handleInvoice() {
    const trimmed = reference.trim()
    const parsed = amount.trim() !== '' ? Number(amount) : null
    const ok = await run(
      () => setAdCampaignInvoice(campaign.id, { reference: trimmed, amount: parsed }),
      copy.invoiceRecorded,
    )
    if (ok) setInvoiceOpen(false)
  }

  async function handlePaid() {
    const ok = await run(() => markAdCampaignPaid(campaign.id), copy.markedPaid)
    if (ok) setPaidOpen(false)
  }

  async function handleVoid() {
    const ok = await run(() => voidAdCampaignInvoice(campaign.id), copy.invoiceVoided)
    if (ok) setVoidOpen(false)
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${badgeClass}`} title={copy.paymentStatus}>
          {badgeLabel}
        </span>
        {status === 'paid' ? null : (
          <button
            type="button"
            onClick={openInvoice}
            className={`${ui.btnSm} border border-border bg-background text-foreground hover:bg-accent`}
          >
            <FileText className="mr-1 h-3.5 w-3.5" aria-hidden />
            {copy.recordInvoice}
          </button>
        )}
        {status === 'invoiced' ? (
          <button
            type="button"
            onClick={() => setPaidOpen(true)}
            className={`${ui.btnSm} bg-primary text-primary-foreground hover:bg-primary/90`}
          >
            <Banknote className="mr-1 h-3.5 w-3.5" aria-hidden />
            {copy.markPaid}
          </button>
        ) : null}
        {status === 'unpaid' ? null : (
          <button
            type="button"
            onClick={() => setVoidOpen(true)}
            className={`${ui.btnSm} text-muted-foreground hover:text-destructive`}
          >
            {copy.voidInvoice}
          </button>
        )}
      </div>
      {campaign.invoiceReference ? (
        <p className="mt-1 text-right text-xs text-muted-foreground">
          {copy.invoiceReference}: <span className="tabular-nums">{campaign.invoiceReference}</span>
        </p>
      ) : null}

      <Dialog open={invoiceOpen} onOpenChange={setInvoiceOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.recordInvoiceTitle}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">{copy.recordInvoiceHint}</p>
          <div className="grid gap-3">
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.invoiceReference}</span>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                maxLength={64}
                placeholder={copy.invoiceReferencePlaceholder}
                className={ui.input}
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.invoiceAmount}</span>
              <input
                type="number"
                min="0"
                step="1"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className={ui.input}
              />
            </label>
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setInvoiceOpen(false)} className={ui.btnSecondary} disabled={loading}>
              {copy.cancel}
            </button>
            <button
              type="button"
              onClick={handleInvoice}
              className={ui.btnPrimary}
              disabled={loading || reference.trim().length < 3}
            >
              {loading ? '…' : copy.recordInvoice}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={paidOpen}
        onOpenChange={setPaidOpen}
        title={copy.markPaid}
        description={copy.markPaidConfirm}
        confirmLabel={copy.markPaid}
        cancelLabel={copy.cancel}
        onConfirm={handlePaid}
        loading={loading}
        tone="default"
      />

      <ConfirmDialog
        open={voidOpen}
        onOpenChange={setVoidOpen}
        title={copy.voidInvoice}
        description={copy.voidInvoiceConfirm}
        confirmLabel={copy.voidInvoice}
        cancelLabel={copy.cancel}
        onConfirm={handleVoid}
        loading={loading}
      />
    </>
  )
}
