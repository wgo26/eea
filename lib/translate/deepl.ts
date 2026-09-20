import 'server-only'

/**
 * Server-only DeepL client (translation engine for the admin content
 * section). Same API contract as scripts/fill-fr.mjs (batch backfill):
 * plain-text fields go in one request, HTML bodies in another with
 * `tag_handling=html` so markup and embedded media survive and only the
 * text is translated.
 *
 * The key lives server-side only — never import this module from a client
 * component; call it through a capability-guarded server action instead.
 */

export type DeepLLang = 'EN' | 'FR'

function endpointFor(key: string): string {
  // Free-tier keys end in `:fx` (separate endpoint).
  return key.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate'
}

/**
 * Translate an array of texts, preserving order. Empty strings are passed
 * through without an API call so quota is only spent on real content.
 */
export async function translateTexts(
  texts: string[],
  opts: { sourceLang: DeepLLang; targetLang: DeepLLang; html?: boolean },
): Promise<string[]> {
  const key = process.env.DEEPL_API_KEY
  if (!key) throw new Error('Translation is not configured (DEEPL_API_KEY).')

  const results = new Array<string>(texts.length).fill('')
  const pending: { index: number; text: string }[] = []
  texts.forEach((text, index) => {
    if (text.trim()) pending.push({ index, text })
  })
  if (pending.length === 0) return results

  const body = {
    text: pending.map((p) => p.text),
    target_lang: opts.targetLang,
    source_lang: opts.sourceLang,
    ...(opts.html ? { tag_handling: 'html', ignore_tags: ['img', 'iframe'] } : {}),
    split_sentences: 'nonewlines',
  }
  const translated = await requestWithRetry(endpointFor(key), key, body)
  pending.forEach((p, i) => {
    results[p.index] = translated[i] ?? ''
  })
  return results
}

async function requestWithRetry(endpoint: string, key: string, body: unknown): Promise<string[]> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `DeepL-Auth-Key ${key}`,
      },
      body: JSON.stringify(body),
    })
    if (res.status === 429 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 1500 * 4 * attempt))
      continue
    }
    if (res.status === 456) throw new Error('Translation quota exceeded — try again next month.')
    if (res.status === 403) throw new Error('Translation service rejected the request (check DEEPL_API_KEY).')
    if (!res.ok) throw new Error(`Translation failed (${res.status}).`)
    const json = (await res.json()) as { translations?: { text: string }[] }
    return (json.translations ?? []).map((t) => t.text)
  }
  throw new Error('Translation service is busy — try again in a minute.')
}
