import "server-only";

/**
 * Phase 4.1 — pre-paint locale bootstrap for the static root layout.
 *
 * The root layout must not read request-time APIs (headers()/cookies()) —
 * that would force dynamic rendering on every route and defeat ISR. Instead
 * the <html> shell is rendered with the default lang and this script (loaded
 * beforeInteractive, mirroring the theme-init pattern) corrects `lang` from
 * the URL prefix before first paint. proxy.ts guarantees every user-facing
 * URL is locale-prefixed, so the pathname is the authoritative locale source.
 */
export const localeInitScript = `
try {
  var m = location.pathname.match(/^\\/(en|fr)(?=\\/|$)/);
  if (m) document.documentElement.lang = m[1];
} catch (e) {}
`;
