'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ExternalLink, Megaphone, RotateCcw } from 'lucide-react';
import { renewOwnNotice } from '@/lib/account/notices-actions';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { type Dictionary, type Locale } from '@/lib/i18n';
import { localePath } from '@/lib/i18n/urls';
import type { OwnNotice } from '@/lib/queries/notices';

/**
 * Notice owner's self-manage surface (parity with OwnListingsClient): renew
 * expired/expiring notices for 30 days, no staff ticket needed.
 */
export function OwnNoticesClient({
  initial,
  dict,
  locale,
}: {
  initial: OwnNotice[];
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.notices;
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runRenew() {
    if (!confirmId) return;
    setBusyId(confirmId);
    setError(null);
    const result = await renewOwnNotice(confirmId);
    setBusyId(null);
    setConfirmId(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setItems((prev) =>
      prev.map((n) =>
        n.id === confirmId
          ? { ...n, isActive: true, expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString() }
          : n,
      ),
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">{t.empty}</p>
        <Link
          href={localePath(locale, '/submit/notice')}
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
        {items.map((n) => {
          const busy = busyId === n.id;
          return (
            <li key={n.id} className="rounded-2xl border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold">{n.title}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    <span className={n.isActive ? 'font-medium text-emerald-600' : undefined}>
                      {n.isActive ? t.active : t.expired}
                    </span>
                    {n.expiresAt ? (
                      <span>
                        <span className="mx-1.5">·</span>
                        {t.expires} {new Date(n.expiresAt).toLocaleDateString()}
                      </span>
                    ) : (
                      <span>
                        <span className="mx-1.5">·</span>
                        {t.noExpiry}
                      </span>
                    )}
                  </p>
                </div>
                <Link
                  href={localePath(locale, `/notices/${n.id}`)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-link hover:underline"
                >
                  {t.backToNotices}
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {!n.isActive ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => setConfirmId(n.id)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                  >
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                    {t.renewNotice}
                  </button>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Megaphone className="h-3.5 w-3.5" aria-hidden />
                    {t.statusActive}
                  </span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <ConfirmDialog
        open={confirmId !== null}
        onOpenChange={(open) => { if (!open) setConfirmId(null); }}
        title={t.renewNotice}
        description={t.renewConfirm}
        confirmLabel={t.renewNotice}
        cancelLabel={dict.common.back}
        onConfirm={runRenew}
        loading={busyId !== null}
        tone="default"
      />
    </div>
  );
}
