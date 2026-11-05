import 'server-only'

import { logger } from '@/lib/observability/logger'
import { db, hasDatabase, safe } from './shared'

/* ------------------------------------------------------------------ */
/* Digest slots (Stream A — accumulating daily digest)                */
/* ------------------------------------------------------------------ */

export type DigestSlotRow = {
  id: string
  issueDate: string
  locale: 'en' | 'fr'
  contentItemId: string
  itemType: string
  section: string
  path: string
  title: string
  shareText: string | null
  rankHint: number
  pinned: boolean
  removed: boolean
  /** True when the story came from a community submission (B5 visibility). */
  fromSubmission: boolean
  createdAt: string
}

/**
 * Open (never-sent) digest slots for the last 7 days, grouped in the freeze
 * order (pinned → featured → oldest) within each issue date + locale.
 * Includes editor-dropped rows so the panel can offer "restore" — delivered
 * slots are hidden (their sent_at is stamped).
 */
export async function getOpenDigestSlots(): Promise<{ slots: DigestSlotRow[]; counts: Record<'en' | 'fr', number> }> {
  if (!hasDatabase()) return { slots: [], counts: { en: 0, fr: 0 } }
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
  const { data, error } = await safe(
    db()
      .from('digest_slots')
      .select('id, issue_date, locale, content_item_id, item_type, section, path, title, share_text, rank_hint, pinned, removed, created_at, content_items(submitted_by)')
      .is('sent_at', null)
      .gte('issue_date', since)
      .order('issue_date', { ascending: false })
      .order('pinned', { ascending: false })
      .order('rank_hint', { ascending: false })
      .order('created_at', { ascending: true }),
  )
  if (error) logger.error('admin', 'getOpenDigestSlots failed', { error })
  const slots = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    issueDate: row.issue_date as string,
    locale: (row.locale === 'fr' ? 'fr' : 'en') as 'en' | 'fr',
    contentItemId: row.content_item_id as string,
    itemType: row.item_type as string,
    section: row.section as string,
    path: row.path as string,
    title: row.title as string,
    shareText: (row.share_text as string | null) ?? null,
    rankHint: (row.rank_hint as number) ?? 0,
    pinned: Boolean(row.pinned),
    removed: Boolean(row.removed),
    fromSubmission:
      !!row.content_items && typeof row.content_items === 'object' &&
      (row.content_items as { submitted_by?: string | null }).submitted_by != null,
    createdAt: row.created_at as string,
  }))
  const counts = {
    en: slots.filter((s) => s.locale === 'en' && !s.removed).length,
    fr: slots.filter((s) => s.locale === 'fr' && !s.removed).length,
  }
  return { slots, counts }
}

export type DigestDeliveryReviewRow = {
  id: string
  sentOn: string
  cadence: 'daily' | 'weekly'
  locale: 'en' | 'fr'
  channel: 'email' | 'whatsapp'
  status: 'unknown' | 'sending'
  attempts: number
  lastError: string | null
  updatedAt: string
  recipient: string
}

/** Uncertain provider outcomes and stale in-flight claims requiring staff review. */
export async function getDigestDeliveryReview(): Promise<DigestDeliveryReviewRow[]> {
  if (!hasDatabase()) return []
  const staleBefore = new Date(Date.now() - 2 * 60_000).toISOString()
  const base = () => db()
    .from('digest_delivery_attempts')
    .select('id, batch_id, subscriber_id, channel, status, attempts, last_error, updated_at')
    .order('updated_at', { ascending: false })
    .limit(100)
  const [unknownRes, staleRes] = await Promise.all([
    safe(base().eq('status', 'unknown')),
    safe(base().eq('status', 'sending').lt('updated_at', staleBefore)),
  ])
  if (unknownRes.error) logger.error('admin', 'getDigestDeliveryReview unknown query failed', { error: unknownRes.error })
  if (staleRes.error) logger.error('admin', 'getDigestDeliveryReview stale query failed', { error: staleRes.error })
  const attempts = [...(unknownRes.data ?? []), ...(staleRes.data ?? [])] as Record<string, unknown>[]
  if (attempts.length === 0) return []

  const subscriberIds = [...new Set(attempts.map((row) => row.subscriber_id as string))]
  const batchIds = [...new Set(attempts.map((row) => row.batch_id as string))]
  const [subscribersRes, batchesRes] = await Promise.all([
    safe(db().from('digest_subscribers').select('id, email, phone, whatsapp').in('id', subscriberIds)),
    safe(db().from('digest_delivery_batches').select('id, sent_on, cadence, locale').in('id', batchIds)),
  ])
  if (subscribersRes.error) logger.error('admin', 'getDigestDeliveryReview contacts query failed', { error: subscribersRes.error })
  if (batchesRes.error) logger.error('admin', 'getDigestDeliveryReview batches query failed', { error: batchesRes.error })
  const subscribers = new Map(
    ((subscribersRes.data ?? []) as Record<string, unknown>[]).map((row) => [
      row.id as string,
      (row.email as string | null) || (row.whatsapp as string | null) || (row.phone as string | null) || (row.id as string),
    ]),
  )
  const batches = new Map(
    ((batchesRes.data ?? []) as Record<string, unknown>[]).map((row) => [row.id as string, row]),
  )
  return attempts.flatMap((row) => {
    const batch = batches.get(row.batch_id as string)
    if (!batch || (row.channel !== 'email' && row.channel !== 'whatsapp')) return []
    if (row.status !== 'unknown' && row.status !== 'sending') return []
    return [{
      id: row.id as string,
      sentOn: batch.sent_on as string,
      cadence: batch.cadence === 'weekly' ? 'weekly' as const : 'daily' as const,
      locale: batch.locale === 'fr' ? 'fr' as const : 'en' as const,
      channel: row.channel,
      status: row.status,
      attempts: (row.attempts as number) ?? 0,
      lastError: (row.last_error as string | null) ?? null,
      updatedAt: row.updated_at as string,
      recipient: subscribers.get(row.subscriber_id as string) ?? (row.subscriber_id as string),
    }]
  })
}

/* ------------------------------------------------------------------ */
/* Recap templates (Stream B)                                         */
/* ------------------------------------------------------------------ */

export type ContentTemplateRow = {
  id: string
  name: string
  nameFr: string | null
  slugBase: string
  section: string
  sourceType: string | null
  locationSlug: string | null
  tagSlug: string | null
  windowDays: number
  cadence: 'daily' | 'weekly'
  living: boolean
  isActive: boolean
  lastCompiledAt: string | null
  lastAddedCount: number | null
  /** Living draft currently owned by this template (edit → publish target). */
  draftId: string | null
}

/** All recap templates, newest first, each with its living draft pointer. */
export async function getContentTemplates(): Promise<ContentTemplateRow[]> {
  if (!hasDatabase()) return []
  const { data } = await safe(
    db()
      .from('content_templates')
      .select('id, name, name_fr, slug_base, section, source_type, source_filters, window_days, cadence, living, is_active, last_compiled_at, last_added_count, created_at')
      .order('created_at', { ascending: false }),
  )
  const { data: drafts } = await safe(
    db()
      .from('content_items')
      .select('id, template_id, status')
      .not('template_id', 'is', null)
      .eq('status', 'draft'),
  )
  const draftByTemplate = new Map<string, string>()
  for (const d of (drafts ?? []) as { id: string; template_id: string | null }[]) {
    if (d.template_id && !draftByTemplate.has(d.template_id)) draftByTemplate.set(d.template_id, d.id)
  }
  return ((data ?? []) as Record<string, unknown>[]).map((row) => {
    const filters = (row.source_filters ?? {}) as Record<string, unknown>
    return {
      id: row.id as string,
      name: row.name as string,
      nameFr: (row.name_fr as string | null) ?? null,
      slugBase: row.slug_base as string,
      section: row.section as string,
      sourceType: (row.source_type as string | null) ?? null,
      locationSlug: typeof filters.location_slug === 'string' ? filters.location_slug : null,
      tagSlug: typeof filters.tag_slug === 'string' ? filters.tag_slug : null,
      windowDays: (row.window_days as number) ?? 7,
      cadence: (row.cadence === 'daily' ? 'daily' : 'weekly') as 'daily' | 'weekly',
      living: Boolean(row.living),
      isActive: Boolean(row.is_active),
      lastCompiledAt: (row.last_compiled_at as string | null) ?? null,
      lastAddedCount: (row.last_added_count as number | null) ?? null,
      draftId: draftByTemplate.get(row.id as string) ?? null,
    }
  })
}
