import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * P5 — morning-brief data assembly (pure numbers; the prose comes from
 * llmMorningBrief, the offline fallback from offlineBullets below).
 * Every count is best-effort: a failed query resolves to -1 (unknown),
 * never a thrown page.
 */

export type MorningStats = {
  pendingModeration: number
  scheduledDue: number
  idleDrafts: number
  expiring14d: number
  translationQueue: number
  seoGaps: number
  mediaGaps: number
  published7d: number
}

export async function getMorningStats(): Promise<MorningStats> {
  const db = createAdminClient()
  const nowIso = new Date().toISOString()
  const idleCutoff = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const in14 = new Date(Date.now() + 14 * 86_400_000).toISOString()
  const week = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const one = async (
    fn: () => Promise<{ count: number | null; error?: { message: string } | null }>,
  ): Promise<number> => {
    try {
      const r = await fn()
      return r.count ?? 0
    } catch {
      return -1
    }
  }
  const [pendingModeration, scheduledDue, idleDrafts, expiring14d, translationQueue, published7d, mediaGaps] =
    await Promise.all([
      one(async () => {
        const { count, error } = await db
          .from('submissions')
          .select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'in_review', 'needs_clarification'])
        return { count, error }
      }),
      one(async () => {
        const { count, error } = await db
          .from('content_items')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'scheduled')
          .lte('scheduled_for', nowIso)
        return { count, error }
      }),
      one(async () => {
        const { count, error } = await db
          .from('content_items')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'draft')
          .eq('is_archived', false)
          .lt('updated_at', idleCutoff)
        return { count, error }
      }),
      one(async () => {
        const { count, error } = await db
          .from('content_items')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'published')
          .eq('is_archived', false)
          .not('expires_at', 'is', null)
          .lte('expires_at', in14)
        return { count, error }
      }),
      one(async () => {
        const { count, error } = await db
          .from('translation_jobs')
          .select('id', { count: 'exact', head: true })
          .in('status', ['pending', 'in_progress'])
        return { count, error }
      }),
      one(async () => {
        const { count, error } = await db
          .from('content_items')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'published')
          .gte('published_at', week)
        return { count, error }
      }),
      one(async () => {
        const { count, error } = await db
          .from('media_assets')
          .select('id', { count: 'exact', head: true })
          .is('alt_text', null)
          .gte('created_at', week)
        return { count, error }
      }),
    ])
  return {
    pendingModeration,
    scheduledDue,
    idleDrafts,
    expiring14d,
    translationQueue,
    seoGaps: -1, // computed by the nightly sweep, not live-queried (translation text checks cost too much per render)
    mediaGaps,
    published7d,
  }
}

/** Offline fallback: same 5-bullet shape, deterministic, no model needed. */
export function offlineBullets(s: MorningStats): string[] {
  const b: string[] = []
  b.push(
    s.pendingModeration > 0
      ? `Clear ${s.pendingModeration} pending submissions in Moderation — oldest first.`
      : 'Moderation queue is clear — spend the hour on something that compounds.',
  )
  b.push(
    s.scheduledDue > 0
      ? `Release ${s.scheduledDue} due scheduled items from Content before they go stale.`
      : 'Nothing due to publish — check the Automations heartbeat is alive.',
  )
  b.push(
    s.translationQueue > 0
      ? `Work ${s.translationQueue} items in the Translations queue — bilingual publishing is the promise.`
      : 'Translations queue is clear.',
  )
  b.push(
    s.expiring14d > 0
      ? `Renew or expire ${s.expiring14d} items expiring within 14 days.`
      : 'No expiring items in the next 14 days.',
  )
  b.push(
    s.published7d >= 0
      ? `You published ${s.published7d} stories in 7 days — keep the streak or run a recap template.`
      : 'Check Insights for the weekly trend.',
  )
  return b
}
