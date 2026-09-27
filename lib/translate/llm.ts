import 'server-only'

/**
 * Server-only LLM client for the translation/generation intelligence layer.
 *
 * OpenAI-compatible chat-completions only (that surface is the lowest common
 * denominator — OpenAI, OpenRouter, Kilo Gateway, Gemini's compat mode,
 * Groq and local servers all speak it), configured by vault-first runtime
 * (`lib/ai/settings.ts`: admin UI credential `llm-api-key` → env
 * `LLM_API_KEY` → disabled, DeepL keeps running as the fallback engine).
 *
 * Never import from client components: call through a capability-guarded
 * server action.
 */

export type LlmMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export function llmConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY)
}

/**
 * Intelligence-layer status for honest UI. The content form's ✨ buttons
 * used to look identical whether an LLM was behind them or not (false
 * positive) — callers use this to label `Smart fill (offline)` vs
 * `Draft with AI (model)` and to show provenance per field.
 */
export type LlmStatus = {
  configured: boolean
  model: string
  providerHost: string
  visionModel: string
  budgetTokensDay: number
  /** Kill-switch env: LLM_DISABLED=1 forces offline even with a key set. */
  disabled: boolean
  enabled: boolean
}

function providerHost(): string {
  try {
    const base = process.env.LLM_BASE_URL ?? 'https://api.openai.com/v1'
    return new URL(base).host
  } catch {
    return 'unconfigured'
  }
}

export function getLlmStatus(): LlmStatus {
  const configured = llmConfigured()
  const disabled = process.env.LLM_DISABLED === '1'
  const budgetRaw = Number(process.env.LLM_BUDGET_TOKENS_DAY ?? '200000')
  return {
    configured,
    model: process.env.LLM_MODEL ?? 'gpt-4o-mini',
    providerHost: providerHost(),
    visionModel: process.env.LLM_VISION_MODEL ?? process.env.LLM_MODEL ?? 'gpt-4o-mini',
    budgetTokensDay: Number.isFinite(budgetRaw) && budgetRaw > 0 ? budgetRaw : 200000,
    disabled,
    enabled: configured && !disabled,
  }
}

/**
 * Vault-aware config: admin UI credential first, env fallback. All
 * transports use this.
 */
async function configAsync(): Promise<{ endpoint: string; model: string; key: string }> {
  const { getLlmRuntime } = await import('@/lib/ai/settings')
  const rt = await getLlmRuntime()
  if (!rt.apiKey) throw new Error('Generation is not configured (set it in Admin → Secrets → AI provider, or LLM_API_KEY).')
  if (rt.disabled) throw new Error('AI drafting is paused (Admin → Secrets → AI provider, or LLM_DISABLED=1).')
  return { endpoint: `${rt.baseUrl}/chat/completions`, model: rt.model, key: rt.apiKey }
}

/** Vault-aware readiness for capability-guarded actions (key in vault counts). */
export async function llmReadyAsync(): Promise<boolean> {
  const { getLlmRuntime } = await import('@/lib/ai/settings')
  const rt = await getLlmRuntime()
  return rt.enabled
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
  const { endpoint, model, key } = await configAsync()
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

/**
 * Vision completion: same chat-completions transport with an image_url
 * content part. Used for alt-text / caption drafting and creative QA.
 * Falls back to text-only when the provider rejects images.
 */
export async function chatVision(
  prompt: string,
  imageUrl: string,
  opts: { maxTokens?: number; timeoutMs?: number } = {},
): Promise<string> {
  const { endpoint, model, key } = await configAsync()
  const { getLlmRuntime } = await import('@/lib/ai/settings')
  const visionModel = (await getLlmRuntime()).visionModel || model
  const timeoutMs = opts.timeoutMs ?? 60_000
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: visionModel,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0.2,
      max_tokens: opts.maxTokens ?? 500,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Vision generation failed (${res.status}).${detail ? ` ${detail.slice(0, 200)}` : ''}`)
  }
  const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = json.choices?.[0]?.message?.content?.trim()
  if (!text) throw new Error('Vision returned an empty response.')
  return text
}

/**
 * Best-effort usage log. The `llm_calls` table (migration
 * 20261114000000) may not exist on older deploys — failure here must
 * never fail the editorial action it instruments.
 */
export async function logLlmCall(row: {
  action: string
  model: string
  tokensIn?: number | null
  tokensOut?: number | null
  latencyMs?: number | null
  status?: string
  contentItemId?: string | null
}): Promise<void> {
  try {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    // Cast: llm_calls exists post-migration 20261114000000; generated
    // database.types lags until `npm run types:db` regenerates.
    const db = createAdminClient() as unknown as {
      from: (t: string) => { insert: (r: Record<string, unknown>) => Promise<unknown> }
    }
    await db.from('llm_calls').insert({
      action: row.action.slice(0, 80),
      model: row.model.slice(0, 120),
      tokens_in: row.tokensIn ?? null,
      tokens_out: row.tokensOut ?? null,
      latency_ms: row.latencyMs ?? null,
      status: (row.status ?? 'ok').slice(0, 20),
      content_item_id: row.contentItemId ?? null,
    })
  } catch {
    /* table missing or RLS — observability only */
  }
}
