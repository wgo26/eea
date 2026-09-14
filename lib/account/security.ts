'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRequestLocale } from '@/lib/i18n/server'
import { localePath } from '@/lib/i18n/urls'

type SecurityResult = { ok: true } | { ok: false; error: string }

/** End every session on every device (global refresh-token revocation). */
export async function signOutEverywhere(): Promise<SecurityResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  const { error } = await supabase.auth.signOut({ scope: 'global' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

/**
 * GDPR export: one JSON document with everything the platform stores about
 * the user — profile, roles, submissions, listings, saves, follows,
 * feedback, reminders, notifications, prefs and digest subscription.
 */
export async function exportMyData(): Promise<{ ok: true; data: Record<string, unknown> } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated.' }
  const admin = createAdminClient()
  const id = user.id
  const [profile, roles, submissions, content, saved, follows, feedback, reminders, notifications, prefs, digest] = await Promise.all([
    admin.from('profiles').select('*').eq('id', id).maybeSingle(),
    admin.from('user_roles').select('role').eq('user_id', id),
    admin.from('submissions').select('id, submission_type, status, created_at, reviewed_at').eq('submitted_by', id).limit(200),
    admin.from('content_items').select('id, type, slug, status, created_at').or(`author_id.eq.${id},submitted_by.eq.${id}`).limit(200),
    admin.from('saved_content').select('content_item_id, created_at').eq('user_id', id).limit(500),
    admin.from('contributor_follows').select('contributor_id, created_at').eq('follower_id', id).limit(500),
    admin.from('content_feedback').select('content_item_id, helpful, created_at').eq('user_id', id).limit(500),
    admin.from('event_reminders').select('content_item_id, remind_at, sent_at, created_at').eq('user_id', id).limit(200),
    admin.from('notifications').select('type, title, body, created_at').eq('user_id', id).order('created_at', { ascending: false }).limit(200),
    admin.from('notification_prefs').select('*').eq('user_id', id).maybeSingle(),
    admin.from('digest_subscribers').select('email, phone, whatsapp, locale, is_active').eq('email', user.email ?? '').limit(5),
  ])
  return {
    ok: true,
    data: {
      exportedAt: new Date().toISOString(),
      email: user.email,
      profile: profile.data,
      roles: roles.data,
      submissions: submissions.data,
      content: content.data,
      saved: saved.data,
      follows: follows.data,
      feedback: feedback.data,
      reminders: reminders.data,
      notifications: notifications.data,
      notificationPrefs: prefs.data,
      digestSubscriptions: digest.data,
    },
  }
}

/**
 * Self-service account deletion (GDPR erasure). Password re-auth first,
 * then: anonymize authored content (same as the admin path), drop owned
 * rows, delete the profile + auth user, sign out. The last administrator
 * cannot self-delete here — staff must transfer first.
 */
export async function deleteMyAccount(password: string): Promise<SecurityResult> {
  if (!password) return { ok: false, error: 'Confirm with your password.' }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { ok: false, error: 'Not authenticated.' }
  // Password re-auth (wrong password = error, nothing touched).
  const { error: reauthError } = await supabase.auth.signInWithPassword({ email: user.email, password })
  if (reauthError) return { ok: false, error: 'Wrong password.' }
  const admin = createAdminClient()
  const { data: adminRole } = await admin.from('user_roles').select('user_id').eq('user_id', user.id).eq('role', 'admin').limit(1)
  if ((adminRole?.length ?? 0) > 0) {
    const { count } = await admin.from('user_roles').select('user_id', { count: 'exact', head: true }).eq('role', 'admin')
    if ((count ?? 0) <= 1) return { ok: false, error: 'The last administrator cannot delete their own account.' }
  }
  try {
    await admin.from('content_items').update({ author_id: null, submitted_by: null }).eq('author_id', user.id)
    await admin.from('content_items').update({ submitted_by: null }).eq('submitted_by', user.id)
    await admin.from('profiles').delete().eq('id', user.id)
    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteError) return { ok: false, error: deleteError.message }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Deletion failed.' }
  }
  await supabase.auth.signOut()
  const locale = await getRequestLocale()
  redirect(localePath(locale, '/'))
}
