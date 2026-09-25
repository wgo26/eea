/**
 * Local draft autosave for the content form.
 *
 * The form is long, and closing the dialog with a half-written story used to
 * cost all of it: `dirty` + `reset` actively encouraged discarding. This stores
 * the unsaved values in `localStorage` under a per-item key, so a reload, a
 * mis-clicked close, or a dropped connection costs at most the last debounce
 * window. No server, no schema, no migration.
 *
 * Rules:
 *  - A draft is only *offered*, never applied silently: an editor with two
 *    dialogs open must not watch one overwrite the other's form.
 *  - A draft older than the saved row it belongs to is stale and dropped, which
 *    is why `savedAt` is compared rather than mere existence.
 *  - Everything is best-effort. Private-mode and quota failures must never break
 *    saving a post, so every call swallows and reports nothing.
 */

export type StoredDraft<T> = {
  /** Epoch ms of the write — used to decide which of two drafts is newer. */
  savedAt: number;
  values: T;
};

const KEY_PREFIX = "eea:content-draft:";

export function draftKey(itemId: string | null | undefined): string {
  return `${KEY_PREFIX}${itemId ?? "new"}`;
}

/** Every draft key, for the list/restore affordances. */
export function listDraftKeys(storage?: Pick<Storage, "key" | "length"> | null): string[] {
  const store = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  if (!store) return [];
  const out: string[] = [];
  try {
    for (let i = 0; i < store.length; i++) {
      const k = store.key(i);
      if (k?.startsWith(KEY_PREFIX)) out.push(k);
    }
  } catch {
    return out;
  }
  return out;
}

export function readDraft<T>(key: string, storage?: Storage | null): StoredDraft<T> | null {
  const store = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraft<T>;
    if (!parsed || typeof parsed.savedAt !== "number" || parsed.values == null) return null;
    return parsed;
  } catch {
    // Corrupt or unparseable is indistinguishable from absent, safely.
    return null;
  }
}

export function writeDraft<T>(key: string, values: T, storage?: Storage | null): boolean {
  const store = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  if (!store) return false;
  try {
    store.setItem(key, JSON.stringify({ savedAt: Date.now(), values } satisfies StoredDraft<T>));
    return true;
  } catch {
    // Quota exceeded / private mode: autosave is an optimisation, never a
    // dependency of saving the post.
    return false;
  }
}

export function clearDraft(key: string, storage?: Storage | null): void {
  const store = storage ?? (typeof localStorage !== "undefined" ? localStorage : null);
  try {
    store?.removeItem(key);
  } catch {
    /* best-effort */
  }
}

/**
 * True when a stored draft is worth offering: it is newer than `newerThanMs`
 * (the row's last save) and not abandoned (a draft from weeks ago is noise, not
 * a recovery).
 */
export function isDraftWorthRestoring<T>(
  draft: StoredDraft<T> | null,
  newerThanMs = 0,
  maxAgeMs = 1000 * 60 * 60 * 24 * 7,
  now = Date.now(),
): draft is StoredDraft<T> {
  if (!draft) return false;
  if (draft.savedAt <= newerThanMs) return false;
  return now - draft.savedAt <= maxAgeMs;
}
