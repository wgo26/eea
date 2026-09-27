import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/observability/logger'

/**
 * P5 memory layer — embeddings on the same OpenAI-compatible transport as
 * the chat layer (OpenAI, OpenRouter, Kilo, local servers all speak
 * POST /embeddings). Model default text-embedding-3-small (1536 dims,
 * matching migration 20261115000000).
 *
 * Every entry point degrades to null/[] without the key, the extension, or
 * the column — keyword search stays the honest fallback everywhere.
 */

export const EMBED_DIMS = 1536

export function embedModel(): string {
  return process.env.LLM_EMBED_MODEL ?? 'text-embedding-3-small'
}

/**
 * Sync env-only approximation (vault-unaware). Server actions prefer the
 * vault-aware runtime via `getLlmRuntime()`; this stays for non-async
 * call sites that only need a cheap pre-check.
 */
export function embedConfigured(): boolean {
  return Boolean(process.env.LLM_API_KEY) && process.env.LLM_DISABLED !== '1'
}

/** Vault-aware check (key in Admin → Secrets counts). */
export async function embedConfiguredAsync(): Promise<boolean> {
  const { getLlmRuntime } = await import('./settings')
  const rt = await getLlmRuntime()
  return rt.enabled
}

/** Cosine similarity over plain arrays (unit-tested; DB uses <=> instead). */
export function cosine(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0)
    na += (a[i] ?? 0) ** 2
    nb += (b[i] ?? 0) ** 2
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

/** What gets embedded: title-led, body-truncated, markup stripped. */
export function embeddingText(input: { title: string; excerpt?: string; body?: string }): string {
  const strip = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  return [strip(input.title), strip(input.excerpt ?? ''), strip(input.body ?? '').slice(0, 4000)]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 8000)
}

export async function embedText(text: string): Promise<number[] | null> {
  const clean = text.trim()
  if (!clean) return null
  try {
    const { getLlmRuntime } = await import('./settings')
    const rt = await getLlmRuntime()
    if (!rt.apiKey || rt.disabled) return null
    const res = await fetch(`${rt.baseUrl}/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rt.apiKey}` },
      body: JSON.stringify({ model: rt.embedModel, input: clean.slice(0, 8000) }),
      signal: AbortSignal.timeout(30_000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: { embedding?: number[] }[] }
    const vec = json.data?.[0]?.embedding
    if (!Array.isArray(vec) || vec.length === 0) return null
    return vec
  } catch {
    return null
  }
}

export type SimilarHit = { id: string; similarity: number }

/**
 * Semantic match over published content. Returns [] (not throw) when the
 * extension/column/key is missing — callers fill with keyword results.
 */
export async function findSimilar(
  embedding: number[] | null,
  opts: { threshold?: number; count?: number } = {},
): Promise<SimilarHit[]> {
  if (!embedding || embedding.length === 0) return []
  try {
    const db = createAdminClient() as unknown as {
      rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: SimilarHit[] | null; error: { message: string } | null }>
    }
    const { data, error } = await db.rpc('match_content_embeddings', {
      p_query: `[${embedding.join(',')}]`,
      p_threshold: opts.threshold ?? 0.72,
      p_count: Math.min(opts.count ?? 6, 12),
    })
    if (error || !data) return []
    return data.filter((r) => typeof r.similarity === 'number')
  } catch (e) {
    logger.warn('ai/embeddings', 'semantic match fell back to keyword', {
      error: e instanceof Error ? e.message.slice(0, 120) : 'error',
    })
    return []
  }
}

/**
 * Store one item's embedding (insert-only shape: never blocks the save —
 * dimension mismatch or missing column resolves to a caught error).
 */
export async function storeEmbedding(contentItemId: string, text: string): Promise<boolean> {
  const vec = await embedText(text)
  if (!vec) return false
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => { update: (r: Record<string, unknown>) => { eq: (c: string, v: string) => Promise<{ error: { message: string } | null }> } }
    }
    const { error } = await db
      .from('content_items')
      .update({ embedding: `[${vec.join(',')}]`, embedding_updated_at: new Date().toISOString(), embedding_model: embedModel() })
      .eq('id', contentItemId)
    return !error
  } catch {
    return false
  }
}
