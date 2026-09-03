'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getRequestLocale } from '@/lib/i18n/server'
import { localePath } from '@/lib/i18n/urls'

/**
 * Signs the user out and lands them on the localized homepage.
 * Used by the AppShell topbars (admin + account) — the profile area lives in
 * the shell so sign-out is reachable from every app page (checklist item 11).
 */
export async function signOutAction(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const locale = await getRequestLocale()
  redirect(localePath(locale, '/'))
}