'use client'

import { useState } from 'react'
import { expireListing, relistListing, moderateListing } from '@/lib/admin/actions'
import { useToast } from '@/components/admin/toast'
import { ConfirmDialog } from '@/components/admin/confirm-dialog'
import type { Dictionary } from '@/lib/i18n'
import type { AdminListingRow } from '@/lib/admin/queries'

type Copy = Dictionary['admin']['listingsAdmin']
type CommonCopy = Dictionary['admin']['common']

const ghostBtn =
  'inline-flex items-center rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50'

/**
 * Listing lifecycle controls (Phase 3): expire, relist (30-day window), mark
 * sold and remove. Buttons render per the current listing status so an
 * active listing offers expire/sold/remove, a lapsed one offers relist.
 */
export function ListingActions({ listing, copy, common }: { listing: AdminListingRow; copy: Copy; common: CommonCopy }) {
  const { addToast } = useToast()
  const [busy, setBusy] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)

  async function run(
    action: () => Promise<{ ok: true } | { ok: false; error: string }>,
    toast: string,
  ) {
    setBusy(true)
    const result = await action()
    setBusy(false)
    if (result.ok) addToast(toast, 'success')
    else addToast(result.error, 'error')
  }

  async function handleRemove() {
    setBusy(true)
    const result = await moderateListing(listing.contentItemId, 'remove')
    setBusy(false)
    if (result.ok) {
      setConfirmRemove(false)
      addToast(copy.toastRemoved, 'success')
    } else addToast(result.error, 'error')
  }

  const isActive = listing.listingStatus === 'active'

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
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
    </div>
  )
}