import { describe, expect, it } from 'vitest'

import { dominantLang, qcField, textEquals } from './guard'

const EN_SENTENCE =
  'The market traders in Bamenda are rebuilding their stalls after the fire that destroyed forty shops last week.'
const FR_SENTENCE =
  "Les commerçants du marché de Bamenda reconstruisent leurs étals après l'incendie qui a détruit quarante boutiques."

describe('dominantLang', () => {
  it('recognizes an English sentence', () => {
    expect(dominantLang(EN_SENTENCE)).toBe('en')
  })

  it('recognizes a French sentence (accents + elisions are strong signals)', () => {
    expect(dominantLang(FR_SENTENCE)).toBe('fr')
  })

  it('stays silent (null) on short text instead of guessing', () => {
    expect(dominantLang('Market fire')).toBeNull()
    expect(dominantLang('')).toBeNull()
  })

  it('classifies an untranslated echo as English (the regression this guard exists for)', () => {
    // A "translation" that returned the English source verbatim, or a
    // reworded English line, must never pass as French.
    const rewordedEnglish =
      'Traders of the Bamenda market are rebuilding the stalls that a fire destroyed last week, forty in all.'
    expect(dominantLang(rewordedEnglish)).toBe('en')
  })
})

describe('textEquals', () => {
  it('is true when only case and punctuation differ', () => {
    expect(textEquals('Hello, World!', 'hello world')).toBe(true)
  })

  it('ignores HTML tags around the same words', () => {
    expect(textEquals('<p>The fire destroyed forty shops.</p>', 'The fire destroyed forty shops')).toBe(true)
  })

  it('is false for real translations', () => {
    expect(textEquals(EN_SENTENCE, FR_SENTENCE)).toBe(false)
  })

  it('does not treat short strings as equal on accident', () => {
    expect(textEquals('Yes', 'yes')).toBe(false)
  })
})

describe('qcField', () => {
  it('passes a proper translation', () => {
    expect(qcField(EN_SENTENCE, FR_SENTENCE, 'fr')).toBe('ok')
  })

  it('rejects an unchanged copy into the other locale', () => {
    expect(qcField(EN_SENTENCE, EN_SENTENCE, 'fr')).toBe('unchanged')
  })

  it('rejects English output for a French target when it differs from source', () => {
    const rewordedEnglish =
      'Traders of the Bamenda market are rebuilding the stalls that a fire destroyed last week, forty in all.'
    expect(qcField(EN_SENTENCE, rewordedEnglish, 'fr')).toBe('wrong_language')
  })

  it('reports empty output as empty, not a failure', () => {
    expect(qcField(EN_SENTENCE, '   ', 'fr')).toBe('empty')
  })

  it('still runs the language check when there is no source', () => {
    // Share-line drafting: no source pair, output must still be target-language.
    expect(qcField('', EN_SENTENCE, 'fr')).toBe('wrong_language')
    expect(qcField('', FR_SENTENCE, 'fr')).toBe('ok')
  })
})
