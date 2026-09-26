import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { localizeContent, draftShareText, type LocalizeEngines } from './localize'

const EN_TITLE = 'Bamenda market traders rebuild after the fire'
const FR_TITLE = 'Les commerçants du marché de Bamenda se reconstruisent après l’incendie'
const EN_BODY = '<p>The fire destroyed forty shops last week. Traders resumed trade slowly.</p>'
const FR_BODY = '<p>L’incendie a détruit quarante boutiques. Le commerce a repris lentement.</p>'

type SourceFields = { title: string; excerpt: string; body: string; seoDescription: string }

function source(over: Partial<SourceFields> = {}): SourceFields {
  return { title: EN_TITLE, excerpt: '', body: EN_BODY, seoDescription: '', ...over }
}

function deeplReturning(translation: string): LocalizeEngines['deepl'] {
  return vi.fn().mockResolvedValue([translation])
}

describe('localizeContent', () => {
  it('uses translation memory first for an exact title hit', async () => {
    const deepl = deeplReturning('unused')
    const result = await localizeContent(source(), 'en', 'fr', {
      deepl,
      llmAvailable: false,
      tmLookup: async (text) => (text === EN_TITLE ? FR_TITLE : null),
    })
    expect(result.fields.title).toBe(FR_TITLE)
    expect(result.engines.title).toBe('tm')
  })

  it('prefers the LLM over DeepL for the short fields when configured', async () => {
    const result = await localizeContent(source(), 'en', 'fr', {
      deepl: deeplReturning('DEEPL PLAIN'),
      llmAvailable: true,
      llmLocalize: async () => ({ title: FR_TITLE, excerpt: '', body: '', seoDescription: '' }),
    })
    expect(result.fields.title).toBe(FR_TITLE)
    expect(result.engines.title).toBe('llm')
  })

  it('falls back to DeepL when the LLM throws', async () => {
    const result = await localizeContent(
      { title: EN_TITLE, excerpt: '', body: '', seoDescription: '' },
      'en',
      'fr',
      {
        deepl: deeplReturning(FR_TITLE),
        llmAvailable: true,
        llmLocalize: async () => {
          throw new Error('rate limited')
        },
      },
    )
    expect(result.engines.title).toBe('deepl')
    expect(result.warnings.some((w) => /unavailable/i.test(w))).toBe(true)
  })

  it('rejects an unchanged "translation" and keeps the field empty instead of storing English under fr', async () => {
    const result = await localizeContent(
      { title: EN_TITLE, excerpt: '', body: '', seoDescription: '' },
      'en',
      'fr',
      {
        // DeepL echoes the English source back — the exact bug class.
        deepl: vi.fn().mockResolvedValue([EN_TITLE]),
        llmAvailable: false,
      },
    )
    expect(result.fields.title).toBe('')
    expect(result.engines.title).toBe('source')
    expect(result.warnings.join(' ')).toMatch(/unchanged/)
  })

  it('rejects wrong-language LLM output (English rewording for a fr target)', async () => {
    const result = await localizeContent(
      { title: EN_TITLE, excerpt: '', body: '', seoDescription: '' },
      'en',
      'fr',
      {
        deepl: deeplReturning(FR_TITLE),
        llmAvailable: true,
        llmLocalize: async () => ({
          title: 'Fire-hit traders of Bamenda market rebuild their shops',
        }),
      },
    )
    // The LLM's English rewording must be rejected; the DeepL French title is used.
    expect(result.fields.title).toBe(FR_TITLE)
    expect(result.engines.title).toBe('deepl')
  })

  it('drops an LLM body that lost HTML structure, then uses DeepL', async () => {
    const result = await localizeContent(source(), 'en', 'fr', {
      deepl: vi.fn().mockImplementation(async (texts: string[]) =>
        texts.map((t) => (t === EN_TITLE || t.includes('</p>') ? (t === EN_TITLE ? FR_TITLE : FR_BODY) : FR_TITLE)),
      ),
      llmAvailable: true,
      llmLocalize: async () => ({
        title: FR_TITLE,
        body: 'L’incendie a détruit quarante boutiques sans balises.',
      }),
    })
    expect(result.engines.body).toBe('deepl')
    expect(result.fields.body).toBe(FR_BODY)
    expect(result.warnings.some((w) => /structure/i.test(w))).toBe(true)
  })

  it('truncates title and seo to the 300-char column budget', async () => {
    const longFr = 'Long '.repeat(100)
    const result = await localizeContent(
      { title: 'Fire'.repeat(200), excerpt: '', body: '', seoDescription: '' },
      'en',
      'fr',
      { deepl: deeplReturning(longFr.trim()), llmAvailable: false },
    )
    expect(result.fields.title.length).toBeLessThanOrEqual(300)
  })
})

describe('draftShareText', () => {
  it('uses the LLM for a pidgin line (mixed languages by design)', async () => {
    const result = await draftShareText(
      { title: EN_TITLE, excerpt: '' },
      {
        voice: 'pidgin',
        locale: 'en',
        llmAvailable: true,
        llmDraft: async () => 'Market for Bamenda dey rebuild afto fire — si how dem take start again',
      },
    )
    expect(result?.engine).toBe('llm')
    expect(result?.text).toMatch(/dey/)
  })

  it('rejects an over-budget line and returns null (no engine)', async () => {
    const result = await draftShareText(
      { title: EN_TITLE, excerpt: '' },
      { voice: 'formal', locale: 'en', llmAvailable: true, llmDraft: async () => 'x'.repeat(281) },
    )
    expect(result).toBeNull()
  })

  it('translates the formal FR line via DeepL when no LLM is configured', async () => {
    const result = await draftShareText(
      { title: EN_TITLE, excerpt: '' },
      {
        voice: 'formal',
        locale: 'fr',
        llmAvailable: false,
        deepl: deeplReturning(FR_TITLE),
      },
    )
    expect(result?.engine).toBe('deepl')
    expect(result?.text).toBe(FR_TITLE)
  })

  it('refuses to hand back an unchanged English line for fr', async () => {
    const result = await draftShareText(
      { title: EN_TITLE, excerpt: '' },
      { voice: 'formal', locale: 'fr', llmAvailable: false, deepl: deeplReturning(EN_TITLE) },
    )
    expect(result).toBeNull()
  })
})
