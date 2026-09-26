'use server'

/**
 * Chief-managed network blocks (System & Infrastructure → Security).
 *
 * The app has no edge firewall, so hostile addresses from the failed-login
 * heatmap are refused at the app layer instead: sign-in/sign-up return an
 * indistinguishable generic error and anonymous intake reads as throttled,
 * while the trail records the real reason. Every change is audited and the
 * enforcement cache is cleared immediately.
 */

import { assertCapability } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { clearIpBlockCache } from '@/lib/security/ip-blocklist'
import { auditEvent, fail, revalidateLocalized, type ActionResult } from './_shared'

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/
const IPV6 = /^[0-9a-fA-F:]+$/

function normalizeIp(raw: string): string | null {
  const value = raw.trim().toLowerCase()
  if (IPV4.test(value)) return value
  // IPv6: hex + colons with at least two colons (full or compressed form).
  if (value.includes(':') && (value.match(/:/g) ?? []).length >= 2 && IPV6.test(value)) return value
  return null
}

function expiryOrNull(days: number | null | undefined): string | null {
  if (days == null) return null
  if (!Number.isFinite(days) || days < 1) return null
  return new Date(Date.now() + Math.min(Math.floor(days), 3650) * 86_400_000).toISOString()
}

export async function blockIp(
  rawIp: string,
  options?: { reason?: string | null; expiresInDays?: number | null },
): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('system.owner')
    const ip = normalizeIp(rawIp)
    if (!ip) return { ok: false, error: 'That is not a valid IPv4 or IPv6 address.' }
    const admin = createAdminClient()
    const { error } = await admin.from('blocked_ips').upsert(
      {
        ip,
        reason: options?.reason?.trim().slice(0, 200) || null,
        blocked_by: ctx.user.id,
        blocked_at: new Date().toISOString(),
        expires_at: expiryOrNull(options?.expiresInDays),
      },
      { onConflict: 'ip' },
    )
    if (error) return { ok: false, error: error.message }
    clearIpBlockCache()
    await auditEvent(ctx.user.id, {
      action: 'security.ip_blocked',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'network',
      resourceId: ip,
      metadata: { reason: options?.reason?.trim().slice(0, 200) || null },
    })
    revalidateLocalized('/admin/security')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function unblockIp(rawIp: string): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('system.owner')
    const ip = normalizeIp(rawIp)
    if (!ip) return { ok: false, error: 'That is not a valid IPv4 or IPv6 address.' }
    const admin = createAdminClient()
    const { error } = await admin.from('blocked_ips').delete().eq('ip', ip)
    if (error) return { ok: false, error: error.message }
    clearIpBlockCache()
    await auditEvent(ctx.user.id, {
      action: 'security.ip_unblocked',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'network',
      resourceId: ip,
    })
    revalidateLocalized('/admin/security')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
