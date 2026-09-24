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

export async function updateUserProfile(
  userId: string,
  input: { displayName?: string | null; fullName?: string | null; phone?: string | null },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageUsers')
    const patch: Record<string, string | null> = {}
    if (input.displayName !== undefined) patch.display_name = input.displayName?.trim() || null
    if (input.fullName !== undefined) patch.full_name = input.fullName?.trim() || null
    if (input.phone !== undefined) {
      const phone = input.phone?.trim() || null
      if (phone && !/^[+\d][\d\s\-().]{5,29}$/.test(phone)) return { ok: false, error: 'Enter a valid phone number.' }
      patch.phone = phone
    }
    if (Object.keys(patch).length === 0) return { ok: false, error: 'Nothing to update.' }
    const { error } = await supabase.from('profiles').update(patch as UpdateOf<'profiles'>).eq('id', userId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'user:profile:update', entityType: 'profile', entityId: userId })
    revalidateLocalized('/admin/users')
    return { ok: true }
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
