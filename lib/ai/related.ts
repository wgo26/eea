import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { embedText, embeddingText, findSimilar } from './embeddings'

/**
 * P5 — semantic neighbour ids for one published item. Reads the stored
 * vector when present (no model call), else embeds title+body on the fly.
 * Returns [] when the memory layer is unavailable — callers fill with the
 * category/newest heuristic.
 */
export async function semanticRelatedIds(articleId: string, limit = 3): Promise<string[]> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (a: string, b: string) => {
            limit: (n: number) => Promise<{
              data: {
                embedding: unknown
                translations: { locale: string; title: string | null; excerpt: string | null; body: string | null }[] | null
              }[] | null
            }>
          }
        }
      }
    }
    const { data } = await db
      .from('content_items')
      .select('embedding, translations:content_translations(locale, title, excerpt, body)')
      .eq('id', articleId)
      .limit(1)
    const row = (data ?? [])[0]
    if (!row) return []
    let vec: number[] | null = null
    const stored = row.embedding
    if (typeof stored === 'string' && stored.startsWith('[')) {
      try {
        const parsed = JSON.parse(stored) as unknown
        if (Array.isArray(parsed) && parsed.every((n) => typeof n === 'number')) vec = parsed as number[]
      } catch {
        vec = null
      }
    } else if (Array.isArray(stored)) {
      vec = (stored as unknown[]).filter((n): n is number => typeof n === 'number')
    }
    if (!vec) {
      const txs = row.translations ?? []
      const best = txs.find((t) => t.locale === 'en' && t.title) ?? txs[0]
      if (!best?.title) return []
      vec = await embedText(embeddingText({ title: best.title, excerpt: best.excerpt ?? '', body: best.body ?? '' }))
    }
    const hits = await findSimilar(vec, { threshold: 0.68, count: limit + 2 })
    return hits.map((h) => h.id).filter((id) => id !== articleId).slice(0, limit)
  } catch {
    return []
  }
}
