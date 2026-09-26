import 'server-only'

import { createClient } from '@/lib/supabase/server'

/**
 * Session assurance (plan Phase 6.3 — "your session's 2FA assurance").
 *
 * docs/system/chief-access.md and credentials.md both state as policy that the
 * people holding supreme access are expected to hold TOTP; the hardening
 * checklist enforces it server-side in `assertTwoFactorIfEnrolled`
 * (lib/admin/auth.ts) — but until now nothing told an operator which assurance
 * level THEIR OWN session carries. A chief who believed they were holding TOTP
 * and quietly was not (factor removed, new device, session predating enrolment)
 * only found out when a destructive action threw. The footer states it on every
 * admin screen instead.
 *
 * Deliberately a read of the CURRENT session through the cookie-scoped client,
 * not the service-role one: assurance is a property of this browser, so it must
 * never come from a shared, cached read.
 *
 * Cost is zero network round-trips, verified against @supabase/auth-js: the
 * no-argument form decodes the stored JWT and reads `session.user.factors` off
 * the hydrated session. The `getUser()` branch only runs when a JWT is passed
 * explicitly, and the MFA endpoint is never called.
 */
export type SessionAssurance = {
  /** `'aal1'` (password) | `'aal2'` (a second factor was verified this session). */
  currentLevel: string
  /** A verified TOTP factor exists on the account, whether or not it was used. */
  factorEnrolled: boolean
}

/**
 * Failure mode is deliberately PERMISSIVE, matching `assertTwoFactorIfEnrolled`:
 * an admin with no enrolled factor is not blocked, and a read that fails is
 * reported as "unknown" (null) rather than as a downgrade.
 *
 * The reason is that this value is DISPLAY, not authorization. A transient auth
 * error that made the footer shout "password only" at someone who is holding
 * aal2 would train operators to distrust the one surface that tells them their
 * own standing — and the shell renders on every screen, so it would shout on
 * every screen. When null, the assurance row simply does not render.
 *
 * Nothing may gate on this. Authorization lives in lib/auth/guards.ts and
 * lib/admin/auth.ts.
 */
export async function getSessionAssurance(): Promise<SessionAssurance | null> {
  try {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error || !data?.currentLevel) return null
    return {
      currentLevel: data.currentLevel,
      // `nextLevel` is aal2 exactly when a verified factor is enrolled, so the
      // enrolment question is answered off the hydrated session instead of a
      // `listFactors()` network call on every admin screen.
      factorEnrolled: data.nextLevel === 'aal2',
    }
  } catch {
    return null
  }
}

/**
 * Pure ranking of what the assurance read means, so the copy and the tone are
 * unit-testable without a Supabase client.
 *
 * `enrolled-not-used` is the row that matters: the factor exists, this session
 * did not present it. That is the exact state a password-only session sits in,
 * and it is the one no admin surface used to show.
 */
export type AssuranceLevel = 'step-up' | 'enrolled-not-used' | 'password-only' | 'unknown'

export function classifyAssurance(assurance: SessionAssurance | null): AssuranceLevel {
  if (!assurance) return 'unknown'
  if (assurance.currentLevel === 'aal2') return 'step-up'
  return assurance.factorEnrolled ? 'enrolled-not-used' : 'password-only'
}
