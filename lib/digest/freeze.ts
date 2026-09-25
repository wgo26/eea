/**
 * digest_freeze result parsing — the single shape both the cron routes and
 * the admin preview read, so a freeze-RPC drift fails in one tested place.
 *
 * lib/digest/freeze.test.ts pins it. No I/O.
 */
import type { BriefStory } from './brief'

export type FrozenDigest = Partial<Record<'en' | 'fr', BriefStory[]>>

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/**
 * Validate one story row off the JSONB. Paths must be relative section paths
 * (`buildDailyBrief` concatenates them onto the site origin; an absolute URL
 * there would double the origin). A malformed row drops the whole result —
 * fail closed so a corrupted freeze never half-delivers.
 */
function parseStory(value: unknown): BriefStory | null {
  if (!isRecord(value)) return null
  const { title, type, path } = value
  const shareText = value.shareText
  const locationId = value.locationId
  const categoryId = value.categoryId
  if (typeof title !== 'string' || !title) return null
  if (typeof type !== 'string' || !type) return null
  if (typeof path !== 'string' || !path.startsWith('/') || path.includes('://')) return null
  return {
    title: title.slice(0, 240),
    type,
    path: path.slice(0, 240),
    shareText: typeof shareText === 'string' && shareText ? shareText.slice(0, 280) : null,
    locationId: typeof locationId === 'string' && locationId ? locationId : null,
    categoryId: typeof categoryId === 'string' && categoryId ? categoryId : null,
  }
}

/** Parse the digest_freeze JSONB (`{en:[...],fr:[...]}`) into per-locale story lists. */
export function parseDigestFreeze(data: unknown): FrozenDigest {
  if (!isRecord(data)) return {}
  const out: FrozenDigest = {}
  for (const locale of ['en', 'fr'] as const) {
    const rows = data[locale]
    if (rows == null) continue
    if (!Array.isArray(rows)) return {}
    const stories: BriefStory[] = []
    for (const row of rows) {
      const story = parseStory(row)
      if (!story) return {}
      stories.push(story)
    }
    out[locale] = stories
  }
  return out
}

/** True when either locale has at least one story. */
export function hasFrozenStories(frozen: FrozenDigest): boolean {
  return (frozen.en?.length ?? 0) > 0 || (frozen.fr?.length ?? 0) > 0
}
