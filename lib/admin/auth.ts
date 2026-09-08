import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { getSessionUser } from '@/lib/auth/guards'
import { getUserRoles, isAdminRoles, isStaffRoles } from '@/lib/auth/roles'
import { hasCapability, type Capability } from '@/lib/auth/capabilities'
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
 */
export async function assertCapability(capability: Capability): Promise<AdminContext> {
  const ctx = await assertStaff()
  if (!hasCapability(ctx.roles, capability)) {
    throw new Error('You do not have permission to perform this action.')
  }
  return ctx
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
