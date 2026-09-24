import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getSessionUser } from '@/lib/auth/guards'
import { getAdminRoles, getUserRoles, hasAdminRole, isAdminRoles, isStaffRoles } from '@/lib/auth/roles'
import { type Capability } from '@/lib/auth/capabilities'
import {
  ADMIN_ROLE_LABELS,
  effectiveCapabilities,
  resolveAdminRoles,
  type AdminRole,
} from '@/lib/auth/admin-roles'
import type { AppRole } from '@/lib/auth/types'

/**
 * Throw-based authorization helpers for Server Functions.
 *
 * The route guards in lib/auth/guards.ts call `redirect('/')`, which throws
 * a NEXT_REDIRECT control-flow exception — fine in a page/layout, but not
 * inside a Server Action where we want the client to receive a catchable
 * error and show feedback. These helpers return the same shape
 * ({ supabase, user, roles }) but throw a plain Error when the check fails,
 * so callers can `catch` and surface a message.
 */

export type AdminContext = {
  supabase: Awaited<ReturnType<typeof getSessionUser>>['supabase']
  user: NonNullable<Awaited<ReturnType<typeof getSessionUser>>['user']>
  roles: AppRole[]
  /**
   * Phase 2.1 (spec §17) — resolved fine-grained admin roles. Optional because
   * only assertAdminRole pays for the extra `user_admin_roles` read.
   */
  adminRoles?: AdminRole[]
}

export async function assertStaff(): Promise<AdminContext> {
  const ctx = await getSessionUser()
  if (!ctx.user) throw new Error('Authentication required. Please sign in.')
  const roles = await getUserRoles(ctx.supabase, ctx.user.id)
  if (!isStaffRoles(roles)) throw new Error('Staff access required.')
  return { supabase: ctx.supabase, user: ctx.user, roles }
}

export async function assertAdmin(): Promise<AdminContext> {
  const ctx = await getSessionUser()
  if (!ctx.user) throw new Error('Authentication required. Please sign in.')
  const roles = await getUserRoles(ctx.supabase, ctx.user.id)
  if (!isAdminRoles(roles)) throw new Error('Administrator access required.')
  return { supabase: ctx.supabase, user: ctx.user, roles }
}

/**
 * Capability-scoped variant of assertStaff for Server Functions that manage
 * a specific admin area (polls, fundraisers, …). Throws the same plain Error
 * so clients can catch and surface the message.
 *
 * Phase 2.1: the check unions the legacy `app_role` capabilities with the
 * fine-grained `user_admin_roles` layer, so a `platform_admin` grant grants
 * its capabilities without a legacy `admin` row. With no admin-role rows the
 * union is exactly `capabilitiesFor(roles)` — unchanged behavior.
 */
export async function assertCapability(capability: Capability): Promise<AdminContext> {
  const ctx = await assertStaff()
  const adminRoles = await getAdminRoles(ctx.supabase, ctx.user.id)
  if (!effectiveCapabilities(ctx.roles, adminRoles).has(capability)) {
    throw new Error('You do not have permission to perform this action.')
  }
  return { ...ctx, adminRoles: resolveAdminRoles(ctx.roles, adminRoles) }
}

/**
 * Step-up verification for sensitive admin actions (suspend/ban, delete,
 * admin-role changes): the acting admin re-enters their password, which is
 * verified against Supabase Auth through a session-less client — no cookies
 * are touched, so the acting session stays intact (Phase 5 hardening:
 * "require reauthentication for suspension, ban, deletion, and role changes").
 */
export async function assertReauth(password: string | null | undefined): Promise<AdminContext> {
  const ctx = await assertAdmin()
  const email = ctx.user.email
  if (!password || !email) {
    throw new Error('Confirm your password to perform this action.')
  }
  const verify = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const { error } = await verify.auth.signInWithPassword({ email, password })
  if (error) throw new Error('Password confirmation failed.')
  return ctx
}

/**
 * Phase 2.1 (spec §17) — require a specific fine-grained admin role (or any
 * of several, e.g. `['super_admin', 'platform_admin']`). Explicit
 * `user_admin_roles` rows win; a legacy `admin` with none resolves to
 * super_admin (the spec §17 alias, see lib/auth/admin-roles.ts).
 */
export async function assertAdminRole(role: AdminRole | AdminRole[]): Promise<AdminContext> {
  const ctx = await assertStaff()
  const adminRoles = resolveAdminRoles(ctx.roles, await getAdminRoles(ctx.supabase, ctx.user.id))
  if (!hasAdminRole(adminRoles, role)) {
    const required = Array.isArray(role) ? role : [role]
    throw new Error(
      `This action requires the ${required.map((r) => ADMIN_ROLE_LABELS[r]).join(' or ')} role.`,
    )
  }
  return { ...ctx, adminRoles }
}

/**
 * Phase 2.1 — second-factor step-up for destructive operations. A session that
 * signed in with a password alone is `aal1`; only a session that has since
 * verified a TOTP code is `aal2`. Destructive admin actions call this in
 * addition to their role/capability check, so a stolen password is not enough
 * (spec §16/§44 hardening).
 */
export async function assertTwoFactor(): Promise<AdminContext> {
  const ctx = await assertAdmin()
  const supabase = await createClient()
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (error || !data) throw new Error('Could not verify two-factor status. Please try again.')
  if (data.currentLevel !== 'aal2') {
    const { data: factors } = await supabase.auth.mfa.listFactors()
    const enrolled = (factors?.totp ?? []).some((f) => f.status === 'verified')
    throw new Error(
      enrolled
        ? 'Two-factor verification required: confirm your authenticator code, then try again.'
        : 'Two-factor authentication must be enabled before performing this action.',
    )
  }
  return ctx
}

/**
 * Org-policy variant of the step-up: an admin who has enrolled a verified
 * factor must present an `aal2` session, but an admin with no factor enrolled
 * is not blocked. Emergency revocation (spec §14/§15) must stay possible in a
 * deployment that has not rolled TOTP out yet — there, spec §44's second
 * administrator is the compensating control. Enroll a factor and the stricter
 * check engages by itself.
 */
export async function assertTwoFactorIfEnrolled(existing?: AdminContext): Promise<AdminContext> {
  // Callers that already ran a capability check pass their context in: the
  // capability layer is a superset of legacy `admin`, so re-running assertAdmin
  // here would wrongly lock out a fine-grained-only administrator.
  const ctx = existing ?? (await assertAdmin())
  const supabase = await createClient()
  const { data: factors, error } = await supabase.auth.mfa.listFactors()
  if (error) throw new Error('Could not verify two-factor status. Please try again.')
  const enrolled = (factors?.totp ?? []).some((f) => f.status === 'verified')
  if (!enrolled) return ctx
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
  if (data?.currentLevel !== 'aal2') {
    throw new Error(
      'Two-factor verification required: confirm your authenticator code, then try again.',
    )
  }
  return ctx
}
