import 'server-only'

import { cache } from 'react'

import { getShellContext, type ShellContext } from './queries/shell'
import { getSessionAssurance, type SessionAssurance } from './session-assurance'
import type { AppRole } from '@/lib/auth/types'
import type { AdminRole } from '@/lib/auth/admin-roles'

/**
 * The AppShell read model, composed (plan Phases 6–7).
 *
 * Adds the one fact `queries/shell.ts` structurally cannot produce: this
 * session's 2FA assurance. That read goes through the cookie-scoped client,
 * while every read in ./queries/shell.ts goes through the SERVICE-ROLE client
 * (which bypasses RLS and knows nothing about who is asking) — the layout passes
 * viewer identity in as an argument. So assurance belongs at the composition
 * point, and the consequence is stated below.
 */
export type AdminShellContext = ShellContext & {
  /** This session's 2FA standing, or null when it could not be determined. */
  assurance: SessionAssurance | null
}

/**
 * Freshness contract (plan Phase 7 perf note).
 *
 * The admin layout carries `export const dynamic = 'force-dynamic'`, and it must
 * stay there: this read model mixes per-user facts (`unreadNotifications`,
 * `actionableApprovals`, the capability set) with org-wide ones into a single
 * object, so the whole object is per-user for caching purposes. Until now the
 * layout was dynamic only by accident — `proxy.ts` awaits `updateSession()` on
 * every request and that touches cookies. An emergent property of a middleware
 * file is not a contract, and adding a cookie-scoped read (`getSessionAssurance`)
 * without stating it is how a route ends up statically rendered with one
 * operator's badge counts inside another operator's HTML.
 *
 * React's `cache()` then dedupes the composition WITHIN a request — the documented
 * pattern for non-`fetch` data access. That is per-request, not shared, so it is
 * safe for per-user data. The genuinely shared saving is `getCachedHeartbeatHealth`
 * in ./queries/shell.ts (`unstable_cache`, short TTL), which is the only org-wide
 * shell read that no operator action mutates; the reasons are stated there.
 */
export const getAdminShellContext = cache(async (options: {
  userId: string
  roles: AppRole[]
  adminRoles: AdminRole[]
}): Promise<AdminShellContext> => {
  const [shell, assurance] = await Promise.all([
    getShellContext(options),
    getSessionAssurance(),
  ])
  return { ...shell, assurance }
})

