import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/observability/logger'

/**
 * App-layer IP blocklist (System & Infrastructure → Security).
 *
 * The app has no edge firewall, so hostile addresses observed on the
 * security heatmap are enforced here: auth (sign-in/sign-up) and anonymous
 * public intake refuse blocked IPs. Blocks are chief-managed rows in
 * `blocked_ips` with optional expiry; enforcement reads through a 60-second
 * in-memory cache so every sign-in doesn't pay a round trip.
 *
 * Expired rows are treated as absent on read and swept by the nightly
 * db-maintenance job.
 */

const CACHE_TTL_MS = 60_000

let cachedAt = 0
let cachedIps: Set<string> = new Set()

function normalizeIp(ip: string | null | undefined): string | null {
  const value = ip?.trim().toLowerCase()
  if (!value || value === 'unknown') return null
  return value
}

/** All currently effective blocks (expiry-honouring). Exported for the UI. */
export async function getBlockedIps(): Promise<
  { ip: string; reason: string | null; blockedAt: string | null; expiresAt: string | null }[]
> {
  try {
    const { data, error } = await createAdminClient()
      .from('blocked_ips')
      .select('ip, reason, blocked_at, expires_at')
      .order('blocked_at', { ascending: false })
      .limit(200)
    if (error) throw new Error(error.message)
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
      ip: row.ip as string,
      reason: (row.reason as string | null) ?? null,
      blockedAt: (row.blocked_at as string | null) ?? null,
      expiresAt: (row.expires_at as string | null) ?? null,
    }))
  } catch (e) {
    logger.error('security/ip-blocklist', 'list failed', {
      error: e instanceof Error ? e.message : String(e),
    })
    return []
  }
}

async function liveBlockedIps(now: number): Promise<Set<string>> {
  if (now - cachedAt < CACHE_TTL_MS) return cachedIps
  const active = new Set<string>()
  try {
    const { data } = await createAdminClient()
      .from('blocked_ips')
      .select('ip, expires_at')
    for (const row of ((data ?? []) as unknown as { ip: string; expires_at: string | null }[])) {
      if (!row.expires_at || Date.parse(row.expires_at) > now) active.add(row.ip.toLowerCase())
    }
  } catch (e) {
    // Fail open on DB trouble: a down database must not lock everyone out.
    // The failed read is logged loudly instead.
    logger.error('security/ip-blocklist', 'block check failed (failing open)', {
      error: e instanceof Error ? e.message : String(e),
    })
    return cachedIps
  }
  cachedIps = active
  cachedAt = now
  return active
}

/** True when the address is currently blocked. Fail-open on DB trouble. */
export async function isIpBlocked(ip: string | null | undefined): Promise<boolean> {
  const normalized = normalizeIp(ip)
  if (!normalized) return false
  return (await liveBlockedIps(Date.now())).has(normalized)
}

/** Test seam: clear the cache (unit tests, and after block/unblock writes). */
export function clearIpBlockCache(): void {
  cachedIps = new Set()
  cachedAt = 0
}
