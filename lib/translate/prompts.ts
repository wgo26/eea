import 'server-only'

import { chatCompletion, chatJson, llmConfigured, type LlmMessage } from './llm'
import type { LocalizedFields, ShareVoice, SourceFields } from './localize'
import type { Lang } from './guard'

/**
 * Prompt layer for the editorial model. Kept apart from the transport
 * (llm.ts) and the engine policy (localize.ts) so the editorial brief —
 * the thing that should be iterated on when output quality disappoints —
 * is one readable file.
 */

const LOCALE_NAME: Record<Lang, string> = { en: 'English', fr: 'French' }

const STYLE_BRIEF: Record<Lang, string> = {
  en: 'Write in clear Cameroonian-English newsroom prose. Active voice, short sentences, no gallicisms ("finally" for "eventually", "to realize" for "to notice").',
  fr: 'Écris dans un français journalistique camerounais clair et naturel — jamais une traduction littérale de l\'anglais. Proscris les anglicismes ("opportunité" pour "occasion", "développer" pour "couvrir"), respecte la typographie (espace avant ! ? ; :, accents sur les majuscules).',
}

/**
 * Localize story fields editorially. The body is handled by the LLM only for
 * small HTML bodies; the prompt tells it so explicitly, and the caller
 * structure-checks the result before accepting it.
 */
export async function llmLocalizeFields(input: {
  source: SourceFields
  from: Lang
  to: Lang
}): Promise<Partial<LocalizedFields>> {
  const { source, from, to } = input
  const hasBody = !!source.body.trim()
  const system = [
    'You are the translation desk of Eye on Cameroon / L\'Œil sur le Cameroun, a bilingual (EN/FR) Cameroon news site.',
    'You are NOT a word-for-word machine translator. You rewrite the story so a native reader of the target language finds it natural, accurate and publication-ready.',
    'Hard rules:',
    '- Translate every field into ' + LOCALE_NAME[to] + '. Never return the source text. If the source is already fully in ' + LOCALE_NAME[to] + ', still return a natural ' + LOCALE_NAME[to] + ' phrasing of it.',
    '- Keep proper nouns, organisation names, numbers, currencies (XAF/FCFA), phone/WhatsApp numbers and URLs exactly as they are.',
    '- seo_description: max 155 characters, written to attract clicks in search results in the target language (do not translate the English one literally).',
    '- title: max 300 chars, a natural headline in ' + LOCALE_NAME[to] + '.',
    '- excerpt: 1-2 sentences summarising the lead.',
    hasBody
      ? '- body: keep the HTML structure EXACTLY — same tags, same order, same attributes (src, href, alt values you may translate). Only text nodes change. Keep <!-- --> comments untouched.'
      : '- body: empty string.',
    'Reply with ONLY a JSON object: {"title": string, "excerpt": string, "body": string, "seoDescription": string}',
  ].join('\n')

  const user = JSON.stringify({
    source_locale: from,
    target_locale: to,
    style: STYLE_BRIEF[to],
    fields: source,
  })

  const messages: LlmMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]

  return chatJson<Partial<LocalizedFields>>(
    messages,
    (v): v is Partial<LocalizedFields> => {
      if (!v || typeof v !== 'object') return false
      const rec = v as Record<string, unknown>
      return ['title', 'excerpt', 'body', 'seoDescription'].every(
        (k) => rec[k] === undefined || typeof rec[k] === 'string',
      )
    },
    { maxTokens: hasBody ? 8000 : 2000, temperature: 0.3 },
  )
}

/** Draft the WhatsApp share line in a voice register (≤280 chars). */
export async function llmDraftShareLine(input: {
  title: string
  excerpt: string
  voice: ShareVoice
  locale: Lang
}): Promise<string> {
  const VOICE_BRIEF: Record<ShareVoice, string> = {
    formal:
      input.locale === 'fr'
        ? 'Un français journalistique concis et neutre, prêt pour un canal officiel.'
        : 'A crisp, neutral newsroom English one-liner, fit for an official channel.',
    pidgin:
      'Cameroonian Pidgin English (the way people actually speak in Douala/Bamenda street market): "dem", "no be", "na so", "wan tor", "chop", "abi". Keep it intelligible, never offensive, never parody.',
    camfranglais:
      'Camfranglais (Yaoundé street French blended with local slang): "bana", "ngwa", "mboa", "débarras", "zam", "le na", "ça tourne". Natural urban register, never a caricature.',
  }
  const system = [
    'You write WhatsApp share lines for Eye on Cameroon / L\'Œil sur le Cameroun, a Cameroon news site read by diaspora on WhatsApp.',
    'The line must make someone tap. Max 280 characters. No hashtags, no emoji spam (at most one emoji), no clickbait that misrepresents the story.',
    `Register: ${VOICE_BRIEF[input.voice]}`,
    'Return ONLY the share line text, nothing else.',
  ].join('\n')
  const user = JSON.stringify({
    article_title: input.title.slice(0, 2000),
    article_summary: input.excerpt.slice(0, 1500),
    language: LOCALE_NAME[input.locale],
    voice: input.voice,
  })
  const text = await chatCompletion(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { temperature: 0.6, maxTokens: 300 },
  )
  return text.replace(/^["“].*["”]$/s, (m) => m.slice(1, -1)).trim()
}

export function llmReady(): boolean {
  return llmConfigured()
}
