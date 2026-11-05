import { humanFieldForMode } from "./human-fields";
import { verifyPowToken, type PowVerifyOptions } from "./pow";
import { verifyTurnstileToken } from "./turnstile";

export { POW_FIELD, TURNSTILE_FIELD } from "./human-fields";

/**
 * Human-verification facade — the single seam every public form's server
 * action goes through. `human-gate.test.ts` owns the mode matrix.
 *
 * Three modes (switchable by env, deployable without code changes):
 *   pow       (default) signed proof-of-work challenge; zero third-party
 *             requests; the token rides the `pow-response` form field, and the
 *             solution is verified + consumed one-time by lib/security/pow.ts.
 *   turnstile Cloudflare's challenge preserved verbatim for rollback; the
 *             token rides the legacy `cf-turnstile-response` field.
 *   off       dev/tests convenience only — production always resolves to a
 *             verifying mode so bot protection can never be silently off.
 */

export type HumanMode = "pow" | "turnstile" | "off";

export type HumanGateOptions = {
  /** Forwarded to the PoW verifier in tests (injected clock/limiter). */
  pow?: PowVerifyOptions;
  /** Injectable env for tests; defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
};

/** Resolves the active mode. Production never returns "off". */
export function humanMode(env: NodeJS.ProcessEnv = process.env): HumanMode {
  if (env.NEXT_PUBLIC_HUMAN_MODE === "turnstile") return "turnstile";
  if (env.NEXT_PUBLIC_HUMAN_MODE === "off" && env.NODE_ENV !== "production") {
    return "off";
  }
  return "pow";
}

/**
 * Verifies a raw token (already extracted from its form field) under the
 * active mode. Used by server actions whose client passes the token as
 * structured input rather than as part of a `FormData` submission
 * (`submitContentReport` — the report dialog reads its own form).
 */
export async function verifyHumanGateToken(
  token: string | null | undefined,
  options: HumanGateOptions = {},
): Promise<boolean> {
  const mode = humanMode(options.env);
  if (mode === "off") return true;
  if (mode === "turnstile") return verifyTurnstileToken(token ?? null);
  return verifyPowToken(token ?? null, options.pow);
}

/**
 * Verifies the human gate for a server action that receives `FormData`.
 * True only when the active mode's verification passed (or the mode is
 * safely "off"). The field name follows the resolved mode, so a deployment
 * flipped to `turnstile` keeps reading the legacy Cloudflare field.
 */
export async function verifyHumanGate(
  formData: FormData,
  options: HumanGateOptions = {},
): Promise<boolean> {
  const mode = humanMode(options.env);
  if (mode === "off") return true;
  const raw = formData.get(humanFieldForMode(mode));
  return verifyHumanGateToken(typeof raw === "string" ? raw : null, options);
}
