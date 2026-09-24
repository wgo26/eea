/**
 * Stable short hash for the site-wide announcement banner, so a changed
 * announcement reappears after dismissal.
 *
 * Pure string hashing (no browser APIs) in a server-safe module: the public
 * shell computes the id during SSR/pre-rendering while the client banner
 * reads the dismissal from localStorage. It previously lived in the
 * `"use client"` announcement-banner module, which made the server-side call
 * a client-reference invocation and failed the production build during
 * static pre-rendering.
 */
export function announcementId(text: string, url: string | null): string {
  let hash = 5381
  const input = `${text}::${url ?? ''}`
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0
  }
  return hash.toString(36)
}
