'use server'

import { getSessionUser } from '@/lib/auth/guards'
import type { Database } from '@/lib/supabase/database.types'

type Result = { ok: true } | { ok: false; error: string }

/** Member-safe profile update: session client + own-row RLS (no capability needed). */
export async function updateOwnProfile(input: {
  displayName?: string | null
  fullName?: string | null
  bio?: string | null
  phone?: string | null
  avatarUrl?: string | null
  locationId?: string | null
  isPublic?: boolean
  preferredLocale?: string | null
  preferredVoice?: string | null
  contributorHandle?: string | null
}): Promise<Result> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Authentication required.' }
  const patch: Database['public']['Tables']['profiles']['Update'] = {}
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
  if (input.preferredVoice !== undefined) {
    const v = (input.preferredVoice?.trim() ?? 'formal').toLowerCase()
    if (!['formal', 'pidgin', 'camfranglais'].includes(v)) return { ok: false, error: 'Pick a valid voice.' }
    patch.preferred_voice = v
  }
  if (input.avatarUrl !== undefined) {
    const v = input.avatarUrl?.trim() ?? ''
    if (v.length > 2048) return { ok: false, error: 'Avatar URL is too long.' }
    if (v && !/^https?:\/\/.+\..+/.test(v)) return { ok: false, error: 'Avatar must be an https:// URL.' }
    patch.avatar_url = v || null
  }
  if (input.locationId !== undefined) {
    const v = input.locationId?.trim() ?? ''
    if (v && !/^[0-9a-f-]{8,36}$/i.test(v)) return { ok: false, error: 'Pick a valid location.' }
    patch.location_id = v || null
  }
  if (input.isPublic !== undefined) {
    patch.is_public = input.isPublic
  }
  if (input.contributorHandle !== undefined) {
    const v = input.contributorHandle?.trim() ?? ''
    if (v && !/^[a-z0-9_.-]{2,40}$/i.test(v)) return { ok: false, error: 'Handle: 2–40 letters, numbers, . _ -.' }
    patch.contributor_handle = v || null
  }
  if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to update.' }
  const { error } = await supabase.from('profiles').update(patch).eq('id', user.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const AVATAR_MAX_BYTES = 5 * 1024 * 1024

function avatarError(file: File): string | null {
  if (!AVATAR_TYPES.includes(file.type)) return 'Avatar must be JPEG, PNG or WebP.'
  if (file.size <= 0 || file.size > AVATAR_MAX_BYTES) return 'Avatar must be under 5 MB.'
  return null
}

/** Upload your own avatar into the `avatars` bucket and point the profile at it. */
export async function uploadOwnAvatar(formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Authentication required.' }
  const file = formData.get('avatar')
  if (!(file instanceof File)) return { ok: false, error: 'Choose an image file.' }
  const err = avatarError(file)
  if (err) return { ok: false, error: err }
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${user.id}/${Date.now()}.${ext}`
  const { error: uploadError } = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: true })
  if (uploadError) return { ok: false, error: uploadError.message }
  const { data } = supabase.storage.from('avatars').getPublicUrl(path)
  const url = data.publicUrl
  const { error: updateError } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id)
  if (updateError) return { ok: false, error: updateError.message }
  return { ok: true, url }
}

/** Remove your own avatar (sets avatar_url back to null). */
export async function removeOwnAvatar(): Promise<Result> {
  const { supabase, user } = await getSessionUser()
  if (!user) return { ok: false, error: 'Authentication required.' }
  const { error } = await supabase.from('profiles').update({ avatar_url: null }).eq('id', user.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
