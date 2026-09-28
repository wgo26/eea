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

/**
 * Voice decision (Africa-wide product, Bamenda roots): identity framings say
 * "pan-African community news platform rooted in Cameroon", while the
 * LANGUAGE registers stay Cameroonian-English / Cameroonian French newsroom
 * prose plus Pidgin and Camfranglais voices — register is quality, reach is
 * geography, and only the geography generalizes.
 */
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
    'You are the translation desk of Eagle Eye Africa, a bilingual (EN/FR) pan-African community news platform rooted in Cameroon.',
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
    'You write WhatsApp share lines for Eagle Eye Africa, a pan-African community news platform rooted in Cameroon, read by diaspora on WhatsApp.',
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
  return llmConfigured() && process.env.LLM_DISABLED !== '1'
}

/* ------------------------------------------------------------------ */
/* Tier 1 — true content drafting (requires LLM_API_KEY). Every fn     */
/* abstains (throws or returns null-ish) rather than guessing, so the  */
/* Tier 0 deterministic heuristics stay the honest fallback.           */
/* ------------------------------------------------------------------ */

/** 3 headline options + SEO/WhatsApp variants for the form's title row. */
export async function llmDraftHeadlines(input: { topic: string; body: string; locale: Lang }): Promise<string[]> {
  const system = [
    'You are the headline desk of a pan-African community news platform. Write 3 distinct, accurate headlines.',
    'Rules: max 90 chars each, no clickbait that misrepresents the story, keep proper nouns/numbers exact.',
    'Reply with ONLY a JSON object: {"headlines": [string, string, string]}',
  ].join('\n')
  const out = await chatJson<{ headlines: string[] }>(
    [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify({ topic: input.topic.slice(0, 500), body: input.body.slice(0, 3000), locale: input.locale }) },
    ],
    (v): v is { headlines: string[] } =>
      !!v && typeof v === 'object' && Array.isArray((v as Record<string, unknown>).headlines) &&
      ((v as { headlines: unknown[] }).headlines.length >= 1) &&
      ((v as { headlines: unknown[] }).headlines.every((h) => typeof h === 'string')),
    { maxTokens: 600, temperature: 0.7 },
  )
  return out.headlines.map((h) => h.trim()).filter(Boolean).slice(0, 3)
}

/** Editorial excerpt + SEO pair rewritten for the target locale. */
export async function llmDraftExcerptSeo(input: {
  title: string
  body: string
  locale: Lang
}): Promise<{ excerpt: string; seoDescription: string }> {
  const system = [
    `You are the excerpt desk. Write in ${LOCALE_NAME[input.locale]} newsroom prose.`,
    'excerpt: 1-2 sentences, max 280 chars, the lead — not the first sentence copied.',
    'seoDescription: max 155 chars, click-worthy for search, not a literal translation.',
    'Reply with ONLY JSON: {"excerpt": string, "seoDescription": string}',
  ].join('\n')
  return chatJson<{ excerpt: string; seoDescription: string }>(
    [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify({ title: input.title.slice(0, 500), body: input.body.slice(0, 4000) }) },
    ],
    (v): v is { excerpt: string; seoDescription: string } => {
      if (!v || typeof v !== 'object') return false
      const r = v as Record<string, unknown>
      return typeof r.excerpt === 'string' && typeof r.seoDescription === 'string'
    },
    { maxTokens: 800, temperature: 0.4 },
  )
}

/** Entity/tag extraction mapped against the site's existing tag vocabulary. */
export async function llmSuggestEntities(input: {
  title: string
  body: string
  knownTags: string[]
}): Promise<{ tags: string[]; entities: { people: string[]; places: string[]; orgs: string[] } }> {
  const system = [
    'Extract tags + named entities from an African community story.',
    `Known site tags: ${input.knownTags.slice(0, 60).join(', ') || '(none)'}. Prefer reusing a known tag (exact match) over inventing a near-duplicate.`,
    'Max 8 tags, lowercase, no hashtags. People/places/orgs: as named in text.',
    'Reply with ONLY JSON: {"tags": string[], "people": string[], "places": string[], "orgs": string[]}',
  ].join('\n')
  const out = await chatJson<{ tags: string[]; people: string[]; places: string[]; orgs: string[] }>(
    [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify({ title: input.title.slice(0, 500), body: input.body.slice(0, 4000) }) },
    ],
    (v): v is { tags: string[]; people: string[]; places: string[]; orgs: string[] } => {
      if (!v || typeof v !== 'object') return false
      const r = v as Record<string, unknown>
      return Array.isArray(r.tags) && Array.isArray(r.people) && Array.isArray(r.places) && Array.isArray(r.orgs)
    },
    { maxTokens: 800, temperature: 0.3 },
  )
  const clean = (xs: unknown): string[] => (Array.isArray(xs) ? xs.filter((x): x is string => typeof x === 'string').map((x) => x.trim()).filter(Boolean).slice(0, 8) : [])
  return { tags: clean(out.tags), entities: { people: clean(out.people), places: clean(out.places), orgs: clean(out.orgs) } }
}

export type AiClassification = {
  categoryId: string | null
  locationId: string | null
  confidence: number
  rationale: string
  alternatives: { id: string; name: string }[]
}

/**
 * Classify title+body against the site's real taxonomy ids (passed in).
 * Returns null-ids + low confidence when unclear — the form keeps the
 * select honestly empty rather than mis-shipping the post site-wide.
 */
export async function llmClassify(input: {
  title: string
  body: string
  categories: { id: string; name: string }[]
  locations: { id: string; name: string }[]
}): Promise<AiClassification> {
  const system = [
    'Classify an African community post against the provided taxonomy. IDs must come verbatim from the lists.',
    'If the text gives no clear answer, return null ids with confidence 0 and explain why.',
    'Reply with ONLY JSON: {"categoryId": string|null, "locationId": string|null, "confidence": number, "rationale": string, "alternatives": [{"id": string, "name": string}]}',
  ].join('\n')
  return chatJson<AiClassification>(
    [
      { role: 'system', content: system },
      {
        role: 'user',
        content: JSON.stringify({
          title: input.title.slice(0, 500),
          body: input.body.slice(0, 4000),
          categories: input.categories.slice(0, 80),
          locations: input.locations.slice(0, 120),
        }),
      },
    ],
    (v): v is AiClassification => {
      if (!v || typeof v !== 'object') return false
      const r = v as Record<string, unknown>
      return (
        (r.categoryId === null || typeof r.categoryId === 'string') &&
        (r.locationId === null || typeof r.locationId === 'string') &&
        typeof r.confidence === 'number' &&
        typeof r.rationale === 'string'
      )
    },
    { maxTokens: 800, temperature: 0.2 },
  )
}

/** Verification-badge suggestion + fact-check checklist for the editor. */
export async function llmVerificationSuggest(input: { title: string; body: string }): Promise<{
  badge: 'verified' | 'community_submission' | 'official_source' | 'developing'
  reasons: string[]
  checklist: string[]
}> {
  const system = [
    'You are a verification editor. Suggest ONE badge: verified (confirmed by evidence/official doc), official_source (published by an identified org), community_submission (single witness account), developing (still unfolding).',
    'Also list 3-5 concrete checks (call X, confirm date, verify location).',
    'Reply with ONLY JSON: {"badge": string, "reasons": string[], "checklist": string[]}',
  ].join('\n')
  return chatJson<{ badge: 'verified' | 'community_submission' | 'official_source' | 'developing'; reasons: string[]; checklist: string[] }>(
    [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify({ title: input.title.slice(0, 500), body: input.body.slice(0, 4000) }) },
    ],
    (v): v is { badge: 'verified' | 'community_submission' | 'official_source' | 'developing'; reasons: string[]; checklist: string[] } => {
      if (!v || typeof v !== 'object') return false
      const r = v as Record<string, unknown>
      return typeof r.badge === 'string' && Array.isArray(r.reasons) && Array.isArray(r.checklist)
    },
    { maxTokens: 800, temperature: 0.2 },
  )
}

/**
 * P4 — moderation triage (opt-in, flag ai.moderation_triage, default OFF).
 * Scores a community submission for spam/scam/toxicity/PII exposure and
 * suggests ONE action. Advisory only: the reviewer always decides; nothing
 * auto-rejects. Abstains (low scores + "review normally") on benign text.
 */
export async function llmModerationTriage(input: { text: string; hasPhotos: boolean }): Promise<{
  spam: number
  scam: number
  toxicity: number
  pii: boolean
  overall: number
  flags: string[]
  suggestedAction: 'approve' | 'review' | 'clarify' | 'reject'
  rationale: string
}> {
  const system = [
    'You are a trust & safety triage assistant for a pan-African community news platform.',
    'Score 0..1: spam (ads, link dumps,重复 promos), scam (fake giveaways, money requests, impersonation), toxicity (hate, threats, harassment). pii: true if phone/email/ID/address of a PRIVATE person is exposed.',
    'overall = max(spam, scam, toxicity) (+0.2 if pii, capped 1). suggestedAction: reject if overall>=0.85, clarify if 0.6-0.85, review if 0.35-0.6, approve below.',
    'flags: short tags like ["link-dump", "money-request", "phone-exposed"]. rationale: 1-2 sentences for the human reviewer.',
    'Reply with ONLY JSON: {"spam": number, "scam": number, "toxicity": number, "pii": boolean, "overall": number, "flags": string[], "suggestedAction": string, "rationale": string}',
  ].join('\n')
  return chatJson<{
    spam: number
    scam: number
    toxicity: number
    pii: boolean
    overall: number
    flags: string[]
    suggestedAction: 'approve' | 'review' | 'clarify' | 'reject'
    rationale: string
  }>(
    [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify({ text: input.text.slice(0, 4000), hasPhotos: input.hasPhotos }) },
    ],
    (v): v is {
      spam: number
      scam: number
      toxicity: number
      pii: boolean
      overall: number
      flags: string[]
      suggestedAction: 'approve' | 'review' | 'clarify' | 'reject'
      rationale: string
    } => {
      if (!v || typeof v !== 'object') return false
      const r = v as Record<string, unknown>
      return (
        typeof r.spam === 'number' &&
        typeof r.scam === 'number' &&
        typeof r.toxicity === 'number' &&
        typeof r.pii === 'boolean' &&
        typeof r.overall === 'number' &&
        Array.isArray(r.flags) &&
        typeof r.suggestedAction === 'string' &&
        typeof r.rationale === 'string'
      )
    },
    { maxTokens: 600, temperature: 0.1 },
  )
}

/**
 * P5 — repurpose engine: one story → every distribution surface.
 * Returns channel-ready copy; the form applies per-output on tap.
 */
export async function llmRepurpose(input: {
  title: string
  excerpt: string
  body: string
  locale: Lang
}): Promise<{
  whatsapp: string
  social: string
  micro: string
  pidgin: string
  emailSubject: string
}> {
  const system = [
    `You are the distribution desk for a pan-African community news platform (${LOCALE_NAME[input.locale]}). Repurpose one story for every surface.`,
    'whatsapp: 1-2 line share text, max 280 chars, at most one emoji. social: single post, max 240 chars, no hashtag spam. micro: Eye-on-the-Street 50-100 word vignette. pidgin: the whatsapp line rewritten in Cameroonian Pidgin. emailSubject: under 70 chars.',
    'Never invent facts not in the source. Keep proper nouns/numbers exact.',
    'Reply with ONLY JSON: {"whatsapp": string, "social": string, "micro": string, "pidgin": string, "emailSubject": string}',
  ].join('\n')
  return chatJson<{
    whatsapp: string
    social: string
    micro: string
    pidgin: string
    emailSubject: string
  }>(
    [
      { role: 'system', content: system },
      {
        role: 'user',
        content: JSON.stringify({
          title: input.title.slice(0, 500),
          excerpt: input.excerpt.slice(0, 1000),
          body: input.body.slice(0, 3500),
        }),
      },
    ],
    (v): v is { whatsapp: string; social: string; micro: string; pidgin: string; emailSubject: string } => {
      if (!v || typeof v !== 'object') return false
      const r = v as Record<string, unknown>
      return ['whatsapp', 'social', 'micro', 'pidgin', 'emailSubject'].every((k) => typeof r[k] === 'string')
    },
    { maxTokens: 1200, temperature: 0.6 },
  )
}

/**
 * P5 — morning editor brief: 5 prioritized bullets from the overnight
 * numbers. Pure writer; the data assembly lives in lib/ai/briefing.ts.
 */
export async function llmMorningBrief(input: {
  locale: Lang
  stats: Record<string, number | string>
}): Promise<{ bullets: string[] }> {
  const system = [
    'You are the night editor handing over to a solo operator. Write EXACTLY 5 bullets, most urgent first, each starting with a verb and naming the count + where to click (e.g. "Clear 4 pending submissions in Moderation").',
    'No fluff, no greeting, no 6th bullet. If everything is zero, say what to build instead of what to clear.',
    'Reply with ONLY JSON: {"bullets": [string, string, string, string, string]}',
  ].join('\n')
  return chatJson<{ bullets: string[] }>(
    [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify({ locale: input.locale, stats: input.stats }) },
    ],
    (v): v is { bullets: string[] } =>
      !!v && typeof v === 'object' && Array.isArray((v as Record<string, unknown>).bullets),
    { maxTokens: 600, temperature: 0.4 },
  )
}

/**
 * P5 — weekly retro narrator for /admin/insights: what grew, what flopped,
 * 3 bets for next week. Numbers in, prose out; the page passes aggregates.
 */
export async function llmWeeklyRetro(input: {
  locale: Lang
  stats: Record<string, number | string>
  topTitles: string[]
}): Promise<{ grew: string; flopped: string; bets: string[] }> {
  const system = [
    'You are the analyst for a solo-run community news platform. Read the week’s aggregates and write a tight retro.',
    'grew: one sentence on the clearest win with its number. flopped: one sentence on the clearest miss with its number. bets: exactly 3 concrete next-week actions, each under 20 words.',
    'Reply with ONLY JSON: {"grew": string, "flopped": string, "bets": [string, string, string]}',
  ].join('\n')
  return chatJson<{ grew: string; flopped: string; bets: string[] }>(
    [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify({ locale: input.locale, stats: input.stats, top: input.topTitles.slice(0, 8) }) },
    ],
    (v): v is { grew: string; flopped: string; bets: string[] } => {
      if (!v || typeof v !== 'object') return false
      const r = v as Record<string, unknown>
      return typeof r.grew === 'string' && typeof r.flopped === 'string' && Array.isArray(r.bets)
    },
    { maxTokens: 800, temperature: 0.5 },
  )
}

/**
 * P6-final — trust & safety drafters. Both produce a *starting* resolution
 * note the reviewer edits before saving: the register prints what they
 * approve, so the draft must be neutral, factual and short.
 */
export async function llmDraftCorrectionNote(input: {
  correctionText: string
  contentTitle: string
  locale: Lang
}): Promise<{ note: string }> {
  const system = [
    `Write a public correction-register note in ${LOCALE_NAME[input.locale]} (max 280 chars).`,
    'Shape: what the reader reported → what the newsroom changed → no blame, no legalese, no reporter identity.',
    'If the report is vague, write the note as a verification statement ("We re-checked … and confirm …").',
    'Reply with ONLY JSON: {"note": string}',
  ].join('\n')
  return chatJson<{ note: string }>(
    [
      { role: 'system', content: system },
      {
        role: 'user',
        content: JSON.stringify({ report: input.correctionText.slice(0, 1500), story: input.contentTitle.slice(0, 300) }),
      },
    ],
    (v): v is { note: string } => !!v && typeof v === 'object' && typeof (v as Record<string, unknown>).note === 'string',
    { maxTokens: 400, temperature: 0.3 },
  )
}

export async function llmDraftReportResponse(input: {
  reportType: string
  subject: string
  description: string
  contentTitle: string
  locale: Lang
}): Promise<{ note: string }> {
  const system = [
    `Write an internal resolution note in ${LOCALE_NAME[input.locale]} (max 280 chars) for a community report.`,
    'State the finding plainly (upheld / no violation / needs edit), the action taken, and the next step if any. Never promise takedowns unconditionally.',
    'Reply with ONLY JSON: {"note": string}',
  ].join('\n')
  return chatJson<{ note: string }>(
    [
      { role: 'system', content: system },
      {
        role: 'user',
        content: JSON.stringify({
          type: input.reportType.slice(0, 100),
          subject: input.subject.slice(0, 300),
          details: input.description.slice(0, 1500),
          story: input.contentTitle.slice(0, 300),
        }),
      },
    ],
    (v): v is { note: string } => !!v && typeof v === 'object' && typeof (v as Record<string, unknown>).note === 'string',
    { maxTokens: 400, temperature: 0.3 },
  )
}

/**
 * Draft the message a reviewer sends to a contributor about their submission:
 * a rejection reason or a clarification question. Tone matters — the submitter
 * is notified — so the model drafts from the reviewer's points (or the bare
 * submission when they typed none) and the reviewer edits before sending.
 * Lands in the form textarea, never sent directly.
 */
export async function llmDraftModerationResponse(input: {
  decision: 'reject' | 'clarify'
  submissionType: string
  submissionText: string
  points: string
  locale: Lang
}): Promise<{ note: string }> {
  const system = [
    `You are an editor of Eagle Eye Africa writing to a community contributor in ${LOCALE_NAME[input.locale]} (max 400 chars).`,
    input.decision === 'reject'
      ? 'Shape: thank them for the submission → the plain reason it cannot be published (from the reviewer points) → what would make it publishable, when anything would. No blame, no legalese, no internal jargon.'
      : 'Shape: thank them for the submission → the specific questions the newsroom needs answered before deciding (from the reviewer points). Numbered when more than one.',
    'Reply with ONLY JSON: {"note": string}',
  ].join('\n')
  return chatJson<{ note: string }>(
    [
      { role: 'system', content: system },
      {
        role: 'user',
        content: JSON.stringify({
          type: input.submissionType.slice(0, 60),
          submission: input.submissionText.slice(0, 1500),
          reviewer_points: input.points.slice(0, 600),
        }),
      },
    ],
    (v): v is { note: string } => !!v && typeof v === 'object' && typeof (v as Record<string, unknown>).note === 'string',
    { maxTokens: 500, temperature: 0.4 },
  )
}

/** WhatsApp digest intro + subject lines (per locale, char-budgeted). */
export async function llmDigestIntro(input: {
  locale: Lang
  dateLabel: string
  headlines: string[]
}): Promise<{ intro: string; subject: string }> {
  const system = [
    `Write a 1-2 line WhatsApp digest intro in ${LOCALE_NAME[input.locale]} + an email subject under 70 chars. Warm, specific, no emoji spam (max one).`,
    'Reply with ONLY JSON: {"intro": string, "subject": string}',
  ].join('\n')
  return chatJson<{ intro: string; subject: string }>(
    [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify({ date: input.dateLabel, headlines: input.headlines.slice(0, 12) }) },
    ],
    (v): v is { intro: string; subject: string } => {
      if (!v || typeof v !== 'object') return false
      const r = v as Record<string, unknown>
      return typeof r.intro === 'string' && typeof r.subject === 'string'
    },
    { maxTokens: 400, temperature: 0.6 },
  )
}
