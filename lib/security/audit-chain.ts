import 'server-only'

import { createHmac } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/observability/logger'

/**
 * Tamper-evident hash chain for `audit_events` (System & Infrastructure →
 * Audit/Security hardening).
 *
 * Every chained row carries `prev_hash` (the previous row's `entry_hash`,
 * null at genesis) and `entry_hash = HMAC(key, prev|action|resource|actor|
 * created_at)`. Verification replays the table in `(created_at, id)` order;
 * a modified or deleted row breaks every later hash. The chain starts at the
 * first chained row — pre-chain history (null hashes) stays readable and is
 * simply outside the verifiable window.
 *
 * Key: dedicated `AUDIT_CHAIN_KEY` when set, else the credential-encryption
 * key (already a 32-byte secret the deployment guards), else no chain (rows
 * still write — the trail must never break the action it records).
 */

function loadChainKey(): Buffer | null {
  const raw = process.env.AUDIT_CHAIN_KEY ?? process.env.CREDENTIAL_ENCRYPTION_KEY
  return raw && raw.length > 0 ? Buffer.from(raw, 'utf8') : null
}

/** Hash for one entry given its predecessor. Pure — unit-testable. */
export function chainEntryHash(input: {
  prevHash: string | null
  action: string
  resourceType: string | null
  resourceId: string | null
  actorId: string | null
  createdAt: string
}): string | null {
  const key = loadChainKey()
  if (!key) return null
  return createHmac('sha256', key)
    .update(
      [input.prevHash ?? 'GENESIS', input.action, input.resourceType ?? '', input.resourceId ?? '', input.actorId ?? '', input.createdAt].join('|'),
    )
    .digest('hex')
}

/** Latest chained hash, or null at genesis / without a key / on DB trouble. */
export async function latestChainHash(): Promise<string | null> {
  try {
    const { data } = await createAdminClient()
      .from('audit_events')
      .select('entry_hash')
      .not('entry_hash', 'is', null)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    const row = data as unknown as { entry_hash: string | null } | null
    return row?.entry_hash ?? null
  } catch (e) {
    logger.warn('audit-chain', 'latest hash lookup failed', {
      error: e instanceof Error ? e.message : String(e),
    })
    return null
  }
}

export type ChainVerification = {
  ok: boolean
  checked: number
  /** First row id where the chain breaks (null when intact). */
  brokenAt: string | null
  genesisAt: string | null
  /** Last verified `entry_hash` — pass as the next page's `prev`. */
  endHash: string | null
}

/**
 * Replay-verify the chained window oldest-first. Bounded (default 5,000 rows
 * per call — the archive cron verifies incrementally; the admin action below
 * pages through the same helper).
 *
 * Continuity across pages: pass the previous page's last `entry_hash` as
 * `prev` (null when the window must start at genesis). Omitted `prev` means
 * a standalone spot-check anchored on the window's own stored predecessor.
 */
export async function verifyChainWindow(options?: {
  limit?: number
  before?: string
  prev?: string | null
}): Promise<ChainVerification> {
  const limit = options?.limit ?? 5000
  try {
    let query = createAdminClient()
      .from('audit_events')
      .select('id, action, resource_type, resource_id, actor_id, created_at, prev_hash, entry_hash')
      .not('entry_hash', 'is', null)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(limit)
    if (options?.before) query = query.lt('created_at', options.before)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as {
      id: string
      action: string
      resource_type: string | null
      resource_id: string | null
      actor_id: string | null
      created_at: string
      prev_hash: string | null
      entry_hash: string | null
    }[]
    let prev: string | null = null
    // When verifying a middle window, anchor on the stored predecessor instead
    // of GENESIS — otherwise every non-genesis page would "break" at row one.
    // Callers paging from genesis pass prev explicitly (null at genesis) so
    // continuity between pages is actually checked.
    if (rows.length > 0) {
      if (options && 'prev' in options) {
        if (rows[0].prev_hash !== options.prev) {
          return { ok: false, checked: 0, brokenAt: rows[0].id, genesisAt: rows[0].id, endHash: null }
        }
        prev = options.prev ?? null
      } else if (rows[0].prev_hash) {
        prev = rows[0].prev_hash
      }
    }
    for (const row of rows) {
      if (row.prev_hash !== prev) {
        return { ok: false, checked: rows.indexOf(row), brokenAt: row.id, genesisAt: rows[0]?.id ?? null, endHash: prev }
      }
      const recomputed = chainEntryHash({
        prevHash: prev,
        action: row.action,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        actorId: row.actor_id,
        createdAt: row.created_at,
      })
      if (!recomputed || recomputed !== row.entry_hash) {
        return { ok: false, checked: rows.indexOf(row), brokenAt: row.id, genesisAt: rows[0]?.id ?? null, endHash: prev }
      }
      prev = row.entry_hash
    }
    return { ok: true, checked: rows.length, brokenAt: null, genesisAt: rows[0]?.id ?? null, endHash: prev }
  } catch (e) {
    logger.error('audit-chain', 'verification failed', {
      error: e instanceof Error ? e.message : String(e),
    })
    return { ok: false, checked: 0, brokenAt: null, genesisAt: null, endHash: null }
  }
}
