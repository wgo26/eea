import { describe, expect, it } from 'vitest'
import { createAdEventDedup, hash32, ipAndUserAgentKey } from './ad-dedup'

const CAMPAIGN = '3f0d1c1e-1c2b-4a3d-8e4f-5a6b7c8d9e0f'
const OTHER = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'
const T0 = 1_800_000_000_000

describe('W15 — ad beacon dedup (fraud damping)', () => {
  it('counts the first fire and swallows a repeat from the same viewer', () => {
    const dedup = createAdEventDedup()
    expect(dedup.seen(CAMPAIGN, 'impression', 'session-a', T0)).toBe(false)
    expect(dedup.seen(CAMPAIGN, 'impression', 'session-a', T0 + 1_000)).toBe(true)
    // Still deduped just inside the 30-minute impression window.
    expect(dedup.seen(CAMPAIGN, 'impression', 'session-a', T0 + 29 * 60_000)).toBe(true)
  })

  it('counts again once the impression window has passed', () => {
    const dedup = createAdEventDedup()
    dedup.seen(CAMPAIGN, 'impression', 'session-a', T0)
    expect(dedup.seen(CAMPAIGN, 'impression', 'session-a', T0 + 30 * 60_000 + 1)).toBe(false)
  })

  it('uses a 10-second window for clicks (double-fire only)', () => {
    const dedup = createAdEventDedup()
    expect(dedup.seen(CAMPAIGN, 'click', 'session-a', T0)).toBe(false)
    expect(dedup.seen(CAMPAIGN, 'click', 'session-a', T0 + 5_000)).toBe(true)
    expect(dedup.seen(CAMPAIGN, 'click', 'session-a', T0 + 10_001)).toBe(false)
  })

  it('keeps viewers, campaigns and event types independent', () => {
    const dedup = createAdEventDedup()
    expect(dedup.seen(CAMPAIGN, 'impression', 'session-a', T0)).toBe(false)
    // A different viewer on the same campaign still counts (shared carrier NAT).
    expect(dedup.seen(CAMPAIGN, 'impression', 'session-b', T0)).toBe(false)
    // Same viewer, different campaign.
    expect(dedup.seen(OTHER, 'impression', 'session-a', T0)).toBe(false)
    // Same viewer + campaign, but a click is its own event.
    expect(dedup.seen(CAMPAIGN, 'click', 'session-a', T0)).toBe(false)
  })

  it('never grows past its entry cap (attacker-controlled keys)', () => {
    const dedup = createAdEventDedup({ maxEntries: 4 })
    for (let i = 0; i < 200; i += 1) {
      dedup.seen(CAMPAIGN, 'impression', `viewer-${i}`, T0 + i)
    }
    expect(dedup.size).toBeLessThanOrEqual(4)
    dedup.reset()
    expect(dedup.size).toBe(0)
  })

  it('hashes the user agent so no raw fingerprint can be persisted', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 12; Infinix X6819) AppleWebKit/537.36'
    const key = ipAndUserAgentKey('196.207.1.9', ua)
    expect(key).not.toContain('Mozilla')
    expect(key.startsWith('196.207.1.9|')).toBe(true)
    // Stable for the same input, distinct for a different UA.
    expect(ipAndUserAgentKey('196.207.1.9', ua)).toBe(key)
    expect(ipAndUserAgentKey('196.207.1.9', 'curl/8.0')).not.toBe(key)
    expect(hash32('')).toBe(hash32(''))
  })
})
