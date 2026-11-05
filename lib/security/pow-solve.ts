/**
 * Proof-of-work solver (browser + Node webcrypto).
 *
 * Framework-free on purpose: `components/security/human-challenge.tsx` calls
 * it from the browser while `lib/security/pow.test.ts` runs the exact same
 * function under vitest, so the client's solution shape can never drift from
 * what the server verifier expects.
 *
 * The server signs `{ salt, bits, exp }` (see lib/security/pow.ts); the client
 * enumerates nonces n = 0,1,2… until `sha256(salt + n)` has `bits` leading
 * zero bits. Default difficulty (16 bits) averages 65,536 digests — roughly
 * 0.5–2s of local WebCrypto time on a mid-range phone, with zero network
 * round-trips, and the answer is worthless for anyone but the issuing server
 * (HMAC-bound, expiring, single-use).
 */

export type PowChallenge = {
  /** `${payload}.${sig}` verbatim from issuePowChallenge(). */
  challenge: string;
  /** Epoch ms at which the challenge stops verifying. */
  expiresAt: number;
};

/** The server's signed parameters, decoded client-side (HMAC not checked here). */
export type PowChallengeParams = {
  salt: string;
  bits: number;
  exp: number;
};

export class PowExpiredError extends Error {
  constructor() {
    super("Challenge expired before it could be solved.");
    this.name = "PowExpiredError";
  }
}

/** Decodes the signed payload; returns null when the shape is not challenge-like. */
export function decodePowChallenge(challenge: string): PowChallengeParams | null {
  const payload = challenge.split(".")[0];
  if (!payload) return null;
  try {
    // base64url → base64 with explicit padding: `atob` rejects a length whose
    // remainder is 1 mod 4, and the server emits unpadded base64url.
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const parsed = JSON.parse(atob(padded)) as {
      salt?: unknown;
      bits?: unknown;
      exp?: unknown;
    };
    if (
      typeof parsed.salt !== "string" ||
      typeof parsed.bits !== "number" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }
    return { salt: parsed.salt, bits: parsed.bits, exp: parsed.exp };
  } catch {
    return null;
  }
}

async function sha256Hex(message: string): Promise<string> {
  const data = new TextEncoder().encode(message);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** First `bits` hex/2 chars are zero? (bit-accurate; matches server verifier) */
function meetsDifficulty(digestStr: string, bits: number): boolean {
  for (let i = 0; i < bits; i++) {
    const nibble = parseInt(digestStr[Math.floor(i / 4)] ?? "f", 16);
    if ((nibble >> (3 - (i % 4))) & 1) return false;
  }
  return true;
}

export type PowSolveOptions = {
  /** Called every `progressEvery` iterations (best-effort; not exact). */
  onProgress?: (attempts: number) => void;
  progressEvery?: number;
  now?: () => number;
};

/**
 * Solves the signed challenge. Yields on every digest (each `digest` call
 * awaits), so the surrounding UI stays responsive and the progress callback
 * keeps rendering. Rejects with `PowExpiredError` when the challenge runs out
 * of time mid-solve (parent remount issues a fresh one).
 */
export async function solvePowChallenge(
  params: PowChallengeParams,
  options: PowSolveOptions = {},
): Promise<string> {
  const isExpired = options.now
    ? () => options.now!() > params.exp
    : () => Date.now() > params.exp;
  const progressEvery = Math.max(1, options.progressEvery ?? 256);
  // Work upward from 0: expected exhaustion never comes (difficulty caps the
  // search time), the budget exists purely so a glitch can never loop forever.
  const budget = 2 ** params.bits * 8;

  let attempts = 0;
  // Numeric counter for the arithmetic, string on the way out: the server's
  // nonce grammar is `^\d{1,15}$` (lib/security/pow.ts), so the wire form is
  // always a decimal string.
  let nonce = 0;
  while (attempts < budget) {
    if (isExpired()) throw new PowExpiredError();
    const digestStr = await sha256Hex(`${params.salt}${nonce}`);
    if (meetsDifficulty(digestStr, params.bits)) {
      return String(nonce);
    }
    nonce += 1;
    attempts += 1;
    if (options.onProgress && attempts % progressEvery === 0) {
      options.onProgress(attempts);
    }
  }
  throw new PowExpiredError();
}
