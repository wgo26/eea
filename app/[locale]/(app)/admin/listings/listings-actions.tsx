'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { expireListing, relistListing, moderateListing, updateListing, deleteContentItem } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import { ActionMenu, ActionMenuTrigger } from '@/components/admin/action-menu'
import type { ActionMenuEntry } from '@/components/admin/action-menu'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { localePath } from '@/lib/i18n/urls'
import type { Dictionary, Locale } from '@/lib/i18n'
import type { AdminListingRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['listingsAdmin']
type CommonCopy = Dictionary['admin']['common']

const ghostBtn =
  'inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50'
const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary'

/**
 * Listing lifecycle controls (Phase 3): expire, relist (30-day window), mark
 * sold and remove — plus the full details dialog (price, seller, contacts)
 * so the manager rarely needs the content-edit hop.
 */
export function ListingActions({ listing, copy, common, locale, canDelete }: { listing: AdminListingRow; copy: Copy; common: CommonCopy; locale: Locale; canDelete: boolean }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [price, setPrice] = useState(listing.price != null ? String(listing.price) : '')
  const [currency, setCurrency] = useState(listing.currency ?? '')
  const [sellerName, setSellerName] = useState(listing.sellerName ?? '')
  const [contactPhone, setContactPhone] = useState(listing.contactPhone ?? '')
  const [contactEmail, setContactEmail] = useState(listing.contactEmail ?? '')
  const [whatsappNumber, setWhatsappNumber] = useState(listing.whatsappNumber ?? '')

  async function run(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    toast: string,
  ) {
    setBusy(true)
    const result = await action()
    setBusy(false)
    if (result.ok) {
      addToast(toast, 'success')
      router.refresh()
    }
    else addToast(result.error, 'error')
  }

  async function handlePermanentDelete() {
    setBusy(true)
    const result = await deleteContentItem(listing.contentItemId)
    setBusy(false)
    if (result.ok) {
      setConfirmDelete(false)
      addToast(copy.toastDeleted, 'success')
      router.refresh()
    } else addToast(result.error, 'error')
  }

  async function handleRemove() {
    setBusy(true)
    const result = await moderateListing(listing.contentItemId, 'remove')
    setBusy(false)
    if (result.ok) {
      setConfirmRemove(false)
      // Remove only soft-archives the listing — relist is the exact inverse
      // (status back to active, is_archived cleared, republished), so offer
      // an inline undo in the toast instead of a permanent-sounding message.
      addToast(copy.toastRemoved, 'success', {
        duration: 8000,
        action: {
          label: common.undo,
          onSelect: () => {
            void (async () => {
              const relisted = await relistListing(listing.contentItemId)
              addToast(relisted.ok ? copy.toastRelisted : relisted.error, relisted.ok ? 'success' : 'error')
              if (relisted.ok) router.refresh()
            })()
          },
        },
      })
      router.refresh()
    } else addToast(result.error, 'error')
  }

  function openDetailsEdit() {
    setPrice(listing.price != null ? String(listing.price) : '')
    setCurrency(listing.currency ?? '')
    setSellerName(listing.sellerName ?? '')
    setContactPhone(listing.contactPhone ?? '')
    setContactEmail(listing.contactEmail ?? '')
    setWhatsappNumber(listing.whatsappNumber ?? '')
    setDetailsOpen(true)
  }

  async function handleDetailsSave() {
    if (price.trim() !== '' && Number.isNaN(Number(price))) {
      addToast(copy.priceLabel ?? 'Enter a valid price.', 'error')
      return
    }
    if (contactEmail.trim() !== '' && !/^\S+@\S+\.\S+$/.test(contactEmail.trim())) {
      addToast(copy.invalidEmail ?? 'Enter a valid email.', 'error')
      return
    }
    setBusy(true)
    const result = await updateListing(listing.contentItemId, {
      price: price.trim() === '' ? null : Number(price),
      currency: currency.trim() || null,
      sellerName: sellerName.trim() || null,
      contactPhone: contactPhone.trim() || null,
      contactEmail: contactEmail.trim() || null,
      whatsappNumber: whatsappNumber.trim() || null,
    })
    setBusy(false)
    if (result.ok) {
      setDetailsOpen(false)
      addToast(copy.toastDetailsSaved, 'success')
      router.refresh()
    } else addToast(result.error, 'error')
  }

  const isActive = listing.listingStatus === 'active'

  // Lifecycle actions live in a compact dropdown so the row fits on screen —
  // previously five wrapping buttons pushed the actions column off viewport.
  const menuItems: ActionMenuEntry[] = [
    {
      label: copy.editContent,
      onSelect: () => router.push(`${localePath(locale, '/admin/content')}?edit=${listing.contentItemId}`),
      disabled: busy,
    },
    { separator: true },
  ]
  if (isActive) {
    menuItems.push({
      label: copy.expire,
      onSelect: () => run(() => expireListing(listing.contentItemId), copy.toastExpired),
      disabled: busy,
    })
  }
  if (!isActive && listing.listingStatus !== 'removed') {
    menuItems.push({
      label: copy.relist,
      onSelect: () => run(() => relistListing(listing.contentItemId), copy.toastRelisted),
      disabled: busy,
    })
  }
  if (isActive) {
    menuItems.push({
      label: copy.markSold,
      onSelect: () => run(() => moderateListing(listing.contentItemId, 'sold'), copy.toastSold),
      disabled: busy,
    })
  }
  if (listing.listingStatus !== 'removed') {
    menuItems.push({
      label: copy.remove,
      onSelect: () => setConfirmRemove(true),
      disabled: busy,
      tone: 'danger',
    })
  }
  // Hard delete is admin-only and irreversible — Remove (soft, undoable)
  // stays the default; this is the escape hatch for spam/test rows.
  if (canDelete) {
    menuItems.push({
      label: copy.deletePermanent,
      onSelect: () => setConfirmDelete(true),
      disabled: busy,
      tone: 'danger',
    })
  }

  return (
    <div className="flex items-center justify-end gap-1.5 flex-nowrap whitespace-nowrap">
      <button type="button" onClick={openDetailsEdit} disabled={busy} className={`${ghostBtn} shrink-0`}>
        {copy.editDetails}
      </button>
      <ActionMenu trigger={<ActionMenuTrigger label={copy.editDetails} />} items={menuItems} />
      <ConfirmDialog
        open={confirmRemove}
        onOpenChange={setConfirmRemove}
        title={copy.removeConfirmTitle}
        description={copy.removeConfirmBody}
        confirmLabel={copy.remove}
        cancelLabel={common.cancel}
        loading={busy}
        onConfirm={handleRemove}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={copy.deletePermanentTitle}
        description={copy.deletePermanentBody}
        confirmLabel={copy.deletePermanent}
        cancelLabel={common.cancel}
        loading={busy}
        onConfirm={handlePermanentDelete}
      />

      {/* Listing details — price, seller and contacts live on the extension row. */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.editDetails}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{copy.priceLabel}</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className={inputCls}
                />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{copy.currencyLabel}</span>
                <input
                  value={currency}
                  maxLength={3}
                  placeholder="XAF"
                  onChange={(e) => setCurrency(e.target.value)}
                  className={inputCls}
                />
              </label>
            </div>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.sellerName}</span>
              <input value={sellerName} onChange={(e) => setSellerName(e.target.value)} className={inputCls} />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-medium text-muted-foreground">{copy.contactPhone}</span>
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} className={inputCls} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{copy.contactEmail}</span>
                <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} className={inputCls} />
              </label>
              <label className="space-y-1">
                <span className="text-xs font-medium text-muted-foreground">{copy.whatsappNumber}</span>
                <input value={whatsappNumber} onChange={(e) => setWhatsappNumber(e.target.value)} className={inputCls} />
              </label>
            </div>
            {listing.sellerVerified ? (
              <p className="text-xs font-medium text-emerald-600">{copy.verifiedSeller}</p>
            ) : null}
          </div>
          <DialogFooter>
            <button type="button" onClick={() => setDetailsOpen(false)} disabled={busy} className={ghostBtn}>
              {common.cancel}
            </button>
            <button
              type="button"
              onClick={handleDetailsSave}
              disabled={busy}
              className="inline-flex items-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {busy ? '…' : common.save}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}