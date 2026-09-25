import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/observability/logger'
import { sendEmail } from '@/lib/notify/channels'
import { SITE } from '@/lib/constants'
import { getAppFlag, setAppFlag } from './flags'

/**
 * The nightly auto-ops sweep (Stream E + D3/D4). One route, one lib, every
 * best-effort routine that turns an admin's silent queue into a closed loop:
 *
 *   E2  digest pitch auto-winner — compare signups by pitch_variant over the
 *       experiment window, promote the winner into app_flags;
 *   E3  stale-content sweep — expired/ended items still in homepage slots get
 *       dropped, authors notified once (log-guarded);
 *   E4  engagement feature ladder — high-view recent items earn is_featured,
 *       stale-featured items lose it; every flip is audit-logged;
 *   E5  translation gap bot — published items missing `fr` get a
 *       translation_jobs row + one staff nudge per day;
 *   E7  poll auto-close — polls past closes_at flip inactive (draft recap
 *       via template cadence handles the results story);
 *   E8  contributor milestone notices — 3rd/10th/50th published stories;
 *   D4  weekly expiry batch — authors get ONE email listing items expiring
 *       within 14 days, not one nudge per item.
 *
 * Each routine is independent and returns its counts; a throwing routine is
 * caught by `runAutoOpsSweep` and reported, never propagated — one broken
 * automation must not take the others (or the digest) down.
 */

type AdminDb = ReturnType<typeof createAdminClient>

export type AutoOpsSummary = {
  pitchWinner?: { winner: string; promoted: boolean } | null
  staleDropped?: number
  featured?: number
  unfeatured?: number
  translationGaps?: number
  pollsClosed?: number
  milestones?: number
  expiryBatches?: number
  errors?: string[]
}

async function logGuarded(db: AdminDb, action: string, contentItemId: string, withinDays = 7): Promise<boolean> {
  const since = new Date(Date.now() - withinDays * 86_400_000).toISOString()
  const { data } = await db
    .from('moderation_log')
    .select('id')
    .eq('action', action)
    .eq('content_item_id', contentItemId)
    .gte('created_at', since)
    .limit(1)
  return Boolean(data && data.length > 0)
}

async function logOnce(db: AdminDb, action: string, contentItemId: string) {
  await db.from('moderation_log').insert({ action, content_item_id: contentItemId })
}

/* ------------------------------------------------------------------ */
/* E2 — digest pitch auto-winner                                       */
/* ------------------------------------------------------------------ */

const PITCH_WINDOW_DAYS = 14
/** A variant must clear this lead to be promoted (avoid coin-flip churn). */
const PITCH_MIN_MARGIN = 0.15

export function decidePitchWinner(counts: { standard: number; diaspora: number }): 'standard' | 'diaspora' | null {
  const total = counts.standard + counts.diaspora
  // Not enough evidence: keep the incumbent default (no winner).
  if (total < 20) return null
  const [a, b] = [counts.standard / total, counts.diaspora / total]
  if (Math.abs(a - b) < PITCH_MIN_MARGIN) return null
  return a > b ? 'standard' : 'diaspora'
}

export async function evaluateDigestPitch(): Promise<AutoOpsSummary['pitchWinner'] | null> {
  const db = createAdminClient()
  const since = new Date(Date.now() - PITCH_WINDOW_DAYS * 86_400_000).toISOString()
  const { data } = await db
    .from('digest_subscribers')
    .select('pitch_variant')
    .gte('created_at', since)
    .limit(1000)
  const rows = (data ?? []) as { pitch_variant: string | null }[]
  const counts = {
    standard: rows.filter((r) => r.pitch_variant === 'standard').length,
    diaspora: rows.filter((r) => r.pitch_variant === 'diaspora').length,
  }
  const winner = decidePitchWinner(counts)
  if (!winner) return null
  const current = await getAppFlag<string>('digest.pitch_winner', 'standard')
  if (current === winner) return { winner, promoted: false }
  await setAppFlag('digest.pitch_winner', winner)
  logger.info('automation/ops', 'digest pitch winner promoted', { winner, counts })
  return { winner, promoted: true }
}

/* ------------------------------------------------------------------ */
/* E3 — stale-content sweep                                            */
/* ------------------------------------------------------------------ */

export async function dropStaleHomepageSlots(): Promise<number> {
  const db = createAdminClient()
  const nowIso = new Date().toISOString()
  const { data: slots } = await db
    .from('homepage_slots')
    .select('id, content_item_id, content_items!homepage_slots_content_item_id_fkey(id, type, title:content_translations(title), expires_at, submitted_by, end_date:events!left(id))')
    .eq('is_active', true)
    .not('content_item_id', 'is', null)
    .limit(200)
  let dropped = 0
  for (const slot of (slots ?? []) as Record<string, unknown>[]) {
    const item = (Array.isArray(slot.content_items) ? slot.content_items[0] : slot.content_items) as
      | { id: string; type: string | null; expires_at: string | null; submitted_by: string | null }
      | null
      | undefined
    if (!item) continue
    const expired = item.expires_at && item.expires_at < nowIso
    if (!expired) continue
    if (await logGuarded(db, 'slot:auto_stale:system', item.id)) continue
    const { error } = await db.from('homepage_slots').update({ is_active: false }).eq('id', slot.id as string)
    if (error) continue
    dropped += 1
    await logOnce(db, 'slot:auto_stale:system', item.id)
    if (item.submitted_by) {
      const { enqueueUser } = await import('@/lib/notify/queue')
      await enqueueUser('listing.update', item.submitted_by, { title: 'An expired item', status: 'removed from the homepage automatically (its expiry date passed)' }, '/account/listings')
    }
  }
  if (dropped > 0) logger.info('automation/ops', 'stale homepage slots dropped', { dropped })
  return dropped
}

/* ------------------------------------------------------------------ */
/* E4 — engagement feature ladder (rule-based, audit-logged)           */
/* ------------------------------------------------------------------ */

const FEATURE_WINDOW_DAYS = 7
const FEATURE_THRESHOLD = 1000
const UNFEATURE_DAYS = 14

export async function runFeatureLadder(): Promise<{ featured: number; unfeatured: number }> {
  const db = createAdminClient()
  const out = { featured: 0, unfeatured: 0 }
  const freshCutoff = new Date(Date.now() - FEATURE_WINDOW_DAYS * 86_400_000).toISOString()
  const { data: candidates } = await db
    .from('content_items')
    .select('id, view_count, share_count, is_featured')
    .eq('status', 'published')
    .eq('is_archived', false)
    .eq('is_featured', false)
    .gte('published_at', freshCutoff)
    .gte('view_count', FEATURE_THRESHOLD)
    .limit(10)
  for (const c of (candidates ?? []) as { id: string }[]) {
    const { error } = await db.from('content_items').update({ is_featured: true }).eq('id', c.id).eq('is_featured', false)
    if (!error) {
      out.featured += 1
      await db.from('moderation_log').insert({ action: 'feature:auto_promote:system', content_item_id: c.id })
    }
  }
  const staleCutoff = new Date(Date.now() - UNFEATURE_DAYS * 86_400_000).toISOString()
  const { data: staleFeatured } = await db
    .from('content_items')
    .select('id')
    .eq('status', 'published')
    .eq('is_featured', true)
    .lt('published_at', staleCutoff)
    .limit(10)
  for (const s of (staleFeatured ?? []) as { id: string }[]) {
    const { error } = await db.from('content_items').update({ is_featured: false }).eq('id', s.id).eq('is_featured', true)
    if (!error) {
      out.unfeatured += 1
      await db.from('moderation_log').insert({ action: 'feature:auto_demote:system', content_item_id: s.id })
    }
  }
  return out
}

/* ------------------------------------------------------------------ */
/* E5 — translation gap bot                                            */
/* ------------------------------------------------------------------ */

export async function fileTranslationGaps(): Promise<number> {
  const db = createAdminClient()
  const { data: recent } = await db
    .from('content_items')
    .select('id, translations:content_translations(locale)')
    .eq('status', 'published')
    .eq('is_archived', false)
    .gte('published_at', new Date(Date.now() - 7 * 86_400_000).toISOString())
    .order('published_at', { ascending: false })
    .limit(100)
  const missingFr = ((recent ?? []) as unknown as { id: string; translations: { locale: string }[] | { locale: string } | null }[])
    .filter((row) => {
      const locales = (Array.isArray(row.translations) ? row.translations : row.translations ? [row.translations] : []).map((t) => t.locale)
      return !locales.includes('fr') && locales.includes('en')
    })
    .map((row) => row.id)
  if (missingFr.length === 0) return 0
  // Insert jobs idempotently: the unique (content_item_id, target_locale)
  // constraint makes conflicts a silent no-op — the bot can run nightly.
  const { count } = await db
    .from('translation_jobs')
    .upsert(
      missingFr.slice(0, 25).map((id) => ({
        content_item_id: id,
        target_locale: 'fr',
        source_locale: 'en',
        status: 'pending',
      })),
      { onConflict: 'content_item_id,target_locale', ignoreDuplicates: true, count: 'exact' },
    )
  const created = count ?? 0
  if (created > 0) {
    const { sendNotificationToRole } = await import('@/lib/admin/notification-writes')
    await sendNotificationToRole(db, 'editor', {
      source: 'automation',
      category: 'action_required',
      title: `${created} published ${created === 1 ? 'story needs' : 'stories need'} a French translation`,
      body: 'The gap bot filed them in the translation queue, newest first.',
      linkPath: '/admin/translations',
    })
  }
  return created
}

/* ------------------------------------------------------------------ */
/* E7 — poll auto-close + fundraiser milestones                        */
/* ------------------------------------------------------------------ */

export async function closeOverduePolls(): Promise<number> {
  const db = createAdminClient()
  // Fetch the polls that will be closed so we can notify staff with details.
  const { data: pollsToClose } = await db
    .from('polls')
    .select('id, question, closes_at')
    .eq('is_active', true)
    .not('closes_at', 'is', null)
    .lte('closes_at', new Date().toISOString())
    .limit(20)

  const { count, error } = await db
    .from('polls')
    .update({ is_active: false }, { count: 'exact' })
    .eq('is_active', true)
    .not('closes_at', 'is', null)
    .lte('closes_at', new Date().toISOString())
  if (error) {
    logger.warn('automation/ops', 'poll close failed', { error: error.message })
    return 0
  }
  const closedCount = count ?? 0

  if (closedCount > 0 && pollsToClose && pollsToClose.length > 0) {
    // Enqueue poll.closed staff notifications for each closed poll.
    try {
      const { enqueueStaff } = await import('@/lib/notify/queue')
      for (const poll of pollsToClose) {
        // Get vote count for this poll.
        const { count: voteCount } = await db
          .from('poll_votes')
          .select('id', { count: 'exact', head: true })
          .eq('poll_id', poll.id)
        await enqueueStaff(
          'poll.closed',
          { question: poll.question, count: String(voteCount ?? 0) },
          '/admin/polls',
        )
      }
    } catch {
      /* best-effort notification */
    }
  }
  return closedCount
}

const MILESTONES = [25, 50, 75, 100] as const

export async function announceFundraiserMilestones(): Promise<number> {
  const db = createAdminClient()
  const { data: funds } = await db
    .from('fundraisers')
    .select('content_item_id, goal_amount, raised_amount, milestones_reached, closed_at, content_items!fundraisers_content_item_id_fkey(id, is_archived, translations:content_translations(title))')
    .not('goal_amount', 'is', null)
    .is('closed_at', null)
    .limit(100)
  let notified = 0
  for (const f of (funds ?? []) as Record<string, unknown>[]) {
    const goal = Number(f.goal_amount)
    const raised = Number(f.raised_amount)
    if (!goal || goal <= 0) continue
    const pct = Math.floor((raised / goal) * 100)
    const reached = (Array.isArray(f.milestones_reached) ? f.milestones_reached : []) as string[]
    const crossed = MILESTONES.filter((m) => pct >= m && !reached.includes(String(m)))
    if (crossed.length === 0) continue
    const item = (Array.isArray(f.content_items) ? f.content_items[0] : f.content_items) as
      | { id: string; is_archived: boolean; translations?: { title: string }[] | null }
      | null
      | undefined
    if (!item || item.is_archived) continue
    const title = (item.translations?.[0]?.title ?? 'a fundraiser').slice(0, 140)
    const { error } = await db
      .from('fundraisers')
      .update({ milestones_reached: [...reached, ...crossed.map(String)] })
      .eq('content_item_id', f.content_item_id as string)
    if (error) continue
    const { enqueueStaff } = await import('@/lib/notify/queue')
    for (const m of crossed) {
      notified += 1
      // Staff nudge: the milestone is a moment worth amplifying. (Public
      // milestone posts are a template concern — the recap picks them up.)
      await enqueueStaff('content.milestone', { title, pct: String(m) }, '/admin/fundraisers')
    }
  }
  return notified
}

/* ------------------------------------------------------------------ */
/* E8 — contributor milestone notices                                  */
/* ------------------------------------------------------------------ */

const CONTRIBUTOR_MILESTONES = [3, 10, 50] as const

export async function celebrateContributors(): Promise<number> {
  const db = createAdminClient()
  // Published-submission totals per contributor (published_at ordering makes
  // the first N rows cover active contributors; 5 000 bounds the scan).
  const { data: counts } = await db
    .from('content_items')
    .select('submitted_by')
    .eq('status', 'published')
    .not('submitted_by', 'is', null)
    .limit(5000)
  const byUser = new Map<string, number>()
  for (const r of (counts ?? []) as { submitted_by: string | null }[]) {
    if (!r.submitted_by) continue
    byUser.set(r.submitted_by, (byUser.get(r.submitted_by) ?? 0) + 1)
  }
  let celebrated = 0
  for (const [userId, count] of byUser) {
    const hit = CONTRIBUTOR_MILESTONES.find((m) => count === m)
    if (!hit) continue
    // One celebration per user per milestone (log guard keyed on user id).
    const { data: guard } = await db
      .from('moderation_log')
      .select('id')
      .eq('action', `contributor:milestone:${hit}:system`)
      .eq('actor_id', userId)
      .limit(1)
    if (guard && guard.length > 0) continue
    await db.from('moderation_log').insert({ action: `contributor:milestone:${hit}:system`, actor_id: userId })
    const { enqueueUser } = await import('@/lib/notify/queue')
    await enqueueUser('contributor.milestone', userId, { count: String(hit) }, '/account/submissions')
    celebrated += 1
  }
  return celebrated
}

/* ------------------------------------------------------------------ */
/* D4 — weekly expiry batch (one email per author, not per item)       */
/* ------------------------------------------------------------------ */

export async function sendExpiryBatch(): Promise<number> {
  const db = createAdminClient()
  const in14 = new Date(Date.now() + 14 * 86_400_000).toISOString()
  const { data: rows } = await db
    .from('content_items')
    .select('id, submitted_by, expires_at, translations:content_translations(locale, title)')
    .eq('status', 'published')
    .eq('is_archived', false)
    .not('expires_at', 'is', null)
    .lte('expires_at', in14)
    .not('submitted_by', 'is', null)
    .limit(200)
  const byAuthor = new Map<string, { titles: string[]; soon: number }>()
  for (const row of (rows ?? []) as unknown as {
    id: string
    submitted_by: string | null
    expires_at: string | null
    translations: { locale: string; title: string }[] | null
  }[]) {
    if (!row.submitted_by || !row.expires_at) continue
    if (await logGuarded(db, 'expiry:batch:system', row.id, 6)) continue
    await logOnce(db, 'expiry:batch:system', row.id)
    const bucket = byAuthor.get(row.submitted_by) ?? { titles: [], soon: 0 }
    bucket.titles.push((row.translations?.find((t) => t.locale === 'en')?.title ?? row.translations?.[0]?.title ?? 'Untitled').slice(0, 100))
    bucket.soon += 1
    byAuthor.set(row.submitted_by, bucket)
  }
  let batches = 0
  for (const [userId, bucket] of byAuthor) {
    const { data: profile } = await db.from('profiles').select('email, preferred_locale').eq('id', userId).maybeSingle()
    const email = (profile as { email: string | null } | null)?.email
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) continue
    const fr = /^fr/i.test((profile as { preferred_locale?: string } | null)?.preferred_locale ?? '')
    const subject = fr ? 'Vos publications expirent bientôt' : 'Your publications are expiring soon'
    const intro = fr
      ? `Ces ${bucket.soon} publication(s) expirent dans les 14 prochains jours. Renouvelez-les depuis votre espace avant qu’elles disparaissent :`
      : `These ${bucket.soon} publication(s) expire within the next 14 days. Renew them from your account before they drop off:`
    const body = `${intro}\n\n${bucket.titles.map((t) => `• ${t}`).join('\n')}`
    const res = await sendEmail(email, subject, subject, body, `${SITE.url}/${fr ? 'fr' : 'en'}/account/listings`)
    if (res.delivered) batches += 1
  }
  return batches
}

/* ------------------------------------------------------------------ */
/* C5 — stuck-scheduled-item detector (promotes the safety check)      */
/* ------------------------------------------------------------------ */

export async function alertStuckScheduledItems(): Promise<number> {
  const db = createAdminClient()
  const staleCutoff = new Date(Date.now() - 2 * 86_400_000).toISOString()
  const { count } = await db
    .from('content_items')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'scheduled')
    .lt('scheduled_for', staleCutoff)
  const stuck = count ?? 0
  if (stuck === 0) return 0
  // One staff nudge per day regardless of the backlog size.
  const today = new Date().toISOString().slice(0, 10)
  const { data: guard } = await db.from('moderation_log').select('id').eq('action', 'plan:stuck_scheduled:system').gte('created_at', `${today}T00:00:00Z`).limit(1)
  if (guard && guard.length > 0) return stuck
  await db.from('moderation_log').insert({ action: 'plan:stuck_scheduled:system' })
  const { sendNotificationToRole } = await import('@/lib/admin/notification-writes')
  await sendNotificationToRole(db, 'admin', {
    source: 'automation',
    category: 'warning',
    title: `${stuck} scheduled ${stuck === 1 ? 'item is' : 'items are'} overdue for publishing`,
    body: 'The publisher cron should have flipped them. Check the pg_cron job and the scheduler heartbeat strip.',
    linkPath: '/admin/automations',
  })
  return stuck
}

/* ------------------------------------------------------------------ */
/* D5 — tomorrow's queue preview (what staff should plan for)          */
/* ------------------------------------------------------------------ */

export type TomorrowQueue = {
  dueScheduled: number
  idleDrafts: number
  expiring: number
  translationGaps: number
}

/**
 * Cheap head-counts the ops webhook prints as a "tomorrow" line so staff plan
 * once at 06:00 instead of polling four admin pages through the day.
 */
export async function buildTomorrowQueue(): Promise<TomorrowQueue> {
  const db = createAdminClient()
  const nowIso = new Date().toISOString()
  const idleCutoff = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const in14 = new Date(Date.now() + 14 * 86_400_000).toISOString()
  const [scheduled, drafts, expiring, gaps] = await Promise.all([
    db.from('content_items').select('id', { count: 'exact', head: true }).eq('status', 'scheduled').lte('scheduled_for', nowIso),
    db.from('content_items').select('id', { count: 'exact', head: true }).eq('status', 'draft').eq('is_archived', false).lt('updated_at', idleCutoff),
    db.from('content_items').select('id', { count: 'exact', head: true }).eq('status', 'published').eq('is_archived', false).not('expires_at', 'is', null).lte('expires_at', in14),
    db.from('translation_jobs').select('id', { count: 'exact', head: true }).in('status', ['pending', 'in_progress']),
  ])
  return {
    dueScheduled: scheduled.count ?? 0,
    idleDrafts: drafts.count ?? 0,
    expiring: expiring.count ?? 0,
    translationGaps: gaps.count ?? 0,
  }
}

/** E2 — the promoted pitch winner the digest signup form should default to.
 *  null = no verdict yet, so the 50/50 experiment keeps running. */
export async function getPromotedPitch(): Promise<'standard' | 'diaspora' | null> {
  const raw = await getAppFlag<string | null>('digest.pitch_winner', null)
  return raw === 'diaspora' || raw === 'standard' ? raw : null
}

/* ------------------------------------------------------------------ */
/* Runner                                                              */
/* ------------------------------------------------------------------ */

export async function runAutoOpsSweep(): Promise<AutoOpsSummary> {
  const summary: AutoOpsSummary = { errors: [] }
  const steps: [string, () => Promise<unknown>][] = [
    ['E2 digest pitch winner', async () => {
      summary.pitchWinner = await evaluateDigestPitch()
    }],
    ['E3 stale homepage slots', async () => {
      summary.staleDropped = await dropStaleHomepageSlots()
    }],
    ['E4 feature ladder', async () => {
      const r = await runFeatureLadder()
      summary.featured = r.featured
      summary.unfeatured = r.unfeatured
    }],
    ['E5 translation gaps', async () => {
      summary.translationGaps = await fileTranslationGaps()
    }],
    ['E7 poll close', async () => {
      summary.pollsClosed = await closeOverduePolls()
    }],
    ['E7 fundraiser milestones', async () => {
      summary.milestones = (summary.milestones ?? 0) + (await announceFundraiserMilestones())
    }],
    ['E8 contributor milestones', async () => {
      summary.milestones = (summary.milestones ?? 0) + (await celebrateContributors())
    }],
    ['D4 expiry batch', async () => {
      summary.expiryBatches = await sendExpiryBatch()
    }],
    ['C5 stuck scheduled', async () => {
      await alertStuckScheduledItems()
    }],
  ]
  for (const [name, step] of steps) {
    try {
      await step()
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      summary.errors?.push(`${name}: ${message}`)
      logger.error('automation/ops', `${name} failed`, { error: message })
    }
  }
  return summary
}
