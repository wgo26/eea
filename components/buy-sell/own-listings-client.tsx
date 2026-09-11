'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, RotateCcw, Tag, Trash2 } from 'lucide-react';
import { markOwnListingSold, removeOwnListing, renewOwnListing } from '@/lib/account/listings-actions';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { formatPrice, type Dictionary, type Locale } from '@/lib/i18n';
import { localePath } from '@/lib/i18n/urls';
import type { OwnListing } from '@/lib/queries/buy-sell';

/**
 * Seller's "manage my listing" surface (P1-1c): sold / renew / remove on
 * their own rows, no staff ticket needed. Removed listings note the staff
 * restore path instead of dead-ending.
 */
export function OwnListingsClient({
  initial,
  dict,
  locale,
}: {
  initial: OwnListing[];
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.buySell;
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ id: string; action: 'sold' | 'renew' | 'remove' } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runAction() {
    if (!confirm) return;
    const { id, action } = confirm;
    setBusyId(id);
    setError(null);
    const result =
      action === 'sold'
        ? await markOwnListingSold(id)
        : action === 'renew'
          ? await renewOwnListing(id)
          : await removeOwnListing(id);
    setBusyId(null);
    setConfirm(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems((prev) =>
      action === 'remove' ? prev.filter((l) => l.id !== id) : prev.map((l) => (l.id === id ? { ...l, listingStatus: action === 'sold' ? 'sold' : 'active' } : l)),
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">{t.emptyListings}</p>
        <Link
          href={localePath(locale, '/submit/buy-sell')}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t.postOne}
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <p className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p> : null}
      <ul className="space-y-3">
        {items.map((l) => {
          const isActive = l.listingStatus === 'active';
          const busy = busyId === l.id;
          return (
            <li key={l.id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{l.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {formatPrice(l.price, l.currency, locale)}
                    <span className="mx-1.5">·</span>
                    <span className={isActive ? 'font-medium text-emerald-600' : undefined}>{l.listingStatus}</span>
                    {l.expiresAt ? (
                      <span>
                        <span className="mx-1.5">·</span>
                        {t.expiresOn} {new Date(l.expiresAt).toLocaleDateString()}
                      </span>
                    ) : null}
                  </p>
                </div>
                <Link
                  href={localePath(locale, `/buy-sell/${l.id}`)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-link hover:underline"
                >
                  {t.viewListing}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {isActive ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirm({ id: l.id, action: 'sold' })}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
                  >
                    <Tag className="h-3.5 w-3.5" aria-hidden />
                    {t.markAsSold}
                  </button>
                ) : l.listingStatus !== 'removed' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirm({ id: l.id, action: 'renew' })}
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    {t.renewListing}
                  </button>
                ) : null}
                {l.listingStatus !== 'removed' ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirm({ id: l.id, action: 'remove' })}
                    className="inline-flex items-center gap-1.5 rounded-md border border-destructive/40 px-2.5 py-1.5 text-xs text-destructive hover:bg-destructive/5 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                    {t.removeListing}
                  </button>
                ) : (
                  <span className="text-xs text-muted-foreground">{t.listingWithdrawn}</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => { if (!open) setConfirm(null); }}
        title={confirm?.action === 'sold' ? t.markAsSold : confirm?.action === 'renew' ? t.renewListing : t.removeListing}
        description={confirm?.action === 'sold' ? t.markAsSoldConfirm : confirm?.action === 'renew' ? t.renewConfirm : t.removeListingConfirm}
        confirmLabel={confirm?.action === 'sold' ? t.markAsSold : confirm?.action === 'renew' ? t.renewListing : t.removeListing}
        cancelLabel={dict.common.back}
        onConfirm={runAction}
        loading={busyId !== null}
        tone={confirm?.action === 'remove' ? 'danger' : 'default'}
      />
    </div>
  );
}
