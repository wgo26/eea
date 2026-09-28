/**
 * Submission payload → content-form values (client-safe: no network, no DB).
 *
 * A citizen's submission arrives as a flat `Record<string, string>` whose keys
 * depend on which public submit form produced it. The review screen turns that
 * into a post, so the mapping from payload keys to form fields has to live
 * somewhere honest — not inline in a dialog, where it can only be read in
 * context and never tested.
 *
 * The payload contract is `PAYLOAD_FIELDS` in lib/public/actions.ts, validated
 * per type by `validateSubmissionContent`:
 *   photo_story → what
 *   news / culture → headline + description
 *   notice  → noticeType (allowlisted) + item + message
 *   buy_sell → category (allowlisted) + item + description (+ price/currency)
 * Media keys (photos/videos/audios/documents) are newline-joined
 * "https://… - caption" lines, URL-filtered at intake.
 *
 * Three rules keep this honest:
 *  1. Never invent a translation. Text with no locale evidence lands in ONE
 *     column (the reviewer's), never both — copying it into the other locale is
 *     how untranslated English got published as French.
 *  2. Never invent a taxonomy id. `location_id` is honored only when it matches
 *     a location the form can actually offer.
 *  3. Report what was dropped. Unconsumed keys come back in `unmapped` so the
 *     reviewer can see the form is not hiding their data.
 */

export type SubmissionPayload = Record<string, unknown>

export type Option = { id: string; name: string }

export type PrefillInput = {
  payload: SubmissionPayload | null
  /** photo_story | news | culture | notice | buy_sell */
  submissionType: string
  locations: Option[]
  /** Category options for the content type this submission will become. */
  categories: Option[]
}

/** The fields this produces are a subset of the content form's FormValues. */
export type SubmissionPrefill = {
  values: Record<string, string>
  /** Photos parsed from the payload's newline "url - caption" lines. */
  photos: { url: string; caption?: string }[]
  /** Which column the source text landed in, and why. */
  sourceLocale: 'en' | 'fr' | 'unknown'
  /** Keys present in the payload that no field consumed. */
  unmapped: string[]
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function withSuffix(p: SubmissionPayload, base: string, suffix: string): string {
  return str(p[`${base}${suffix}`])
}

/** Strict French evidence — an unknown language must not be filed as English. */
const FR_MARKERS = /\b(le|la|les|des|une|un|et|ou|mais|pour|dans|sur|avec|sont|très|aux|du|au|cette|qui|que|dont|où|quand|comment|merci|aujourd|hier|demain|n'est|c'est)\b/i
const FR_DIACRITICS = /[àâçéèêëîïôûùüÿœæÀÂÇÉÈÊËÎÏÔÛÙÜŸŒÆ]/

export function detectSubmissionLocale(text: string): 'en' | 'fr' | 'unknown' {
  const t = text.trim()
  if (!t) return 'unknown'
  if (FR_DIACRITICS.test(t)) return 'fr'
  if (FR_MARKERS.test(t)) return 'fr'
  return 'unknown'
}

/**
 * The "url - caption" line format intake normalises media fields to. The
 * separator is a spaced dash, so a URL containing " - " still splits on the
 * first occurrence only.
 */
export function parseMediaLines(raw: string): { url: string; caption?: string }[] {
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [url, ...rest] = line.split(/\s+-\s+/)
      return { url, ...(rest.length ? { caption: rest.join(' - ') } : {}) }
    })
}

/** Short-line keys (they become a title) vs prose keys (they become a body). */
const SHORT_KEYS = ['headline', 'item', 'title', 'name', 'question', 'subject']
const PROSE_KEYS = ['description', 'message', 'body', 'details', 'what']

/**
 * Map a submission payload onto content-form values. The caller patches the
 * result into useContentForm, so the reviewer edits the same form an editor
 * uses — one surface, one set of fields, one payload builder, one set of AI
 * drafters.
 */
export function prefillFromSubmission(input: PrefillInput): SubmissionPrefill {
  const p = input.payload ?? {}
  const values: Record<string, string> = {}
  const consumed = new Set<string>()
  const unmapped: string[] = []

  const take = (key: string): string => {
    const v = str(p[key])
    if (v) consumed.add(key)
    return v
  }

  // --- locale evidence ------------------------------------------------------
  // Locale-suffixed keys are the only hard proof, so they win outright.
  let frShort = ''
  let enShort = ''
  let frProse = ''
  let enProse = ''
  for (const base of [...SHORT_KEYS, ...PROSE_KEYS]) {
    const fr = withSuffix(p, base, '_fr')
    const en = withSuffix(p, base, '_en')
    if (fr) consumed.add(`${base}_fr`)
    if (en) consumed.add(`${base}_en`)
    if (SHORT_KEYS.includes(base)) {
      frShort = frShort || fr
      enShort = enShort || en
    } else {
      frProse = frProse || fr
      enProse = enProse || en
    }
  }

  const genericShort = SHORT_KEYS.map((k) => str(p[k])).find(Boolean) ?? ''
  const genericProse = PROSE_KEYS.map((k) => str(p[k])).find(Boolean) ?? ''
  for (const k of [...SHORT_KEYS, ...PROSE_KEYS]) take(k)

  const explicitLocale =
    str(p.submission_locale) || str(p.locale) || str(p.lang) || str(p.language)
  for (const k of ['submission_locale', 'locale', 'lang', 'language']) {
    if (str(p[k])) consumed.add(k)
  }

  let sourceLocale: 'en' | 'fr' | 'unknown' = 'unknown'
  if (/^fr/i.test(explicitLocale)) sourceLocale = 'fr'
  else if (/^en/i.test(explicitLocale)) sourceLocale = 'en'
  else if (frShort || frProse) sourceLocale = 'fr'
  else if (enShort || enProse) sourceLocale = 'en'
  else sourceLocale = detectSubmissionLocale(`${genericShort} ${genericProse}`)

  // Locale-suffixed text is *evidence*, so each variant goes to its own column
  // and a bilingual submission arrives fully bilingual.
  if (frShort) values.frTitle = frShort
  if (enShort) values.enTitle = enShort
  if (frProse) values.frBody = frProse
  if (enProse) values.enBody = enProse

  // Unsuffixed text has no locale evidence, so it lands in ONE column — never
  // both. Copying it into the other locale (the old behaviour) reads to the
  // reviewer as "already translated" and ships untranslated English under a
  // French label. `unknown` means "nothing proves French", which is English
  // until the reviewer says otherwise; the reviewer's own screen locale is not
  // evidence about the submitter's text.
  const primary = sourceLocale === 'fr' ? 'fr' : 'en'
  const other = primary === 'fr' ? 'en' : 'fr'
  const place = (field: 'Title' | 'Body', text: string, key: string) => {
    if (!text) return
    const target = `${primary}${field}`
    if (!values[target]) {
      values[target] = text
      return
    }
    // A suffixed value already owns that column. Offer the unsuffixed text to
    // the other column if it is still empty — that is where a bilingual
    // submitter who only suffixed one of them means it to go — and otherwise
    // report the key rather than silently dropping it.
    const fallback = `${other}${field}`
    if (!values[fallback]) values[fallback] = text
    else if (values[fallback] !== text) unmapped.push(key)
  }
  place('Title', genericShort, SHORT_KEYS.find((k) => str(p[k])) ?? 'title')
  place('Body', genericProse, PROSE_KEYS.find((k) => str(p[k])) ?? 'description')

  // --- taxonomy -------------------------------------------------------------
  // Intake validates location_id against active locations, but a submission can
  // outlive the place row, so it is honored only when the form can offer it.
  const locationId = take('location_id')
  if (locationId && input.locations.some((l) => l.id === locationId)) {
    values.locationId = locationId
  } else if (locationId) {
    consumed.delete('location_id')
    unmapped.push('location_id')
  }

  const price = take('price')
  if (price) values.price = price
  const currency = take('currency')
  if (currency) values.currency = currency

  // `category` from buy_sell is an allowlisted slug, not a category id: match it
  // by name so the right row is picked, and never invent one.
  const categoryName = take('category')
  if (categoryName) {
    const needle = categoryName.replace(/[_-]/g, ' ').toLowerCase()
    const hit = input.categories.find(
      (c) => c.name.toLowerCase() === needle || c.name.toLowerCase().includes(needle),
    )
    if (hit) values.categoryId = hit.id
    else unmapped.push('category')
  }

  const type = input.submissionType
  const noticeType = take('noticeType')
  if (noticeType) {
    if (type === 'notice') values.noticeType = noticeType
    else unmapped.push('noticeType')
  }
  const organization = take('organization')
  if (organization) values.organization = organization

  const expiry = take('expiry')
  if (expiry) {
    if (type === 'notice') values.noticeExpiry = expiry
    else values.expiresAt = expiry
  }
  const eventDate = take('date')
  if (eventDate) {
    if (type === 'notice') values.noticeDate = eventDate
    else if (type === 'culture') values.eventStartsAt = eventDate
    else if (type === 'buy_sell') values.expiresAt = values.expiresAt || eventDate
    else unmapped.push('date')
  }

  // --- media ------------------------------------------------------------------
  const photos = parseMediaLines(take('photos'))
  const videos = take('videos')
  const audios = take('audios')
  const doc = take('doc')
  const documents = [take('documents'), doc].filter(Boolean).join('\n')
  if (videos) values.videos = videos
  if (audios) values.audios = audios
  if (documents) values.documents = documents

  // --- attribution -------------------------------------------------------------
  // A named contributor becomes the byline AND the default photo credit: an
  // approved story must not lose who reported or shot it. Reviewer can override.
  const contributor = take('contributorName')
  if (contributor) {
    values.byline = contributor
    values.credit = contributor
  }
  const credit = take('photographerCredit')
  if (credit) values.credit = credit

  const phone = take('phone')
  if (phone) values.contactPhone = phone
  const sellerName = take('sellerName')
  if (sellerName) values.sellerName = sellerName

  // Contact details that belong to the submission row, not the post, and free-
  // text place hints: consumed (so they are not "unmapped") but not mapped.
  for (const k of ['email', 'location', 'location_text', 'latitude', 'longitude']) take(k)

  for (const key of Object.keys(p)) {
    if (!consumed.has(key) && str(p[key])) unmapped.push(key)
  }

  return { values, photos, sourceLocale, unmapped: [...new Set(unmapped)] }
}
