'use server'

import { assertAdmin, assertCapability, assertReauth } from '@/lib/admin/auth'
import { type AppRole } from '@/lib/admin/queries'
import { createAdminClient } from '@/lib/supabase/admin'
import { type UpdateOf } from '@/lib/supabase/admin'
import { type ActionResult, audit, auditEvent, fail, revalidateLocalized } from './_shared'

/* ------------------------------------------------------------------ */
/* User roles (admin only)                                             */
/* ------------------------------------------------------------------ */

export async function setUserRole(
  userId: string,
  role: AppRole,
  assign: boolean,
  confirmPassword?: string,
): Promise<ActionResult> {
  try {
    // Granting or revoking admin is privilege escalation in both directions —
    // require password re-confirmation (Phase 5: reauth for role changes).
    const { supabase, user } = role === 'admin'
      ? await assertReauth(confirmPassword)
      : await assertAdmin()
    if (!assign && userId === user.id && role === 'admin') return { ok: false, error: 'You cannot remove your own admin role.' }
    if (!assign && role === 'admin') {
      const { count } = await supabase.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'admin')
      if ((count ?? 0) <= 1) return { ok: false, error: 'The last administrator cannot be removed.' }
    }
    if (assign) {
      const { error } = await supabase.from('user_roles').upsert({ user_id: userId, role })
      if (error) return { ok: false, error: error.message }
    } else {
      const { error } = await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', role)
      if (error) return { ok: false, error: error.message }
    }
    await audit(supabase, user.id, {
      action: assign ? 'user:role:assign' : 'user:role:remove',
      notes: `user=${userId} role=${role}`,
    })
    // §53 privilege escalation: role grants are the escalation signal itself,
    // so they land in the system trail the security view reads (moderation_log
    // above stays the editorial record).
    await auditEvent(user.id, {
      action: assign ? 'user:role:assign' : 'user:role:remove',
      resourceType: 'profile',
      resourceId: userId,
      metadata: { role },
    })
    revalidateLocalized('/admin/users')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function setUserStatus(
  userId: string,
  status: 'active' | 'suspended' | 'banned',
  confirmPassword?: string,
): Promise<ActionResult> {
  try {
    // Suspending or banning someone cuts their access — reconfirm the acting
    // admin's password first (Phase 5: reauth for suspension/ban).
    const { supabase, user } = status === 'active'
      ? await assertAdmin()
      : await assertReauth(confirmPassword)
    if (userId === user.id) return { ok: false, error: 'You cannot change your own account status.' }
    const { data: targetRoles } = await supabase.from('user_roles').select('role').eq('user_id', userId)
    if ((status !== 'active') && (targetRoles ?? []).some((row) => row.role === 'admin')) {
      const { count } = await supabase.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'admin')
      if ((count ?? 0) <= 1) return { ok: false, error: 'The last administrator cannot be disabled.' }
    }
    const { error } = await supabase.from('profiles').update({ is_suspended: status === 'suspended', is_banned: status === 'banned' }).eq('id', userId)
    if (error) return { ok: false, error: error.message }
    // Mirror the status into Supabase Auth (Phase 5: session/token revocation):
    // banning revokes all of the user's refresh tokens, so a banned user's
    // live session dies when their short-lived access token expires instead of
    // surviving indefinitely. Restoring lifts any auth-level ban. Suspension
    // stays a soft profile flag by design (blocks the next login only).
    const { error: authError } = await createAdminClient().auth.admin.updateUserById(userId, {
      ban_duration: status === 'banned' ? '876000h' : 'none',
    })
    if (authError) return { ok: false, error: authError.message }
    await audit(supabase, user.id, { action: `user:${status}`, entityType: 'profile', entityId: userId })
    // §53: suspension/ban is an access-cutting decision — system-trail it too.
    await auditEvent(user.id, { action: `user:${status}`, resourceType: 'profile', resourceId: userId })
    revalidateLocalized('/admin/users')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function deleteUser(userId: string, confirmPassword?: string): Promise<ActionResult> {
  try {
    // Account deletion is irreversible (GDPR erasure path) — reconfirm first.
    const { supabase, user } = await assertReauth(confirmPassword)
    if (userId === user.id) return { ok: false, error: 'You cannot delete your own account.' }
    const { data: adminRole } = await supabase.from('user_roles').select('user_id').eq('user_id', userId).eq('role', 'admin').limit(1)
    if (adminRole?.length) {
      const { count } = await supabase.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'admin')
      if ((count ?? 0) <= 1) return { ok: false, error: 'The last administrator cannot be deleted.' }
    }
    await supabase.from('content_items').update({ author_id: null, submitted_by: null }).eq('author_id', userId)
    const { error: profileError } = await supabase.from('profiles').delete().eq('id', userId)
    if (profileError) return { ok: false, error: profileError.message }
    const { error } = await createAdminClient().auth.admin.deleteUser(userId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'user:delete', entityType: 'profile', entityId: userId })
    await auditEvent(user.id, { action: 'user:delete', resourceType: 'profile', resourceId: userId })
    revalidateLocalized('/admin/users')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function updateContributorCuration(userId: string, input: { featured: boolean; bioOverride?: string | null }): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertAdmin()
    const { error } = await supabase.from('profiles').update({ contributor_featured: input.featured, contributor_bio_override: input.bioOverride?.trim() || null }).eq('id', userId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'user:contributor:update', entityType: 'profile', entityId: userId })
    revalidateLocalized('/admin/users')
    revalidateLocalized('/contributors')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export type UserProfilePatch = {
  displayName?: string | null
  fullName?: string | null
  bio?: string | null
  phone?: string | null
  avatarUrl?: string | null
  locationId?: string | null
  isPublic?: boolean
  isVerified?: boolean
  preferredLocale?: string | null
  preferredVoice?: string | null
  contributorHandle?: string | null
}

function validateProfilePatch(input: UserProfilePatch): string | null {
  if (input.displayName !== undefined && (input.displayName?.trim() ?? '').length > 80) return 'Display name is too long.'
  if (input.fullName !== undefined && (input.fullName?.trim() ?? '').length > 80) return 'Full name is too long.'
  if (input.bio !== undefined && (input.bio?.trim() ?? '').length > 500) return 'Bio is too long (max 500 characters).'
  if (input.contributorHandle !== undefined) {
    const h = input.contributorHandle?.trim() ?? ''
    if (h && !/^[a-z0-9_.-]{2,40}$/i.test(h)) return 'Handle: 2–40 letters, numbers, . _ -.'
  }
  if (input.avatarUrl !== undefined) {
    const v = input.avatarUrl?.trim() ?? ''
    if (v && v.length > 2048) return 'Avatar URL is too long.'
    if (v && !/^https?:\/\/.+\..+/.test(v)) return 'Avatar must be an https:// URL.'
  }
  if (input.locationId !== undefined) {
    const v = input.locationId?.trim() ?? ''
    if (v && !/^[0-9a-f-]{8,36}$/i.test(v)) return 'Pick a valid location.'
  }
  if (input.preferredLocale !== undefined) {
    const v = input.preferredLocale?.trim() ?? ''
    if (v && v !== 'en' && v !== 'fr') return 'Language must be English or French.'
  }
  if (input.preferredVoice !== undefined) {
    const v = input.preferredVoice?.trim() ?? ''
    if (v && !['formal', 'pidgin', 'camfranglais'].includes(v)) return 'Pick a valid voice.'
  }
  return null
}

function buildProfilePatch(input: UserProfilePatch): { patch: Record<string, string | boolean | null>; error?: string } {
  const err = validateProfilePatch(input)
  if (err) return { patch: {}, error: err }
  const patch: Record<string, string | boolean | null> = {}
  if (input.displayName !== undefined) patch.display_name = input.displayName?.trim() || null
  if (input.fullName !== undefined) patch.full_name = input.fullName?.trim() || null
  if (input.bio !== undefined) patch.bio = input.bio?.trim() || null
  if (input.phone !== undefined) {
    const phone = input.phone?.trim() || null
    if (phone && !/^[+\d][\d\s\-().]{5,29}$/.test(phone)) return { patch: {}, error: 'Enter a valid phone number.' }
    patch.phone = phone
  }
  if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl?.trim() || null
  if (input.locationId !== undefined) patch.location_id = input.locationId?.trim() || null
  if (input.isPublic !== undefined) patch.is_public = input.isPublic
  if (input.isVerified !== undefined) patch.is_verified = input.isVerified
  if (input.preferredLocale !== undefined) patch.preferred_locale = input.preferredLocale?.trim() || 'en'
  if (input.preferredVoice !== undefined) patch.preferred_voice = input.preferredVoice?.trim() || 'formal'
  if (input.contributorHandle !== undefined) patch.contributor_handle = input.contributorHandle?.trim() || null
  return { patch }
}

export async function updateUserProfile(userId: string, input: UserProfilePatch): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageUsers')
    const { patch, error } = buildProfilePatch(input)
    if (error) return { ok: false, error }
    if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to update.' }
    const { error: updateError } = await supabase.from('profiles').update(patch as UpdateOf<'profiles'>).eq('id', userId)
    if (updateError) return { ok: false, error: updateError.message }
    await audit(supabase, user.id, { action: 'user:profile:update', entityType: 'profile', entityId: userId })
    revalidateLocalized('/admin/users')
    revalidateLocalized(`/admin/users/${userId}`)
    revalidateLocalized('/contributors')
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function setUserVerified(userId: string, verified: boolean): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageUsers')
    const { error } = await supabase.from('profiles').update({ is_verified: verified }).eq('id', userId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: verified ? 'user:verify' : 'user:unverify', entityType: 'profile', entityId: userId })
    revalidateLocalized('/admin/users')
    revalidateLocalized(`/admin/users/${userId}`)
    return { ok: true }
  } catch (e) { return fail(e) }
}

const ADMIN_AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp']

/** Staff upload of any user's avatar (service-role write into the user's folder). */
export async function uploadUserAvatar(userId: string, formData: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  try {
    const { supabase, user } = await assertCapability('manageUsers')
    const file = formData.get('avatar')
    if (!(file instanceof File)) return { ok: false, error: 'Choose an image file.' }
    if (!ADMIN_AVATAR_TYPES.includes(file.type)) return { ok: false, error: 'Avatar must be JPEG, PNG or WebP.' }
    if (file.size <= 0 || file.size > 5 * 1024 * 1024) return { ok: false, error: 'Avatar must be under 5 MB.' }
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `${userId}/${Date.now()}.${ext}`
    const bytes = Buffer.from(await file.arrayBuffer())
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, bytes, { contentType: file.type, upsert: true })
    if (uploadError) return { ok: false, error: uploadError.message }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    const { error: updateError } = await supabase.from('profiles').update({ avatar_url: data.publicUrl }).eq('id', userId)
    if (updateError) return { ok: false, error: updateError.message }
    await audit(supabase, user.id, { action: 'user:profile:update', entityType: 'profile', entityId: userId, notes: 'avatar upload' })
    revalidateLocalized('/admin/users')
    revalidateLocalized(`/admin/users/${userId}`)
    return { ok: true, url: data.publicUrl }
  } catch (e) { return fail(e) }
}

export async function inviteUser(email: string, role: AppRole = 'contributor', confirmPassword?: string): Promise<ActionResult> {
  try {
    // Inviting an admin is privilege escalation — require step-up reauth,
    // mirroring setUserRole's admin gate.
    const { supabase, user } = role === 'admin'
      ? await assertReauth(confirmPassword)
      : await assertAdmin()
    const normalized = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(normalized)) return { ok: false, error: 'Enter a valid email address.' }
    const { data, error } = await createAdminClient().auth.admin.inviteUserByEmail(normalized)
    if (error || !data.user) return { ok: false, error: error?.message ?? 'Could not send invite.' }
    const { error: roleError } = await supabase.from('user_roles').upsert({ user_id: data.user.id, role })
    if (roleError) return { ok: false, error: roleError.message }
    await audit(supabase, user.id, { action: 'user:invite', entityType: 'profile', entityId: data.user.id, notes: normalized })
    revalidateLocalized('/admin/users')
    return { ok: true }
  } catch (e) { return fail(e) }
}

const BULK_INVITE_ROLES: AppRole[] = ['admin', 'editor', 'contributor', 'advertiser']

/**
 * Bulk invite from pasted CSV lines (one `email, role` per line). A single
 * capability check up front (step-up reauth when any line grants admin),
 * then one Supabase invite + role upsert per valid line. Invalid lines are
 * skipped and reported — nothing fails half-way silently.
 */
export async function bulkInviteUsers(
  lines: string[],
  confirmPassword?: string,
): Promise<{ ok: true; sent: number; skipped: { line: string; reason: string }[] } | { ok: false; error: string }> {
  try {
    if (lines.length === 0) return { ok: false, error: 'Paste at least one line.' }
    if (lines.length > 50) return { ok: false, error: 'At most 50 lines per batch.' }
    const parsed = lines.map((raw) => {
      const [emailRaw, roleRaw] = raw.split(',').map((s) => s.trim())
      const email = (emailRaw ?? '').toLowerCase()
      const role = ((roleRaw ?? 'contributor').toLowerCase()) as AppRole
      return { line: raw.trim(), email, role }
    })
    const needsReauth = parsed.some((p) => p.role === 'admin')
    const { supabase, user } = needsReauth ? await assertReauth(confirmPassword) : await assertAdmin()
    const admin = createAdminClient()
    let sent = 0
    const skipped: { line: string; reason: string }[] = []
    for (const p of parsed) {
      if (!/^\S+@\S+\.\S+$/.test(p.email)) {
        skipped.push({ line: p.line, reason: 'Invalid email.' })
        continue
      }
      if (!BULK_INVITE_ROLES.includes(p.role)) {
        skipped.push({ line: p.line, reason: `Unknown role "${p.role}".` })
        continue
      }
      const { data, error } = await admin.auth.admin.inviteUserByEmail(p.email)
      if (error || !data.user) {
        skipped.push({ line: p.line, reason: error?.message ?? 'Invite failed.' })
        continue
      }
      const { error: roleError } = await supabase.from('user_roles').upsert({ user_id: data.user.id, role: p.role })
      if (roleError) {
        skipped.push({ line: p.line, reason: roleError.message })
        continue
      }
      await audit(supabase, user.id, { action: 'user:invite', entityType: 'profile', entityId: data.user.id, notes: p.email })
      sent += 1
    }
    revalidateLocalized('/admin/users')
    return { ok: true, sent, skipped }
  } catch (e) { return fail(e) }
}
