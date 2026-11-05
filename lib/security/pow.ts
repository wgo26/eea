import { createHmac, createHash, timingSafeEqual, randomBytes } from "node:crypto";

import { logger } from "@/lib/observability/logger";

/**
 * Proof-of-work human gate (server side) — the bot wall behind every public
 * form, replacing third-party CAPTCHA with a same-origin challenge.
 *
 * ## Protocol
 *   issue  → payload   = base64url(JSON{ v, salt, bits, exp })
 *            token    = `${payload}.${base64url(HMAC-SHA256(POW key, payload))}`
 *   solve  → the client enumerates n = 0,1,2… until sha256(`${salt}${n}`)
 *            has `bits` leading zero bits; the solved token is
 *            `${token}.${nonce}` (POW_SOLVER).
 *   verify → HMAC (constant-time), `exp` still in the future, digest
 *            re-check, then one-time consumption through the durable
 *            `check_rate_limit` table (migration 20260918000000) so a
 *            solution can never be replayed on a second submission.
 *
 * ## Why this instead of a hosted challenge
 *   - Zero extra network round-trips: the challenge is issued by the same
 *     server that verifies the form. Slow/metered connections solve it in
 *     a second or two of local CPU instead of waiting on a cross-origin
 *     widget and its iframe.
 *   - No third-party CDN to block: ad-blockers and restrictive ISPs cannot
 *     wall a submission off the way a remote challenge widget can.
 *   - No customer data touched: no IP reputation, no tracking, fingerprinting
 *     or beacon to any third party.
 * The honest trade-off is no bot *intelligence* — a script farm can buy the
 * same CPU. That is exactly what the layered defenses are for: honeypot,
 * durable per-IP rate limits and the Chief-managed IP blocklist wrap every
 * call site (`lib/security/human-gate.ts`).
 *
 * ## Failure posture (matches the Turnstile contract this replaces)
 *   - Missing key material in production → reject (fail-closed), so an env
 *     mistake can never silently disable bot protection on the live site.
 *     Non-production stays permissive so a bare local checkout keeps working;
 *     `POW_REQUIRE=1` rehearses the production posture.
 *   - Unsigned, expired, already-used or wrong-digest tokens → reject.
 *   - The HMAC key is `POW_HMAC_KEY` when set; otherwise it is derived from
 *     the service-role key (never exposed client-side), so no new secret
 *     must be provisioned for the gate to be live in every real environment.
 */

const TOKEN_VERSION = 1 as const;
/** A challenge is valid for ten minutes — long enough for a slow form fill. */
const TTL_MS = 10 * 60 * 1000;
/** 16 random bytes → `salt` always ends in ":" so salt+nonce is unambiguous. */
const SALT_BYTES = 16;

export type PowIssue = {
  /** `${payload}.${sig}` — everything before the solved nonce. */
  challenge: string;
  /** When the challenge stops verifying (epoch ms). */
  expiresAt: number;
};

export type PowVerifyOptions = {
  /** Injectable one-time consumer for tests; production path is the durable limiter. */
  consume?: (key: string, windowMs: number) => Promise<boolean>;
  /** Injectable clock for tests. */
  now?: () => number;
  /** Injectable env for tests. */
  env?: NodeJS.ProcessEnv;
};

export const POW_DIFFICULTY_DEFAULT = 16;
export const POW_DIFFICULTY_MIN = 8;
export const POW_DIFFICULTY_MAX = 24;

/** Difficulty from env, clamped: a bad value can neither trivialize nor wreck the gate. */
export function resolveDifficulty(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number.parseInt((env.POW_DIFFICULTY_BITS ?? "").trim(), 10);
  if (!Number.isFinite(raw)) return POW_DIFFICULTY_DEFAULT;
  return Math.min(POW_DIFFICULTY_MAX, Math.max(POW_DIFFICULTY_MIN, raw));
}

function publicKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const explicit = env.POW_HMAC_KEY?.trim();
  if (explicit) return explicit;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!serviceKey) return null;
  return createHmac("sha256", serviceKey).update("eea:pow-hmac:v1").digest("hex");
}

function digestHex(salt: string, nonce: string): string {
  return createHash("sha256").update(`${salt}${nonce}`, "utf8").digest("hex");
}

/** True when the hex digest starts with `bits` zero bits (pure, unit-tested). */
export function meetsDifficulty(digestStr: string, bits: number): boolean {
  for (let i = 0; i < bits; i++) {
    const nibble = parseInt(digestStr[Math.floor(i / 4)] ?? "f", 16);
    if ((nibble >> (3 - (i % 4))) & 1) return false;
  }
  return true;
}

/**
 * Issues a signed challenge. Returns null only when no key material exists
 * (callers treat null per surface: production fails closed).
 */
export function issuePowChallenge(
  env: NodeJS.ProcessEnv = process.env,
  now: () => number = Date.now,
): PowIssue | null {
  const key = publicKey(env);
  if (!key) return null;
  const salt = `${createHash("sha256").update(randomBytes(SALT_BYTES)).digest("hex")}:`;
  const payload = Buffer.from(
    JSON.stringify({
      v: TOKEN_VERSION,
      salt,
      bits: resolveDifficulty(env),
      exp: now() + TTL_MS,
    }),
    "utf8",
  ).toString("base64url");
  const sig = createHmac("sha256", key).update(payload).digest("base64url");
  return { challenge: `${payload}.${sig}`, expiresAt: now() + TTL_MS };
}

/**
 * Verifies a solved token. Every failure path is a plain `false` — no oracle
 * for which layer rejected. Single-use via the injected `consume` (or the
 * durable limiter): the first verification marks the signature consumed;
 * replays are denied.
 */
export async function verifyPowToken(
  token: string | null | undefined,
  options: PowVerifyOptions = {},
): Promise<boolean> {
  const now = options.now ?? Date.now;
  const env = options.env ?? process.env;

  const key = publicKey(env);
  if (!key) {
    if (env.NODE_ENV === "production" || env.POW_REQUIRE === "1") {
      logger.warn("pow", "rejected: no key material (fail-closed)");
      return false;
    }
    return true;
  }

  if (!token) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [payload, sig, nonce] = parts;

  let salt: string;
  let bits: number;
  let exp: number;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as {
      v?: unknown;
      salt?: unknown;
      bits?: unknown;
      exp?: unknown;
    };
    if (parsed.v !== TOKEN_VERSION) return false;
    if (typeof parsed.salt !== "string" || typeof parsed.bits !== "number" || typeof parsed.exp !== "number") {
      return false;
    }
    if (!parsed.salt.endsWith(":") || parsed.salt.length > 128) return false;
    if (!Number.isInteger(parsed.exp) || parsed.exp <= now()) return false;
    if (!Number.isInteger(parsed.bits) || parsed.bits < POW_DIFFICULTY_MIN || parsed.bits > POW_DIFFICULTY_MAX) {
      return false;
    }
    salt = parsed.salt;
    bits = parsed.bits;
    exp = parsed.exp;
  } catch {
    return false;
  }

  // Constant-time HMAC check: a forged payload must not be testable byte-by-byte.
  const expected = createHmac("sha256", key).update(payload).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(sig, "base64url");
  } catch {
    return false;
  }
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return false;
  }

  if (!/^\d{1,15}$/.test(nonce)) return false;
  if (!meetsDifficulty(digestHex(salt, nonce), bits)) return false;

  // One-time consumption. Fail-closed: if the limiter cannot answer, a
  // solution cannot be proven unused and the submission is refused.
  const consume =
    options.consume ??
    (async (limitKey: string, windowMs: number) => {
      const { checkRateLimitForKey } = await import("@/lib/security/rate-limit");
      return (await checkRateLimitForKey(limitKey, { max: 1, windowMs, policy: "fail-closed" })).ok;
    });
  const useKey = `pow:use:${createHash("sha256").update(provided).digest("hex").slice(0, 32)}`;
  const windowMs = Math.min(Math.max(exp - now(), 30_000), 15 * 60_000);
  return consume(useKey, windowMs);
}
