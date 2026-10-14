import 'server-only'

import { createClient } from '@/lib/supabase/server'

type SessionClient = Awaited<ReturnType<typeof createClient>>

export function requiresMfaChallenge(currentLevel: string, nextLevel: string): boolean {
  return nextLevel === 'aal2' && currentLevel !== 'aal2'
}

/** Fails closed when a protected route cannot verify the session's MFA state. */
export async function isMfaChallengeRequired(supabase: SessionClient): Promise<boolean> {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data?.currentLevel || !data.nextLevel) {
    throw new Error('Could not verify two-factor status. Please try again.')
  }
  return requiresMfaChallenge(data.currentLevel, data.nextLevel)
}
