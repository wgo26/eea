/**
 * Recap template compiler (Stream B, B2) — pure half.
 *
 * A content_templates row is a recipe: pull the window's published items
 * (section + optional exact type + optional location/tag filter), rank them
 * featured-first, and render a StoryBlock list — one block per source item
 * (image + heading + one-line excerpt + link) under a generated intro block.
 *
 * The DB side lives in ./templates-run.ts (server-only). This module has no
 * I/O so the ranking, filtering, and block shaping are unit-tested in
 * ./templates.test.ts.
 *
 * Trust rules inherited from lib/content/auto-fill.ts:
 *  1. Suggest, never assert — output is always a DRAFT; a human publishes.
 *  2. Never overwrite what the editor typed — the living mode in
 *     templates-run.ts appends only items the ledger has never compiled,
 *     and a deleted block stays deleted (its id is in the ledger).
 */

import { createStoryBlock, type StoryBlock } from './blocks'

export type TemplateSection = 'news' | 'photo' | 'notice' | 'listing' | 'culture'

export type TemplateConfig = {
  name: string
  nameFr: string | null
  slugBase: string
  section: TemplateSection
  /** Exact content_type filter (null = the section's default set). */
  sourceType: string | null
  /** Optional source narrowing keys. */
  filters: { locationSlug: string | null; tagSlug: string | null }
  windowDays: number
  cadence: 'daily' | 'weekly'
  living: boolean
}

export type TemplateSourceItem = {
  id: string
  type: string
  slug: string
  isFeatured: boolean
  publishedAt: string | null
  /** locale → title/excerpt/shareText of the source item. */
  translations: { locale: string; title: string | null; excerpt: string | null }[]
  locationSlug: string | null
  tagSlugs: string[]
  /** First image URL, when the item has photos (image blocks). */
  imageUrl: string | null
  imageAlt: string | null
}

const SECTION_TYPES: Record<TemplateSection, string[]> = {
  news: ['news', 'micro_story'],
  photo: ['photo_story'],
  notice: ['notice'],
  listing: ['listing'],
  culture: ['culture'],
}

const SECTION_SEGMENT: Record<TemplateSection, string> = {
  news: 'news',
  photo: 'photo-stories',
  notice: 'notices',
  listing: 'buy-sell',
  culture: 'culture',
}

export const SECTION_INTRO: Record<TemplateSection, { en: string; fr: string }> = {
  news: {
    en: 'The {n} community {n, plural, one {story} other {stories}} published this week, in one read.',
    fr: 'Les {n} histoires communautaires publiées cette semaine, en une lecture.',
  },
  photo: {
    en: 'The week through pictures — {n} visual {n, plural, one {story} other {stories}}.',
    fr: 'La semaine en images — {n} histoires visuelles.',
  },
  notice: {
    en: 'Every notice posted on the community board this week ({n}).',
    fr: 'Tous les avis publiés sur le tableau communautaire cette semaine ({n}).',
  },
  listing: {
    en: 'Fresh from the marketplace — {n} listings this week.',
    fr: 'Du marché — {n} annonces cette semaine.',
  },
  culture: {
    en: 'Culture this week — {n} events and stories.',
    fr: 'La culture cette semaine — {n} événements et histoires.',
  },
}

/**
 * Rank + filter source items exactly like the digest slots do: pinned-style
 * featured-first, then newest published. Filters are evaluated here (not in
 * SQL) so the ranking is pure and testable; template windows are small
 * (≤90 days, capped fetch), so post-filtering is cheap.
 */
export function selectTemplateSources(
  config: TemplateConfig,
  items: TemplateSourceItem[],
): TemplateSourceItem[] {
  const allowedTypes = config.sourceType ? [config.sourceType] : SECTION_TYPES[config.section]
  const cutoff = config.windowDays * 86_400_000
  const now = Date.now()
  return items
    .filter((item) => allowedTypes.includes(item.type))
    .filter((item) =>
      config.filters.locationSlug ? item.locationSlug === config.filters.locationSlug : true,
    )
    .filter((item) =>
      config.filters.tagSlug ? item.tagSlugs.includes(config.filters.tagSlug) : true,
    )
    .filter((item) => {
      const at = item.publishedAt ? Date.parse(item.publishedAt) : NaN
      return Number.isNaN(at) ? true : now - at <= cutoff
    })
    .sort(
      (a, b) =>
        Number(b.isFeatured) - Number(a.isFeatured) ||
        Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? ''),
    )
}

function pickLocale(
  txs: TemplateSourceItem['translations'],
  locale: 'en' | 'fr',
): { title: string; excerpt: string | null } | null {
  const hit = txs.find((t) => t.locale === locale && t.title) ?? txs.find((t) => t.title)
  if (!hit?.title) return null
  return { title: hit.title, excerpt: hit.excerpt ?? null }
}

/** Draft-body prose above the generated blocks (intro line only, kept out of the block list so append-only never touches it). */
export function buildTemplateIntro(
  config: TemplateConfig,
  itemCount: number,
  locale: 'en' | 'fr',
  windowLabel: string,
): string {
  const intro = SECTION_INTRO[config.section][locale]
    .replace('{n}', String(itemCount))
    .replace(/\{n, plural, one \{([^}]*)\} other \{([^}]*)\}\}/g, (_m, one, other) =>
      itemCount === 1 ? one : other,
    )
  return `${intro} ${windowLabel}`
}

/**
 * One recap section per source item (photo items get their image block).
 * No intro block: prose above is the editor's/`buildTemplateIntro`'s and
 * survives the append-only merge untouched.
 */
export function buildTemplateBlocks(
  config: TemplateConfig,
  items: TemplateSourceItem[],
  locale: 'en' | 'fr',
): StoryBlock[] {
  const segment = SECTION_SEGMENT[config.section]
  const blocks: StoryBlock[] = []
  for (const item of items) {
    const tx = pickLocale(item.translations, locale)
    if (!tx) continue
    const link = `/${segment}/${item.slug}`
    blocks.push(
      createStoryBlock({
        type: item.imageUrl ? 'image' : 'text',
        heading: tx.title.slice(0, 120),
        body: [tx.excerpt, link].filter(Boolean).join('\n'),
        imageUrl: item.imageUrl ?? '',
        imageAlt: item.imageAlt ?? tx.title,
        isSummary: true,
      }),
    )
  }
  return blocks
}

/** Bilingual draft titles for a compiled recap. */
export function templateDraftTitles(
  config: TemplateConfig,
  items: TemplateSourceItem[],
): { en: string; fr: string } {
  const dateLabel = new Date().toISOString().slice(0, 10)
  return {
    en: items.length > 0 ? config.name : `${config.name} — ${dateLabel} (empty)`,
    fr: items.length > 0 ? (config.nameFr ?? config.name) : `${config.nameFr ?? config.name} — ${dateLabel} (vide)`,
  }
}
