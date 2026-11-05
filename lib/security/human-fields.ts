/**
 * Shared form-field names for the human-verification gate.
 *
 * A deliberately standalone module — no `node:` crypto, no `server-only`,
 * no logger — so a client component can import it without pulling server
 * code into the browser bundle. The three consumers must never drift apart:
 *   - the client gate that writes the token (`components/security/human-challenge.tsx`),
 *   - the server facade that reads it (`lib/security/human-gate.ts`),
 *   - the static (no-JS) mirror fields in server-rendered forms
 *     (`app/[locale]/(public)/digest/page.tsx`).
 */

/** Field the proof-of-work gate writes the solved token into (mode: `pow`). */
export const POW_FIELD = "pow-response";

/**
 * Legacy Cloudflare field name, kept verbatim so `mode=turnstile` reuses the
 * previous widget and its server verifier without a single client change.
 */
export const TURNSTILE_FIELD = "cf-turnstile-response";

/** Maps a resolved mode to the field its token rides in. */
export function humanFieldForMode(mode: string): string {
  return mode === "turnstile" ? TURNSTILE_FIELD : POW_FIELD;
}
