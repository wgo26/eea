/**
 * W15 — fraud damping for the public ad beacon.
 *
 * The volume limiter (`rate-limit.ts`) bounds how *many* fires an IP can send;
 * it does nothing about *inflation*: one device that re-renders a slot
 * (client re-mount, scroll jitter, back-navigation, a bot cycling the page)
 * writes a fresh `ad_events` row per fire, and the advertiser is billed on
 * those counters. This module adds a coarse "same viewer, same event" window
 * so a repeat only counts once:
 *
 *   • key  = campaign + event type + viewer identity
 *   • TTL  = 30 min for impressions, 10 s for clicks (a click is a deliberate
 *            one-shot; the short window only swallows double-fire)
 *
 * Viewer identity is the client's anonymous per-visit session hash when
 * present — legitimate shared-NAT traffic (one carrier IP, many phones, the
 * norm on mobile networks here) then never collapses. `ipAndUserAgentKey()` is
 * the coarse fallback for beacons that arrive without a session hash.
 *
 * Privacy: the store is process memory only, nothing is persisted, and the UA
 * is kept as a non-reversible 32-bit hash — no fingerprint reaches the
 * database (the W13 aggregate-only contract holds).
 *
 * Bounded memory: the key is attacker-influenced, so the store prunes expired
 * entries at a hard cap and drops the oldest half under flood (same discipline
 * as the /api/uploads and /api/ads/event IP limiters).
 */

export type AdEventType = 'impression' | 'click'

const IMPRESSION_DEDUP_MS = 30 * 60_000
const CLICK_DEDUP_MS = 10_000
const DEFAULT_MAX_ENTRIES = 20_000

/** FNV-1a (32-bit) — cheap and non-reversible; we never read the UA back. */
export function hash32(value: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

/** Coarse viewer identity for beacons with no session hash. */
export function ipAndUserAgentKey(ip: string, userAgent: string | null): string {
  return `${ip}|${hash32(userAgent ?? '')}`
}

export type AdEventDedup = {
  /** True when this (campaign, event, viewer) triple already counted. */
  seen(campaignId: string, eventType: AdEventType, viewerKey: string, now?: number): boolean
  /** Tracked keys — exposed so tests (and future metrics) can assert the bound. */
  readonly size: number
  reset(): void
}

export function createAdEventDedup(options?: { maxEntries?: number }): AdEventDedup {
  const store = new Map<string, number>()
  const maxEntries = options?.maxEntries ?? DEFAULT_MAX_ENTRIES

  function prune(now: number): void {
    if (store.size < maxEntries) return
    for (const [key, expiresAt] of store) {
      if (now > expiresAt) store.delete(key)
      if (store.size < maxEntries) return
    }
    let dropped = 0
    const target = Math.ceil(maxEntries / 2)
    for (const key of store.keys()) {
      store.delete(key)
      if (++dropped >= target) break
    }
  }

  return {
    seen(campaignId, eventType, viewerKey, now = Date.now()) {
      const ttl = eventType === 'click' ? CLICK_DEDUP_MS : IMPRESSION_DEDUP_MS
      const key = `${campaignId}:${eventType}:${viewerKey}`
      const expiresAt = store.get(key)
      if (expiresAt !== undefined && now <= expiresAt) return true
      prune(now)
      store.set(key, now + ttl)
      return false
    },
    get size() {
      return store.size
    },
    reset() {
      store.clear()
    },
  }
}
