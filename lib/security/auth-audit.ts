import 'server-only'

import { createHmac, randomUUID } from 'node:crypto'

import { createAdminClient, type InsertOf } from '@/lib/supabase/admin'
import type { Json } from '@/lib/supabase/database.types'
import { getClientIp } from '@/lib/security/rate-limit'

/**
 * Authentication audit trail (plan Phase 4.6, spec §53).
 *
 * The security view needs ground truth for "repeated failed logins" and
 * "suspicious session activity", and Supabase's own auth logs are neither
 * queryable from here nor retained to the project's own policy. So the
 * sign-in / sign-out boundary writes its own `audit_events` rows with
 * `source: 'auth'`, alongside the admin-dashboard writes in `_shared.ts`.
 *
 * Privacy contract (spec §19, §44): an audit row never carries the raw email,
 * the password, or a session token. The email is reduced to a truncated HMAC
 * so repeated attempts against one account still correlate without the table
 * becoming an address book — and, because the key is secret, without the
 * digest being reversible by anyone reading the table.
 */

export const AUTH_AUDIT_ACTIONS = {
  loginSucceeded: 'auth.login.succeeded',
  loginFailed: 'auth.login.failed',
  /** Refused before or instead of a credential check (throttle, captcha, ban). */
  loginBlocked: 'auth.login.blocked',
  logout: 'auth.logout',
} as const
export type AuthAuditAction = (typeof AUTH_AUDIT_ACTIONS)[keyof typeof AUTH_AUDIT_ACTIONS]

export type AuthAuditInput = {
  action: AuthAuditAction
  /** Known only when the credential check resolved to a user. */
  actorId?: string | null
  /** Raw email (or other identity) — hashed here, never stored as given. */
  identifier?: string | null
  /** Stable, non-enumerating context (a reason code), plus the client IP. */
  detail?: Record<string, unknown>
}

/** The audit trail is only writable when the service-role key is configured. */
export function hasAuthAuditStorage(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

let cachedHashKey: Buffer | null | undefined

/**
 * Dedicated `AUTH_AUDIT_HASH_KEY` when set, otherwise the credential
 * encryption key (already required by the secrets feature), otherwise the
 * service-role key. With none of them the identifier is omitted rather than
 * stored in the clear.
 */
function loadHashKey(): Buffer | null {
  if (cachedHashKey !== undefined) return cachedHashKey
  const raw =
    process.env.AUTH_AUDIT_HASH_KEY ??
    process.env.CREDENTIAL_ENCRYPTION_KEY ??
    process.env.SUPABASE_SERVICE_ROLE_KEY
  cachedHashKey = raw && raw.length > 0 ? Buffer.from(raw, 'utf8') : null
  return cachedHashKey
}

/** Truncated HMAC-SHA256 (16 hex chars) — built for correlation, not recovery. */
export function identifierHash(identifier: string): string | null {
  const key = loadHashKey()
  const value = identifier.trim().toLowerCase()
  if (!key || !value) return null
  return createHmac('sha256', key).update(value).digest('hex').slice(0, 16)
}

async function requestIp(): Promise<string | null> {
  try {
    const ip = await getClientIp()
    return ip === 'unknown' ? null : ip
  } catch {
    // Outside a request scope (job, test) — the event is still worth recording.
    return null
  }
}

/**
 * Best-effort append. Never throws and never blocks: the security trail must
 * not be able to break the sign-in flow it observes.
 */
export async function recordAuthEvent(input: AuthAuditInput): Promise<void> {
  if (!hasAuthAuditStorage()) return
  try {
    const metadata: Record<string, unknown> = { ...input.detail }
    const ip = await requestIp()
    if (ip) metadata.ip = ip
    const identifier = input.identifier ? identifierHash(input.identifier) : null
    if (identifier) metadata.identifier = identifier

    await createAdminClient()
      .from('audit_events')
      .insert({
        action: input.action,
        actor_id: input.actorId ?? null,
        resource_type: 'auth',
        resource_id: input.actorId ?? identifier,
        request_id: randomUUID(),
        source: 'auth',
        metadata: metadata as unknown as Json,
      } as InsertOf<'audit_events'>)
  } catch {
    /* See above. */
  }
}
