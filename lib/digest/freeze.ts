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
  const contentItemId = (value as Record<string, unknown>).contentItemId
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
    contentItemId: typeof contentItemId === 'string' && contentItemId ? contentItemId.slice(0, 40) : null,
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

/**
 * Cross-issue dedupe: drop stories whose content id (or path fallback for
 * pre-v2 freezes) was already delivered. Edits to an already-published
 * row keep the same id/path, so they can never re-enter as "today".
 */
export function dedupeStories(stories: BriefStory[], seenIds: Set<string>, seenPaths: Set<string>): BriefStory[] {
  const out: BriefStory[] = []
  for (const s of stories) {
    const idKey = s.contentItemId ?? null
    if (idKey && seenIds.has(idKey)) continue
    if (!idKey && seenPaths.has(s.path)) continue
    out.push(s)
    if (idKey) seenIds.add(idKey)
    seenPaths.add(s.path)
  }
  return out
}
