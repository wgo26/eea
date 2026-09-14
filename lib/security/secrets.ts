import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time secret comparison (audit P1 §2.6).
 *
 * Every bearer check in this app compared with `!==`, which short-circuits on
 * the first differing byte and therefore leaks the secret one byte at a time to
 * an attacker who can measure response timing across many requests. These
 * helpers compare in constant time and normalize the "wrong shape" paths so
 * they cost the same as the success path.
 *
 * Node-only (uses `node:crypto`); import from Node route handlers and server
 * code, never from `proxy.ts`/middleware or a client component.
 */

/**
 * Length-independent, timing-safe string equality.
 *
 * `timingSafeEqual` throws when buffer lengths differ, so the length check is
 * unavoidable — but it is hoisted out and paired with a self-comparison so the
 * mismatch path still performs a full-width comparison instead of returning
 * early. Secret lengths are treated as non-secret (they are fixed constants in
 * practice, and length is leaked by the header itself anyway).
 */
export function safeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    timingSafeEqual(aBuf, aBuf);
    return false;
  }
  return timingSafeEqual(aBuf, bBuf);
}

/**
 * True when `header` is a well-formed `Bearer <secret>` for `secret`.
 * Returns false when either side is absent, so an unset secret can never
 * authenticate a caller (the caller decides whether unset means 500 or 401).
 */
export function bearerMatches(
  header: string | null | undefined,
  secret: string | null | undefined,
): boolean {
  if (!header || !secret) return false;
  const prefix = "Bearer ";
  if (!header.startsWith(prefix)) {
    // Compare something of equal width so the prefix failure is not a fast path.
    safeEqualString(header, prefix + secret);
    return false;
  }
  return safeEqualString(header.slice(prefix.length).trim(), secret);
}