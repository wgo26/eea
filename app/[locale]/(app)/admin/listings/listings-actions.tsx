'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { expireListing, relistListing, moderateListing, updateListing } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
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
 * sold and remove — plus the quick price edit and the content-edit deep link.
 */
export function ListingActions({ listing, copy, common, locale }: { listing: AdminListingRow; copy: Copy; common: CommonCopy; locale: Locale }) {
  const { addToast } = useToast()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const [priceOpen, setPriceOpen] = useState(false)
  const [price, setPrice] = useState(listing.price != null ? String(listing.price) : '')
  const [currency, setCurrency] = useState(listing.currency ?? '')

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

  async function handleRemove() {
    setBusy(true)
    const result = await moderateListing(listing.contentItemId, 'remove')
    setBusy(false)
    if (result.ok) {
      setConfirmRemove(false)
      addToast(copy.toastRemoved, 'success')
      router.refresh()
    } else addToast(result.error, 'error')
  }

  function openPriceEdit() {
    setPrice(listing.price != null ? String(listing.price) : '')
    setCurrency(listing.currency ?? '')
    setPriceOpen(true)
  }

  async function handlePriceSave() {
    if (price.trim() !== '' && Number.isNaN(Number(price))) {
      addToast(copy.priceLabel ?? 'Enter a valid price.', 'error')
      return
    }
    setBusy(true)
    const result = await updateListing(listing.contentItemId, {
      price: price.trim() === '' ? null : Number(price),
      currency: currency.trim() || null,
    })
    setBusy(false)
    if (result.ok) {
      setPriceOpen(false)
      addToast(copy.toastPriceSaved, 'success')
      router.refresh()
    } else addToast(result.error, 'error')
  }

  const isActive = listing.listingStatus === 'active'

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <Link
        href={`${localePath(locale, '/admin/content')}?edit=${listing.contentItemId}`}
        className="text-xs text-primary hover:underline"
      >
        {copy.editContent}
      </Link>
      <button type="button" onClick={openPriceEdit} disabled={busy} className={ghostBtn}>
        {copy.editPrice}
      </button>
      {isActive && (
        <button
          type="button"
          onClick={() => run(() => expireListing(listing.contentItemId), copy.toastExpired)}
          disabled={busy}
          className={ghostBtn + ' hover:text-amber-700 hover:border-amber-400'}
        >
          {copy.expire}
        </button>
      )}
      {!isActive && listing.listingStatus !== 'removed' && (
        <button
          type="button"
          onClick={() => run(() => relistListing(listing.contentItemId), copy.toastRelisted)}
          disabled={busy}
          className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
        >
          {copy.relist}
        </button>
      )}
      {isActive && (
        <button
          type="button"
          onClick={() => run(() => moderateListing(listing.contentItemId, 'sold'), copy.toastSold)}
          disabled={busy}
          className={ghostBtn}
        >
          {copy.markSold}
        </button>
      )}
      {listing.listingStatus !== 'removed' && (
        <button
          type="button"
          onClick={() => setConfirmRemove(true)}
          disabled={busy}
          className={ghostBtn + ' hover:text-destructive hover:border-destructive/50'}
        >
          {copy.remove}
        </button>
      )}
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

      {/* Quick price edit — price/currency live on the listings extension row. */}
      <Dialog open={priceOpen} onOpenChange={setPriceOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{copy.editPrice}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
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
          <DialogFooter>
            <button type="button" onClick={() => setPriceOpen(false)} disabled={busy} className={ghostBtn}>
              {common.cancel}
            </button>
            <button
              type="button"
              onClick={handlePriceSave}
              disabled={busy || (price.trim() === '' && !currency.trim())}
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