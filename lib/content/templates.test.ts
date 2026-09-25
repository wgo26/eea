import { describe, expect, it } from 'vitest'
import {
  allowedTypesFor,
  buildTemplateBlocks,
  buildTemplateIntro,
  selectTemplateSources,
  templateDraftTitles,
  type TemplateConfig,
  type TemplateSourceItem,
} from './templates'

const baseConfig: TemplateConfig = {
  name: 'This week in pictures',
  nameFr: 'La semaine en images',
  slugBase: 'this-week-in-pictures',
  section: 'photo',
  sourceType: null,
  filters: { locationSlug: null, tagSlug: null },
  windowDays: 7,
  cadence: 'weekly',
  living: true,
}

const item = (overrides: Partial<TemplateSourceItem> & { id: string }): TemplateSourceItem => ({
  type: 'photo_story',
  slug: overrides.id,
  isFeatured: false,
  publishedAt: new Date().toISOString(),
  translations: [{ locale: 'en', title: `Story ${overrides.id}`, excerpt: `Excerpt ${overrides.id}` }],
  locationSlug: null,
  tagSlugs: [],
  imageUrl: null,
  imageAlt: null,
  ...overrides,
})

describe('selectTemplateSources', () => {
  it('keeps only the section type', () => {
    const picked = selectTemplateSources(baseConfig, [
      item({ id: 'a', type: 'photo_story' }),
      item({ id: 'b', type: 'notice' }),
    ])
    expect(picked.map((s) => s.id)).toEqual(['a'])
  })

  it('honours an exact sourceType over the section default', () => {
    const cfg = { ...baseConfig, sourceType: 'news' }
    const picked = selectTemplateSources(cfg, [
      item({ id: 'a', type: 'news' }),
      item({ id: 'b', type: 'micro_story' }),
    ])
    expect(picked.map((s) => s.id)).toEqual(['a'])
  })

  it('drops items outside the window', () => {
    const old = new Date(Date.now() - 30 * 86_400_000).toISOString()
    const picked = selectTemplateSources(baseConfig, [item({ id: 'fresh' }), item({ id: 'old', publishedAt: old })])
    expect(picked.map((s) => s.id)).toEqual(['fresh'])
  })

  it('ranks featured first, then newest', () => {
    const picked = selectTemplateSources(baseConfig, [
      item({ id: 'new-plain', publishedAt: new Date(Date.now() - 1000).toISOString() }),
      item({ id: 'featured-old', isFeatured: true, publishedAt: new Date(Date.now() - 5 * 86_400_000).toISOString() }),
      item({ id: 'mid', publishedAt: new Date(Date.now() - 2 * 86_400_000).toISOString() }),
    ])
    expect(picked.map((s) => s.id)).toEqual(['featured-old', 'new-plain', 'mid'])
  })

  it('filters by location and tag slugs', () => {
    expect(
      selectTemplateSources({ ...baseConfig, filters: { locationSlug: 'douala', tagSlug: null } }, [
        item({ id: 'in', locationSlug: 'douala' }),
        item({ id: 'out', locationSlug: 'yaounde' }),
      ]).map((s) => s.id),
    ).toEqual(['in'])
    expect(
      selectTemplateSources({ ...baseConfig, filters: { locationSlug: null, tagSlug: 'music' } }, [
        item({ id: 'in', tagSlugs: ['music', 'night'] }),
        item({ id: 'out', tagSlugs: ['football'] }),
      ]).map((s) => s.id),
    ).toEqual(['in'])
  })
})

describe('buildTemplateBlocks', () => {
  it('renders one recap section per item, with links', () => {
    const blocks = buildTemplateBlocks(baseConfig, [item({ id: 'a' })], 'en', 'https://eea.test')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].type).toBe('cta')
    expect(blocks[0].heading).toContain('Story a')
    expect(blocks[0].ctaLink).toBe('https://eea.test/en/photo-stories/a')
  })

  it('adds an image block for photo items', () => {
    const blocks = buildTemplateBlocks(baseConfig, [item({ id: 'a', imageUrl: 'https://img.test/a.jpg', imageAlt: 'Alt' })], 'en', 'https://eea.test')
    expect(blocks.map((b) => b.type)).toEqual(['image', 'cta'])
    expect(blocks[0].imageUrl).toBe('https://img.test/a.jpg')
  })

  it('falls back to the first available locale and keeps fr labels', () => {
    const blocks = buildTemplateBlocks(baseConfig, [item({ id: 'a' })], 'fr', 'https://eea.test')
    expect(blocks[0].ctaText).toContain('Lire')
    expect(blocks[0].ctaLink).toBe('https://eea.test/fr/photo-stories/a')
  })

  it('skips items without a title', () => {
    const blocks = buildTemplateBlocks(
      baseConfig,
      [item({ id: 'a', translations: [{ locale: 'en', title: null, excerpt: null }] })],
      'en',
      'https://eea.test',
    )
    expect(blocks).toHaveLength(0)
  })

  it('round-trips generated blocks through serialize/parse without losing links', async () => {
    const { serializeStoryBlocks, parseStoryBlocks, mergeStoryBlocksIntoBody, blocksFromBody } = await import('./blocks')
    const blocks = buildTemplateBlocks(baseConfig, [item({ id: 'a', imageUrl: 'https://img.test/a.jpg' })], 'en', 'https://eea.test')
    const body = mergeStoryBlocksIntoBody('typed prose', serializeStoryBlocks(blocks))
    const reread = blocksFromBody(body)
    expect(reread).toHaveLength(blocks.length)
    expect(reread[1].ctaLink).toBe('https://eea.test/en/photo-stories/a')
    // The editor's typed prose survives untouched.
    expect(body.startsWith('typed prose')).toBe(true)
    expect(parseStoryBlocks(serializeStoryBlocks(blocks))[0].heading).toBe(blocks[0].heading)
  })
})

describe('buildTemplateIntro', () => {
  it('fills the count and window label', () => {
    const intro = buildTemplateIntro(baseConfig, 3, 'en', 'week of 09-19')
    expect(intro).toContain('3')
    expect(intro).toContain('week of 09-19')
  })

  it('pluralises correctly at one', () => {
    expect(buildTemplateIntro({ ...baseConfig, section: 'news' }, 1, 'en', 'w')).toContain('story')
    expect(buildTemplateIntro({ ...baseConfig, section: 'news' }, 2, 'en', 'w')).toContain('stories')
  })
})

describe('templateDraftTitles', () => {
  it('marks empty compiles in both languages', () => {
    const titles = templateDraftTitles(baseConfig, [])
    expect(titles.en).toContain('(empty)')
    expect(titles.fr).toContain('(vide)')
  })

  it('uses the template names when items exist', () => {
    const titles = templateDraftTitles(baseConfig, [item({ id: 'a' })])
    expect(titles.en).toBe('This week in pictures')
    expect(titles.fr).toBe('La semaine en images')
  })
})

describe('allowedTypesFor', () => {
  it('derives the section set when no exact type is pinned', () => {
    expect(allowedTypesFor({ ...baseConfig, section: 'news', sourceType: null })).toContain('micro_story')
    expect(allowedTypesFor({ ...baseConfig, sourceType: 'photo_story' })).toEqual(['photo_story'])
  })
})
