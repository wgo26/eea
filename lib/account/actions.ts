'use server'

import { getSessionUser } from '@/lib/auth/guards'

type Result = { ok: true } | { ok: false; error: string }

/** Member-safe profile update: session client + own-row RLS (no capability needed). */
export async function updateOwnProfile(input: {
  displayName?: string | null
  fullName?: string | null
  bio?: string | null
  phone?: string | null
  preferredLocale?: string | null
}): Promise<Result> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Authentication required.' }
  const patch: Record<string, string | null> = {}
  if (input.displayName !== undefined) {
    const v = input.displayName?.trim() ?? ''
    if (v.length > 80) return { ok: false, error: 'Display name is too long.' }
    patch.display_name = v || null
  }
  if (input.fullName !== undefined) {
    const v = input.fullName?.trim() ?? ''
    if (v.length > 80) return { ok: false, error: 'Full name is too long.' }
    patch.full_name = v || null
  }
  if (input.bio !== undefined) {
    const v = input.bio?.trim() ?? ''
    if (v.length > 500) return { ok: false, error: 'Bio is too long.' }
    patch.bio = v || null
  }
  if (input.phone !== undefined) {
    const raw = input.phone?.trim() ?? ''
    if (raw === '') {
      patch.phone = null
    } else {
      const digits = raw.replace(/\D/g, '')
      if (digits.length < 8 || digits.length > 15) return { ok: false, error: 'Enter a valid phone number.' }
      patch.phone = raw.slice(0, 32)
    }
  }
  if (input.preferredLocale !== undefined) {
    const v = input.preferredLocale === 'fr' ? 'fr' : 'en'
    patch.preferred_locale = v
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to update.' }
  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
