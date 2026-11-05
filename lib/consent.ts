/**
 * Cookie-consent flag — one definition, three readers.
 *
 * `components/system/cookie-banner.tsx` writes it, the banner itself re-reads it
 * (so the dialog disappears), and the third-party ad renderer
 * (`components/ads/network-ad.tsx`) reads it before loading any network tag.
 * Before this module each consumer kept its own copy of the storage key, which
 * is how a "declined" reader can still end up with ad scripts.
 *
 * Client-only in practice: every function touches `localStorage`/`window`, so
 * callers must run inside an effect (never during server render).
 */
export const CONSENT_STORAGE_KEY = 'eea-consent'

/** Fired on `window` after the banner records a choice. */
export const CONSENT_CHANGE_EVENT = 'eea-consent-change'

export type ConsentValue = 'accepted' | 'declined'

/** `null` means "not answered yet" — the gated default. */
export function readConsent(): ConsentValue | null {
  try {
    const raw = localStorage.getItem(CONSENT_STORAGE_KEY)
    return raw === 'accepted' || raw === 'declined' ? raw : null
  } catch {
    // Storage blocked (private mode, embedded webview): treat as unanswered.
    return null
  }
}

export function writeConsent(value: ConsentValue): void {
  try {
    localStorage.setItem(CONSENT_STORAGE_KEY, value)
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
  } catch {
    /* storage unavailable — the banner still hides for this session */
  }
}

/** Reopen the consent prompt after a reader changes their choice. */
export function clearConsent(): void {
  try {
    localStorage.removeItem(CONSENT_STORAGE_KEY)
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT))
  } catch {
    /* storage unavailable — no prior preference can be changed persistently */
  }
}

/**
 * Subscribe to consent changes from this tab (`CONSENT_CHANGE_EVENT`) and from
 * other tabs (`storage`). Returns the unsubscribe function.
 */
export function subscribeConsent(listener: () => void): () => void {
  window.addEventListener(CONSENT_CHANGE_EVENT, listener)
  window.addEventListener('storage', listener)
  return () => {
    window.removeEventListener(CONSENT_CHANGE_EVENT, listener)
    window.removeEventListener('storage', listener)
  }
}