'use client';

import { useState } from 'react';
import Link from 'next/link';
import { BookmarkX } from 'lucide-react';
import { removeSaved, type SavedItem } from '@/lib/saves/actions';
import { localePath } from '@/lib/i18n/urls';
import type { Dictionary, Locale } from '@/lib/i18n';

function itemHref(item: SavedItem, locale: Locale): string {
  const key = item.slug ?? item.contentItemId;
  switch (item.type) {
    case 'photo_story':
      return localePath(locale, `/photo-stories/${key}`);
    case 'culture':
      return localePath(locale, `/culture/${key}`);
    case 'notice':
      return localePath(locale, `/notices/${item.contentItemId}`);
    case 'listing':
      return localePath(locale, `/buy-sell/${item.contentItemId}`);
    default:
      return localePath(locale, `/news/${key}`);
  }
}

/**
 * Reading list: the user's saved stories + listings, newest first, with
 * per-row remove. Saved items whose content was deleted simply resolve to
 * a dead link — removal keeps the list clean.
 */
export function SavedListClient({
  initial,
  dict,
  locale,
}: {
  initial: SavedItem[];
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.account.saved;
  const [items, setItems] = useState(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function handleRemove(contentItemId: string) {
    setBusyId(contentItemId);
    const result = await removeSaved(contentItemId);
    setBusyId(null);
    if (result.ok) setItems((prev) => prev.filter((i) => i.contentItemId !== contentItemId));
  }

  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed p-8 text-center">
        <p className="text-sm text-muted-foreground">{t.empty}</p>
        <Link
          href={localePath(locale, '/')}
          className="mt-3 inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t.browse}
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li
          key={item.contentItemId}
          className="flex items-center gap-3 rounded-2xl border bg-card p-3"
        >
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt=""
              className="h-14 w-14 shrink-0 rounded-xl object-cover bg-muted"
            />
          ) : (
            <div className="h-14 w-14 shrink-0 rounded-xl bg-muted" />
          )}
          <Link href={itemHref(item, locale)} className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold hover:underline">{item.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{item.type.replace(/_/g, ' ')}</p>
          </Link>
          <button
            type="button"
            onClick={() => handleRemove(item.contentItemId)}
            disabled={busyId === item.contentItemId}
            aria-label={t.remove}
            title={t.remove}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-destructive disabled:opacity-50"
          >
            <BookmarkX className="h-4 w-4" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
