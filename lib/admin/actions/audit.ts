'use server'

/**
 * Audit-trail operations (System & Infrastructure → Audit log).
 *
 * Read-only by design: verification replays the hash chain without writing.
 * The monthly cold-archive cron seals bundles independently; this action is
 * the on-demand "prove the trail is intact" button for the audit page.
 */

import { assertCapability } from '@/lib/admin/auth'
import { verifyChainWindow, type ChainVerification } from '@/lib/security/audit-chain'
import { fail } from './_shared'

export type ChainVerifyResult =
  | { ok: true; checked: number }
  | { ok: false; error: string; checked?: number; brokenAt?: string | null }

export async function verifyAuditChain(): Promise<ChainVerifyResult> {
  try {
    await assertCapability('system.owner')
    // Page from genesis carrying continuity — a single spot-check would only
    // prove internal consistency of one arbitrary window.
    let prev: string | null | undefined
    let anchored = false
    let checked = 0
    for (;;) {
      const verdict: ChainVerification = await verifyChainWindow(
        anchored ? { limit: 5000, prev: prev ?? null } : { limit: 5000 },
      )
      if (!verdict.ok) {
        return {
          ok: false,
          error: 'The hash chain is broken — investigate before trusting recent rows.',
          checked: checked + verdict.checked,
          brokenAt: verdict.brokenAt,
        }
      }
      checked += verdict.checked
      prev = verdict.endHash
      anchored = true
      if (verdict.checked < 5000) break
      // Bound the click: the archive cron covers the full history monthly.
      if (checked >= 50000) break
    }
    return { ok: true, checked }
  } catch (e) {
    return fail(e)
  }
}
