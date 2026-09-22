import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/observability/logger'
import { checkRateLimit, resolveClientIpFromRequest } from '@/lib/security/rate-limit'

// Best-effort per-IP throttle (single-instance guard; the RPC itself is the
// durable write). Bots hammering pixels get 429s instead of DB rows.
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 120
const hits = new Map<string, { count: number; resetAt: number }>()

/**
 * D2 (audit): same bounded-memory fix as /api/uploads — the key is an
 * attacker-controlled IP, so prune expired entries at a hard cap and drop the
 * oldest half when the flood would otherwise pin memory.
 */
const MAX_TRACKED_IPS = 10_000

function pruneHits(now: number): void {
  if (hits.size < MAX_TRACKED_IPS) return
  for (const [key, entry] of hits) {
    if (now > entry.resetAt) hits.delete(key)
    if (hits.size < MAX_TRACKED_IPS) return
  }
  let dropped = 0
  const target = Math.ceil(MAX_TRACKED_IPS / 2)
  for (const key of hits.keys()) {
    hits.delete(key)
    if (++dropped >= target) break
  }
}

function throttled(ip: string): boolean {
  const now = Date.now()
  pruneHits(now)
  const entry = hits.get(ip)
  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return false
  }
  entry.count += 1
  return entry.count > MAX_PER_WINDOW
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Public ad-event beacon (impression/click). Session-safe: the client sends
 * an anonymous session hash it generated locally — no cookies, no PII.
 * Uses the `increment_ad_event` RPC (security definer): inserts the
 * `ad_events` row the admin reports count, and bumps the counter columns.
 * Phase 2: the RPC re-checks `status = 'active'` atomically (migration
 * 20261017000000) — the pre-check below is a fast-path only, the RPC is the
 * source of truth, so a status flip between SELECT and RPC cannot accrue.
 */
export async function POST(request: Request) {
  // Phase 0 — trusted-proxy IP so a forged XFF prefix cannot rotate the key.
  const ip = resolveClientIpFromRequest(request)
  if (throttled(ip)) {
    return NextResponse.json({ error: 'Too many events.' }, { status: 429 })
  }
  // Durable cross-instance throttle (fail-open: beacons are non-mutating
  // analytics; a limiter blip must not 500 the pixel).
  const durable = await checkRateLimit('ads:event', {
    max: 300,
    windowMs: 60_000,
    policy: 'fail-open',
  })
  if (!durable.ok) {
    return NextResponse.json({ error: 'Too many events.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const { campaignId, eventType, slotKey, sessionHash } = (body ?? {}) as {
    campaignId?: unknown
    eventType?: unknown
    slotKey?: unknown
    sessionHash?: unknown
  }
  if (typeof campaignId !== 'string' || !UUID_RE.test(campaignId)) {
    return NextResponse.json({ error: 'Invalid campaign.' }, { status: 400 })
  }
  if (eventType !== 'impression' && eventType !== 'click') {
    return NextResponse.json({ error: 'Invalid event.' }, { status: 400 })
  }
  const slot = typeof slotKey === 'string' ? slotKey.slice(0, 80) : null
  // Phase 0 — anonymous session hash for dedup (client-generated, no PII).
  // Hex, max 128 chars; anything else is dropped rather than rejected so old
  // beacons keep working.
  const session =
    typeof sessionHash === 'string' && /^[0-9a-fA-F]{8,128}$/.test(sessionHash.trim())
      ? sessionHash.trim().slice(0, 128)
      : null

  try {
    const supabase = createAdminClient()
    // Only live campaigns accrue events — ended/paused/inquiry rows are
    // acknowledged without a write so beacons never 404 on stale pages.
    const { data: live } = await supabase
      .from('ad_campaigns')
      .select('id')
      .eq('id', campaignId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle()
    if (!live) return NextResponse.json({ ok: true }, { status: 202 })

    const { error } = await supabase.rpc('increment_ad_event', {
      p_campaign_id: campaignId,
      p_event_type: eventType,
      p_session_hash: session,
      p_metadata: slot ? { slot_key: slot } : undefined,
    })
    if (error) {
      logger.error('ads-event', 'RPC failed', { error: error.message })
      return NextResponse.json({ error: 'Event failed.' }, { status: 500 })
    }
    return NextResponse.json({ ok: true }, { status: 201 })
  } catch (err) {
    logger.error('ads-event', 'exception', { error: err instanceof Error ? err.message : String(err) })
    return NextResponse.json({ error: 'Event failed.' }, { status: 500 })
  }
}
