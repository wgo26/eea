import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/security/rate-limit'
import { logger } from '@/lib/observability/logger'

/**
 * W13 — privacy-preserving page-view beacon.
 *
 * Contract (privacy contract, enforced here AND documented in
 * docs/known-issues.md + the privacy policy):
 *   - accepts ONLY: surface (allow-listed), locale (en|fr), place (slug)
 *   - stores counters keyed by (UTC day, surface, locale, place) — no path,
 *     referrer, UA, IP or user id is persisted anywhere
 *   - fail-open rate limiting (a limiter outage must never eat analytics) but
 *   a strict validation boundary: anything outside the contract is a 400
 *   and is never written
 *
 * W21 — the `share-*` surfaces are share taps keyed by voice register, not
 * pages. They carry no content id: the voice is a property of the tap, so
 * the aggregate contract holds and insights can rank formal vs pidgin vs
 * camfranglais sharing with zero schema change.
 */
const SURFACES = new Set([
  'home',
  'news',
  'culture',
  'notices',
  'photo-stories',
  'buy-sell',
  'map',
  'search',
  'locations',
  'advertise',
  'submit',
  'about',
  'auth',
  'other',
  'share-formal',
  'share-pidgin',
  'share-camfranglais',
])
const LOCALES = new Set(['en', 'fr'])
const SLUG_RE = /^[a-z0-9-]{1,64}$/

export async function POST(request: Request) {
  // Fail-open: analytics is observational — a limiter outage must never
  // block page loads (unlike credential/write surfaces, which are
  // fail-closed). Abuse cost is bounded by the validation below + the
  // durable per-IP window.
  const limited = await checkRateLimit('analytics:beacon', {
    max: 60, windowMs: 60_000, policy: 'fail-open',
  })
  if (!limited.ok) {
    return new NextResponse(null, { status: 429 })
  }

  let body: { surface?: unknown; locale?: unknown; place?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 })
  }

  const surface = typeof body.surface === 'string' ? body.surface : ''
  const locale = typeof body.locale === 'string' && LOCALES.has(body.locale) ? body.locale : 'en'
  const place = typeof body.place === 'string' && SLUG_RE.test(body.place) ? body.place : ''

  if (!SURFACES.has(surface)) {
    return NextResponse.json({ error: 'Unknown surface.' }, { status: 400 })
  }

  try {
    const { error } = await createAdminClient().rpc('analytics_bump', {
      p_surface: surface,
      p_locale: locale,
      p_place: place,
      p_delta: 1,
    })
    if (error) throw new Error(error.message)
  } catch (err) {
    // Observational: log and swallow. A beacon failure must never surface
    // to the visitor (no toast, no retry storm).
    logger.warn('analytics/beacon', 'bump failed', {
      surface,
      error: err instanceof Error ? err.message : String(err),
    })
    return new NextResponse(null, { status: 204 })
  }

  return new NextResponse(null, { status: 204 })
}
