import 'server-only'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * The edited name from `profiles`, or null when there is no profile row yet.
 *
 * The staff console used to read `user_metadata.full_name` straight off the
 * auth session. That field is written once at signup and never touched again
 * by the profile editors — which write `profiles.display_name` — so the
 * topbar kept showing the old name after an edit while the account shell
 * (which reads `profiles`) showed the current one.
 *
 * `cache()` makes it one read per request; the key is a primitive, not the
 * client object (same shape as lib/account/identity.ts).
 */
export const resolveProfileDisplayName = cache(
  async (userId: string): Promise<string | null> => {
    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name, full_name')
      .eq('id', userId)
      .maybeSingle()
    const p = profile as { display_name?: string | null; full_name?: string | null } | null
    return p?.display_name?.trim() || p?.full_name?.trim() || null
  },
)

/**
 * Name for the guard-returned session user, with the same precedence the
 * account shell uses: profiles → auth metadata (signup-time only) → email
 * prefix → "Staff".
 */
export async function getAdminDisplayName(
  user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null },
): Promise<string> {
  const metadataName = (user.user_metadata?.full_name as string | undefined)?.trim()
  const emailPrefix = user.email?.split('@')[0]?.trim()
  const profileName = await resolveProfileDisplayName(user.id)
  return profileName || metadataName || emailPrefix || 'Staff'
}
