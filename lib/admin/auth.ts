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
