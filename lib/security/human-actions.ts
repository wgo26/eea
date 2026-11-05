'use server'

import { issuePowChallenge } from '@/lib/security/pow'
import type { PowIssue } from '@/lib/security/pow'

/**
 * Issues a signed proof-of-work challenge to the browser gate
 * (components/security/human-challenge.tsx).
 *
 * Returning null (no key material) means the deployment has no server secret
 * at all; the component renders explanatory failure copy rather than the
 * widget, mirroring the missing-key behaviour of the Turnstile widget it
 * replaced. Production infrastructure always carries the service-role key
 * the derivation falls back to, so null is a broken-env signal, not a mode.
 *
 * `'use server'` file constraint: every export must be async
 * (scripts/verify-server-actions.mjs).
 */
export async function requestHumanChallenge(): Promise<PowIssue | null> {
  return issuePowChallenge()
}
