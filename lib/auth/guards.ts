import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getRequestLocale } from '@/lib/i18n/server'
import { localePath, safeNextPath } from '@/lib/i18n/urls'
import { getUserRoles, isStaffRoles, isAdminRoles } from './roles'
import { hasCapability, type Capability } from './capabilities'
import type { AppRole } from './types'

/**
 * Page/layout-level access guards — the FIRST line of defense.
 *
 * Unlike lib/admin/auth.ts (throw-based, for Server Actions), these guards
 * `redirect()`:
 *   • unauthenticated → /{locale}/account/login?next=<where you were going>
 *   • unauthorized    → /{locale}/not-authorized  (localized screen, never a
 *     silent bounce to `/`)
 *
 * The locale comes from the request (x-locale header set by proxy.ts), so
 * users keep their language across every auth boundary. Callers pass a
 * CANONICAL (locale-free) path; this module prefixes it with the active
 * locale. proxy.ts only refreshes sessions — it never blocks routes — so
 * every protected page/layout must also call a guard here.
 */

export async function getSessionUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

/** Authenticated but not authorized → the localized not-authorized screen. */
async function denyAccess(fromPath: string): Promise<never> {
  const locale = await getRequestLocale()
  const from = safeNextPath(fromPath, locale)
  redirect(
    localePath(locale, `/not-authorized${from ? `?from=${encodeURIComponent(from)}` : ''}`),
  )
}

export async function requireUser(nextPath = '/account/dashboard') {
  const { supabase, user } = await getSessionUser()
  if (!user) {
    const locale = await getRequestLocale()
    const target = safeNextPath(nextPath, locale) ?? localePath(locale, '/account/dashboard')
    redirect(localePath(locale, `/account/login?next=${encodeURIComponent(target)}`))
  }
  return { supabase, user }
}

export async function requireRole(required: AppRole | AppRole[], nextPath = '/account/dashboard') {
  const { supabase, user } = await requireUser(nextPath)
  const roles = await getUserRoles(supabase, user.id)
  const requiredList = Array.isArray(required) ? required : [required]
  if (!requiredList.some((r) => roles.includes(r))) await denyAccess(nextPath)
  return { supabase, user, roles }
}

export async function requireStaff(nextPath = '/admin/dashboard') {
  const { supabase, user } = await requireUser(nextPath)
  const roles = await getUserRoles(supabase, user.id)
  if (!isStaffRoles(roles)) await denyAccess(nextPath)
  return { supabase, user, roles }
}

export async function requireAdmin(nextPath = '/admin/users') {
  const { supabase, user } = await requireUser(nextPath)
  const roles = await getUserRoles(supabase, user.id)
  if (!isAdminRoles(roles)) await denyAccess(nextPath)
  return { supabase, user, roles }
}

/**
 * Staff + capability guard for admin sub-areas (checklist item 5: pages ask
 * for capabilities, never hardcoded roles). The admin layout already ran
 * requireStaff for the whole tree; this adds the fine-grained check for
 * areas like managePolls / manageFundraisers.
 */
export async function requireCapability(capability: Capability, nextPath = '/admin/dashboard') {
  const { supabase, user, roles } = await requireStaff(nextPath)
  if (!hasCapability(roles, capability)) await denyAccess(nextPath)
  return { supabase, user, roles }
}
