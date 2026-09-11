import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/observability/logger'

// Best-effort per-IP throttle (single-instance guard; the RPC itself is the
// durable write). Bots hammering pixels get 429s instead of DB rows.
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 120
const hits = new Map<string, { count: number; resetAt: number }>()

function throttled(ip: string): boolean {
  const now = Date.now()
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
 */
export async function POST(request: Request) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  if (throttled(ip)) {
    return NextResponse.json({ error: 'Too many events.' }, { status: 429 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }
  const { campaignId, eventType, slotKey } = (body ?? {}) as {
    campaignId?: unknown
    eventType?: unknown
    slotKey?: unknown
  }
  if (typeof campaignId !== 'string' || !UUID_RE.test(campaignId)) {
    return NextResponse.json({ error: 'Invalid campaign.' }, { status: 400 })
  }
  if (eventType !== 'impression' && eventType !== 'click') {
    return NextResponse.json({ error: 'Invalid event.' }, { status: 400 })
  }
  const slot = typeof slotKey === 'string' ? slotKey.slice(0, 80) : null

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
      p_session_hash: null,
      p_metadata: slot ? { slot_key: slot } : null,
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
