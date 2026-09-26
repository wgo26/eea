import 'server-only'

/**
 * Server-only LLM client for the translation/generation intelligence layer.
 *
 * OpenAI-compatible chat-completions only (that surface is the lowest common
 * denominator — OpenAI, OpenRouter, Kilo Gateway, Gemini's compat mode,
 * Groq and local servers all speak it), configured entirely by env:
 *   LLM_API_KEY   — required; the layer is disabled without it (DeepL keeps
 *                   running as the fallback engine).
 *   LLM_BASE_URL  — default https://api.openai.com/v1
 *   LLM_MODEL     — default gpt-4o-mini
 *
 * Never import from client components: call through a capability-guarded
 * server action.
 */

export type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export function llmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY)
}

function config(): { endpoint: string; model: string; key: string } {
  const key = process.env.LLM_API_KEY
  if (!key) throw new Error('Generation is not configured (LLM_API_KEY).')
  const base = (process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
  return { endpoint: `${base}/chat/completions`, model: process.env.LLM_MODEL ?? 'gpt-4o-mini', key }
}

/**
 * One chat completion, retried on 429/5xx with the same exponential backoff
 * as the DeepL client, and a hard per-attempt timeout so a hanging
 * provider can never wedge a server action.
 */
export async function chatCompletion(
  messages: LlmMessage[],
  opts: { temperature?: number; maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  const { endpoint, model, key } = config()
  const timeoutMs = opts.timeoutMs ?? 60_000
  for (let attempt = 1; attempt <= 3; attempt++) {
    let res: Response
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: opts.temperature ?? 0.2,
          max_tokens: opts.maxTokens ?? 2000,
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (e) {
      // Timeout / transport: retry like a 5xx, then surface.
      if (attempt < 3) {
        await sleep(1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250))
        continue
      }
      throw new Error(`Generation service unreachable: ${e instanceof Error ? e.message : String(e)}`)
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(1000 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250))
      continue
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error('Generation service rejected the request (check LLM_API_KEY).')
    }
    if (res.status === 429) throw new Error('Generation service is rate limited — try again in a minute.')
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      throw new Error(`Generation failed (${res.status}).${detail ? ` ${detail.slice(0, 200)}` : ''}`)
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const text = json.choices?.[0]?.message?.content?.trim()
    if (!text) throw new Error('Generation returned an empty response.')
    return text
  }
  throw new Error('Generation service is busy — try again in a minute.')
}

/**
 * Ask for strict JSON back. Strips markdown fences (small models wrap),
 * parses, validates with the caller's guard, and retries once on malformed
 * output before giving up.
 */
export async function chatJson<T>(
  messages: LlmMessage[],
  validate: (value: unknown) => value is T,
  opts: { temperature?: number; maxTokens?: number } = {},
): Promise<T> {
  let lastRaw = ''
  for (let attempt = 1; attempt <= 2; attempt++) {
    const raw = await chatCompletion(
      attempt === 1
        ? messages
        : [
            ...messages,
            { role: 'assistant', content: lastRaw.slice(0, 4000) },
            { role: 'user', content: 'That was not valid JSON. Reply with only the corrected JSON object.' },
          ],
      { ...opts, temperature: attempt === 1 ? (opts.temperature ?? 0.2) : 0 },
    )
    lastRaw = raw
    const parsed = parseJsonLoose(raw)
    if (parsed !== null && validate(parsed)) return parsed
  }
  throw new Error('Generation returned an unreadable response — try again.')
}

function parseJsonLoose(raw: string): unknown {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  // Tolerate prose around the object: take the first balanced {...}.
  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(trimmed.slice(start, end + 1))
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
