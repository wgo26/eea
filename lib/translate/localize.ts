import 'server-only'

import { qcField, stripTags, type Lang } from './guard'

/**
 * Localization orchestrator: decides the engine per field, guards every
 * output, and degrades instead of failing.
 *
 * Layering (each step checked by lib/translate/guard before it is returned):
 *   1. Translation memory — exact source match wins for free and keeps
 *      recurring boilerplate consistent across stories.
 *   2. LLM editorial localization — rewrites into target-locale newsroom
 *      French/English (not word-for-word), preserving proper nouns, URLs and
 *      HTML structure. Used for title/excerpt/SEO and small bodies.
 *   3. DeepL — the workhorse fallback when the LLM is unconfigured/errors,
 *      and the engine for large HTML bodies (tag_handling=html).
 *
 * A field's machine output that fails QC (unchanged / wrong language) is
 * kept EMPTY rather than filled with source text — the exact class of bug
 * that put English into French fields. `warnings` tells the editor which
 * engine produced what and what was rejected, so review-before-save is
 * informed.
 */

/** DeepL language codes (uppercase), same contract as lib/translate/deepl.ts. */
export type DeepLLangCode = 'EN' | 'FR'

export type SourceFields = { title: string; excerpt: string; body: string; seoDescription: string }
export type LocalizedFields = SourceFields

export type LocalizeEngines = {
  /** DeepL batch (order-preserving). */
  deepl: (texts: string[], opts: { sourceLang: DeepLLangCode; targetLang: DeepLLangCode; html?: boolean }) => Promise<string[]>
  /** LLM configured? Cheap check first so we never build prompts for nothing. */
  llmAvailable: boolean
  /** LLM call returning a translation object; throws on failure. */
  llmLocalize?: (input: {
    source: SourceFields
    from: Lang
    to: Lang
  }) => Promise<Partial<LocalizedFields>>
  /** Exact-match translation memory lookup (title/plain text only). */
  tmLookup?: (text: string, from: Lang, to: Lang) => Promise<string | null>
}

export type FieldEngine = 'tm' | 'llm' | 'deepl' | 'source'

export type LocalizeResult = {
  fields: LocalizedFields
  /** Per-field engine that produced it; 'source' = nothing acceptable came back. */
  engines: Record<keyof LocalizedFields, FieldEngine>
  /** Editor-facing notes (fallbacks taken, rejected outputs). */
  warnings: string[]
}

/** Bodies bigger than this skip the LLM (token budget) and go straight to DeepL html mode. */
const BODY_LLM_LIMIT = 12_000

/** Multiset of HTML tag names — LLM body output must not drop or add elements. */
function tagSignature(html: string): string {
  return (html.match(/<\/?([a-z][a-z0-9]*)/gi) ?? [])
    .map((t) => t.toLowerCase())
    .sort()
    .join(',')
}

/**
 * Localize a content item's fields one locale → the other. Empty fields
 * return empty (the caller only sends what the editor filled).
 */
export async function localizeContent(
  source: SourceFields,
  from: Lang,
  to: Lang,
  engines: LocalizeEngines,
): Promise<LocalizeResult> {
  const warnings: string[] = []
  const enginesUsed: Record<keyof LocalizedFields, FieldEngine> = {
    title: 'source',
    excerpt: 'source',
    body: 'source',
    seoDescription: 'source',
  }
  const out: LocalizedFields = { title: '', excerpt: '', body: '', seoDescription: '' }
  const deeplFrom = from.toUpperCase() as DeepLLangCode
  const deeplTo = to.toUpperCase() as DeepLLangCode

  const accept = (field: keyof LocalizedFields, candidate: string, engine: FieldEngine, label: string): boolean => {
    const status = qcField(source[field], candidate, to)
    if (status === 'ok') {
      out[field] = candidate
      enginesUsed[field] = engine
      return true
    }
    if (status === 'unchanged') {
      warnings.push(`${label} returned ${field} unchanged — kept empty so English is never stored under ${to}.`)
    } else if (status === 'wrong_language') {
      warnings.push(`${label} returned ${field} in the wrong language — kept empty.`)
    }
    return false
  }

  // --- 1. Translation memory (title — the stable, short one) --------------
  if (source.title.trim() && engines.tmLookup) {
    const hit = await engines.tmLookup(source.title, from, to).catch(() => null)
    if (hit) accept('title', hit.trim(), 'tm', 'Translation memory')
  }

  // --- 2. LLM editorial pass ----------------------------------------------
  const shortEmpty = !source.title.trim() && !source.excerpt.trim() && !source.seoDescription.trim()
  const bodyFitsLlm = !!source.body.trim() && source.body.length <= BODY_LLM_LIMIT
  let llmShort: Partial<LocalizedFields> | null = null
  if (!shortEmpty || bodyFitsLlm) {
    if (engines.llmAvailable && engines.llmLocalize) {
      try {
        llmShort = await engines.llmLocalize({
          source: bodyFitsLlm ? source : { ...source, body: '' },
          from,
          to,
        })
      } catch (e) {
        warnings.push(`Editorial model unavailable (${e instanceof Error ? e.message.slice(0, 120) : 'error'}) — falling back to DeepL.`)
      }
    }
    const pendingShort = (['title', 'excerpt', 'seoDescription'] as const).filter((f) => source[f].trim() && enginesUsed[f] === 'source')
    if (llmShort) {
      for (const field of pendingShort) {
        const candidate = (llmShort[field] ?? '').trim()
        if (candidate) accept(field, candidate, 'llm', 'Editorial model')
      }
      if (bodyFitsLlm && enginesUsed.body === 'source') {
        const candidate = (llmShort.body ?? '').trim()
        if (candidate && tagSignature(candidate) === tagSignature(source.body)) {
          accept('body', candidate, 'llm', 'Editorial model')
        } else if (candidate) {
          warnings.push('Editorial model body failed the HTML structure check — using DeepL for the body.')
        }
      }
    }
  }

  // --- 3. DeepL fallback for everything still empty ------------------------
  const plainPending = (['title', 'excerpt', 'seoDescription'] as const).filter((f) => source[f].trim() && !out[f])
  const bodyPending = !!source.body.trim() && !out.body
  if (plainPending.length > 0 || bodyPending) {
    const [plainOut, bodyOut] = await Promise.all([
      plainPending.length > 0
        ? engines.deepl(plainPending.map((f) => source[f]), { sourceLang: deeplFrom, targetLang: deeplTo })
        : Promise.resolve<string[]>([]),
      bodyPending ? engines.deepl([source.body], { sourceLang: deeplFrom, targetLang: deeplTo, html: true }) : Promise.resolve<string[]>([]),
    ])
    plainPending.forEach((f, i) => {
      const candidate = (plainOut[i] ?? '').trim()
      if (candidate) accept(f, candidate, 'deepl', 'DeepL')
    })
    if (bodyPending) {
      const candidate = (bodyOut[0] ?? '').trim()
      if (candidate) {
        const translatedText = stripTags(candidate)
        if (!translatedText.trim()) {
          warnings.push('Translated body came back with no readable text — body kept empty.')
        } else {
          accept('body', candidate, 'deepl', 'DeepL')
        }
      }
    }
  }

  // Column budgets (the save path enforces the same limits).
  out.title = out.title.slice(0, 300)
  out.seoDescription = out.seoDescription.slice(0, 300)

  const rejected = (['title', 'excerpt', 'body', 'seoDescription'] as const).filter((f) => source[f].trim() && enginesUsed[f] === 'source')
  if (rejected.length > 0 && warnings.length === 0) {
    warnings.push(`No engine produced a usable translation for: ${rejected.join(', ')}.`)
  }

  return { fields: out, engines: enginesUsed, warnings }
}

/* --------------------------------------------------------------------------
 * Share-text drafting (WhatsApp line, voice registers)
 * ------------------------------------------------------------------------ */

export type ShareVoice = 'formal' | 'pidgin' | 'camfranglais'

export const SHARE_VOICES: ShareVoice[] = ['formal', 'pidgin', 'camfranglais']

export function isShareVoice(value: unknown): value is ShareVoice {
  return SHARE_VOICES.includes(value as ShareVoice)
}

export type ShareDraftEngines = {
  llmAvailable: boolean
  llmDraft?: (input: { title: string; excerpt: string; voice: ShareVoice; locale: Lang }) => Promise<string>
  deepl?: (texts: string[], opts: { sourceLang: DeepLLangCode; targetLang: DeepLLangCode }) => Promise<string[]>
}

/**
 * Draft the WhatsApp share line for the item's primary language. Pidgin /
 * Camfranglais are register rewrites for diaspora readers, not translations.
 * Returns null when no engine can produce a line — the deterministic
 * title-based fallback in the form keeps working untouched.
 */
export async function draftShareText(
  source: { title: string; excerpt: string },
  opts: { voice: ShareVoice; locale: Lang } & ShareDraftEngines,
): Promise<{ text: string; engine: 'llm' | 'deepl' } | null> {
  const title = source.title.trim()
  if (!title) return null
  if (opts.llmAvailable && opts.llmDraft) {
    try {
      const drafted = (await opts.llmDraft({ title, excerpt: source.excerpt, voice: opts.voice, locale: opts.locale })).trim()
      if (drafted && drafted.length <= 280) {
        // Only the formal line must land in the locale's standard language;
        // pidgin/camfranglais are code-mixed by design, and the guard would
        // (correctly) call them "wrong language".
        const status = qcField('', drafted, opts.locale)
        if (opts.voice !== 'formal' || status === 'ok') {
          return { text: drafted.slice(0, 280), engine: 'llm' }
        }
      }
    } catch {
      // fall through to DeepL / null
    }
  }
  // Formal FR line drafted from an EN title: translate it rather than store
  // English under the share hint. (Pidgin needs an LLM; no deterministic path.)
  if (opts.voice === 'formal' && opts.locale === 'fr' && opts.deepl) {
    const [translated] = await opts
      .deepl([title.slice(0, 280)], { sourceLang: 'EN', targetLang: 'FR' })
      .catch(() => [''] as string[])
    if (translated && qcField(title, translated.trim(), 'fr') === 'ok') {
      return { text: translated.trim().slice(0, 280), engine: 'deepl' }
    }
  }
  return null
}
