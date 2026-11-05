import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/observability/logger'
import { sendEmail, sendWhatsAppProactive } from '@/lib/notify/channels'
import { SITE } from '@/lib/constants'
import { buildDailyBrief, groupBriefStories, type BriefStory } from './brief'
import { classifyDeliveryOutcome } from './delivery-state'

/**
 * Shared digest delivery (Stream A). One place renders + sends a brief
 * (daily digest, weekly recap, personalized follow briefs) and archives
 * the issue, so subject lines, diaspora framing, locale fallback, and the
 * digest_issues upsert (sent_on + locale + cadence) can never drift between
 * the three senders.
 */

export type DigestDelivery = {
  emailed: number
  whatsapped: number
  skipped: number
  failed: number
  uncertain: number
  durableByLocale: Record<'en' | 'fr', boolean>
  queuedByLocale: Record<'en' | 'fr', number>
  deliveredByLocale: Record<'en' | 'fr', { emailed: number; whatsapped: number }>
}

export type DigestDeliverOptions = {
  /** Per-locale story lists; a locale with an empty list borrows the other's. */
  storiesByLocale: Partial<Record<'en' | 'fr', BriefStory[]>>
  /** Display label in the brief heading (e.g. '2026-09-25' or 'week of 09-19'). */
  dateLabel: string
  /** The day the issue covers (digest_issues.sent_on). */
  sentOn: string
  cadence: 'daily' | 'weekly'
  subject: { en: string; fr: string }
  /**
   * P3 — admin-previewed intro/subject override (from /admin/digest
   * Regenerate). When absent the send path resolves its own AI intro
   * best-effort (flag + key gated, offline = no intro line).
   */
  introOverride?: Partial<Record<'en' | 'fr', { intro: string; subject: string }>>
  /** Defaults to all active digest_subscribers; personalized senders pass their own recipients. */
  recipients?: PersonalRecipient[]
  /** Personalized variants default to false — only site-wide issues belong in the public archive. */
  archive?: boolean
  /** Existing immutable delivery batch; used only when retrying failed attempts. */
  batchId?: string
  /** Retry only these already-failed recipient/channel pairs. */
  retryOnly?: { subscriberId: string; channel: 'email' | 'whatsapp' }[]
}

export type PersonalRecipient = {
  id?: string
  email: string | null
  phone: string | null
  whatsapp: string | null
  locale: string | null
  diasporaMode: boolean | null
}

type DigestDeliveryBatch = {
  id: string
  sent_on: string
  cadence: 'daily' | 'weekly'
  locale: 'en' | 'fr'
  date_label: string
  subject: string
  intro: string | null
  stories: BriefStory[]
  archived_at: string | null
}

async function activeSubscribers(): Promise<PersonalRecipient[]> {
  const db = createAdminClient()
  const subscribers: PersonalRecipient[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await db
      .from('digest_subscribers')
      .select('id, email, phone, whatsapp, locale, diaspora_mode')
      .eq('is_active', true)
      .order('id', { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) {
      logger.error('digest/deliver', 'subscriber fetch failed', { error: error.message, offset })
      throw new Error('Could not load active digest subscribers.')
    }
    const page = (data ?? []) as {
      id: string
      email: string | null
      phone: string | null
      whatsapp: string | null
      locale: string | null
      diaspora_mode: boolean | null
    }[]
    subscribers.push(...page.map((s) => ({
      id: s.id,
      email: s.email,
      phone: s.phone,
      whatsapp: s.whatsapp,
      locale: s.locale,
      diasporaMode: s.diaspora_mode,
    })))
    if (page.length < pageSize) break
  }
  return subscribers
}

const empty = (): DigestDelivery => ({
  emailed: 0,
  whatsapped: 0,
  skipped: 0,
  failed: 0,
  uncertain: 0,
  durableByLocale: { en: false, fr: false },
  queuedByLocale: { en: 0, fr: 0 },
  deliveredByLocale: {
    en: { emailed: 0, whatsapped: 0 },
    fr: { emailed: 0, whatsapped: 0 },
  },
})

/**
 * P3 — best-effort AI intro per locale. Returns null when the layer is
 * off/unconfigured/over budget (the brief renders identically to before —
 * no intro line, default subject). Never throws: a failed intro must not
 * fail the nightly fan-out. An admin `introOverride` (previewed in
 * /admin/digest) wins over a fresh generation.
 */
async function resolveAiIntro(
  locale: 'en' | 'fr',
  dateLabel: string,
  stories: BriefStory[],
  override?: { intro: string; subject: string },
): Promise<{ intro: string | null; subject: string | null }> {
  if (override && (override.intro.trim() || override.subject.trim())) {
    return { intro: override.intro.trim().slice(0, 220) || null, subject: override.subject.trim().slice(0, 70) || null }
  }
  try {
    const { getLlmRuntime } = await import('@/lib/ai/settings')
    const { getAppFlag } = await import('@/lib/automation/flags')
    const rt = await getLlmRuntime()
    if (!rt.apiKey || rt.disabled) return { intro: null, subject: null }
    if (!(await getAppFlag<boolean>('ai.digest_intro', true))) return { intro: null, subject: null }
    const { llmDigestIntro } = await import('@/lib/translate/prompts')
    const { logLlmCall } = await import('@/lib/translate/llm')
    const out = await llmDigestIntro({ locale, dateLabel, headlines: stories.map((x) => x.title).slice(0, 12) })
    await logLlmCall({ action: 'ai.digest_intro_send', model: rt.model, status: 'ok' })
    return { intro: out.intro.trim().slice(0, 220) || null, subject: out.subject.trim().slice(0, 70) || null }
  } catch (e) {
    logger.warn('digest/intro', 'AI intro fell back to offline', { error: e instanceof Error ? e.message.slice(0, 120) : 'error', locale })
    return { intro: null, subject: null }
  }
}

function parseBatchStories(value: unknown): BriefStory[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const row = item as Record<string, unknown>
    if (typeof row.title !== 'string' || typeof row.type !== 'string' || typeof row.path !== 'string') return []
    return [{
      title: row.title,
      type: row.type,
      path: row.path,
      shareText: typeof row.shareText === 'string' ? row.shareText : null,
      contentItemId: typeof row.contentItemId === 'string' ? row.contentItemId : null,
      locationId: typeof row.locationId === 'string' ? row.locationId : null,
      categoryId: typeof row.categoryId === 'string' ? row.categoryId : null,
    }]
  })
}

async function getOrCreateBatch(
  options: DigestDeliverOptions,
  locale: 'en' | 'fr',
  stories: BriefStory[],
  intro: { intro: string | null; subject: string | null },
): Promise<DigestDeliveryBatch> {
  const db = createAdminClient()
  if (options.batchId) {
    const { data, error } = await db
      .from('digest_delivery_batches')
      .select('id, sent_on, cadence, locale, date_label, subject, intro, stories, archived_at')
      .eq('id', options.batchId)
      .single()
    if (error || !data) throw new Error(`Could not load digest delivery batch: ${error?.message ?? 'not found'}`)
    if (data.cadence !== 'daily' && data.cadence !== 'weekly') throw new Error(`Unsupported digest batch cadence: ${data.cadence}`)
    if (data.locale !== 'en' && data.locale !== 'fr') throw new Error(`Unsupported digest batch locale: ${data.locale}`)
    return { ...data, cadence: data.cadence, locale: data.locale, stories: parseBatchStories(data.stories) }
  }

  const { data: batchId, error: createError } = await db.rpc('digest_create_delivery_batch', {
    p_sent_on: options.sentOn,
    p_cadence: options.cadence,
    p_locale: locale,
    p_date_label: options.dateLabel,
    p_subject: intro.subject ?? options.subject[locale],
    p_intro: intro.intro,
    p_stories: stories.map((story) => ({
      title: story.title,
      type: story.type,
      path: story.path,
      shareText: story.shareText ?? null,
      contentItemId: story.contentItemId ?? null,
      locationId: story.locationId ?? null,
      categoryId: story.categoryId ?? null,
    })),
  })
  if (createError || !batchId) {
    throw new Error(`Could not persist digest delivery batch: ${createError?.message ?? 'no batch id returned'}`)
  }
  const { data, error } = await db
    .from('digest_delivery_batches')
    .select('id, sent_on, cadence, locale, date_label, subject, intro, stories, archived_at')
    .eq('id', batchId)
    .single()
  if (error || !data) throw new Error(`Could not load persisted digest batch: ${error?.message ?? 'not found'}`)
  if (data.cadence !== 'daily' && data.cadence !== 'weekly') throw new Error(`Unsupported digest batch cadence: ${data.cadence}`)
  if (data.locale !== 'en' && data.locale !== 'fr') throw new Error(`Unsupported digest batch locale: ${data.locale}`)
  return { ...data, cadence: data.cadence, locale: data.locale, stories: parseBatchStories(data.stories) }
}

async function archiveDigestBatch(batch: DigestDeliveryBatch): Promise<boolean> {
  const db = createAdminClient()
  const [emailCount, whatsappCount] = await Promise.all([
    db.from('digest_delivery_attempts').select('id', { count: 'exact', head: true })
      .eq('batch_id', batch.id).eq('channel', 'email').eq('status', 'sent'),
    db.from('digest_delivery_attempts').select('id', { count: 'exact', head: true })
      .eq('batch_id', batch.id).eq('channel', 'whatsapp').eq('status', 'sent'),
  ])
  if (emailCount.error || whatsappCount.error) {
    throw new Error(`Could not count digest deliveries: ${emailCount.error?.message ?? whatsappCount.error?.message}`)
  }
  const emailed = emailCount.count ?? 0
  const whatsapped = whatsappCount.count ?? 0
  const hasDelivered = emailed + whatsapped > 0
  if (hasDelivered) {
    const { error: archiveError } = await db.from('digest_issues').upsert(
      {
        sent_on: batch.sent_on,
        locale: batch.locale,
        cadence: batch.cadence,
        subject: batch.subject,
        stories: batch.stories.map((story) => ({ title: story.title, path: story.path })),
        emailed,
        whatsapped,
      },
      { onConflict: 'sent_on,locale,cadence' },
    )
    if (archiveError) throw new Error(`Digest archive upsert failed: ${archiveError.message}`)
  }
  const { error: markArchivedError } = await db.from('digest_delivery_batches')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', batch.id)
    .is('archived_at', null)
  if (markArchivedError) throw new Error(`Could not mark digest batch archived: ${markArchivedError.message}`)
  return hasDelivered
}

/** Render and send one immutable issue, tracking each subscriber/channel separately. */
export async function deliverDigest(options: DigestDeliverOptions): Promise<DigestDelivery> {
  const out = empty()
  const db = createAdminClient()
  const subs = options.recipients ?? (await activeSubscribers())
  if (subs.length === 0) return out

  const enStories = options.storiesByLocale.en ?? []
  const frStories = options.storiesByLocale.fr ?? []
  if (!options.batchId && enStories.length === 0 && frStories.length === 0) {
    out.skipped = subs.length
    return out
  }

  const storiesFor = (locale: 'en' | 'fr'): BriefStory[] =>
    (locale === 'fr' ? frStories : enStories).length > 0
      ? (locale === 'fr' ? frStories : enStories)
      : locale === 'fr' ? enStories : frStories

  const subsByLocale: Record<'en' | 'fr', PersonalRecipient[]> = {
    en: subs.filter((s) => !/^fr/i.test(s.locale ?? '')),
    fr: subs.filter((s) => /^fr/i.test(s.locale ?? '')),
  }
  const batches: Partial<Record<'en' | 'fr', DigestDeliveryBatch>> = {}
  const intros: Partial<Record<'en' | 'fr', { intro: string | null; subject: string | null }>> = {}
  for (const locale of ['en', 'fr'] as const) {
    if (subsByLocale[locale].length === 0) continue
    const ai = options.batchId
      ? { intro: null, subject: null }
      : await resolveAiIntro(locale, options.dateLabel, storiesFor(locale), options.introOverride?.[locale])
    intros[locale] = ai
    batches[locale] = options.archive === false
      ? {
          id: '',
          sent_on: options.sentOn,
          cadence: options.cadence,
          locale,
          date_label: options.dateLabel,
          subject: ai.subject ?? options.subject[locale],
          intro: ai.intro,
          stories: storiesFor(locale),
          archived_at: null,
        }
      : await getOrCreateBatch(options, locale, storiesFor(locale), ai)
    out.durableByLocale[locale] = options.archive !== false
  }

  const retryKeys = options.retryOnly
    ? new Set(options.retryOnly.map((attempt) => `${attempt.subscriberId}:${attempt.channel}`))
    : null
  const recordAttempt = async (
    recipientId: string,
    batchId: string,
    locale: 'en' | 'fr',
    channel: 'email' | 'whatsapp',
    operation: () => ReturnType<typeof sendEmail> | ReturnType<typeof sendWhatsAppProactive>,
  ) => {
    const key = `${recipientId}:${channel}`
    if (retryKeys && !retryKeys.has(key)) return
    const { data: claimed, error: claimError } = await db.rpc('digest_claim_delivery', {
      p_batch_id: batchId,
      p_subscriber_id: recipientId,
      p_channel: channel,
    })
    if (claimError) throw new Error(`Could not claim digest ${channel} delivery: ${claimError.message}`)
    if (!claimed) return

    out.queuedByLocale[locale] = (out.queuedByLocale[locale] ?? 0) + 1
    const result = await operation()
    const status = classifyDeliveryOutcome(result)
    const { error: finishError } = await db.rpc('digest_finish_delivery', {
      p_batch_id: batchId,
      p_subscriber_id: recipientId,
      p_channel: channel,
      p_status: status,
      p_error: result.error ?? result.skipped ?? null,
    })
    if (finishError) throw new Error(`Could not record digest ${channel} delivery: ${finishError.message}`)

    if (!result.delivered) {
      out.skipped += 1
      if (status === 'unknown') out.uncertain += 1
      else out.failed += 1
      return
    }
    if (channel === 'email') {
      out.emailed += 1
      out.deliveredByLocale[locale].emailed += 1
    } else {
      out.whatsapped += 1
      out.deliveredByLocale[locale].whatsapped += 1
    }
  }

  for (const s of subs) {
    const locale: 'en' | 'fr' = /^fr/i.test(s.locale ?? '') ? 'fr' : 'en'
    const batch = batches[locale]
    if (!batch) continue
    if (!s.id && options.archive !== false) {
      throw new Error('Digest subscriber is missing the identifier required for delivery tracking.')
    }
    const recipientId = s.id
    if (!recipientId || options.archive === false) {
      const ai = intros[locale] ?? { intro: null, subject: null }
      const { title, body } = buildDailyBrief(groupBriefStories(storiesFor(locale)), {
        locale,
        dateLabel: options.dateLabel,
        siteUrl: SITE.url,
        digestPath: `/${locale}/digest`,
        framing: s.diasporaMode ? 'diaspora' : 'standard',
        intro: ai.intro,
        subject: ai.subject ?? options.subject[locale],
      })
      if (s.email && /^\S+@\S+\.\S+$/.test(s.email)) {
        const result = await sendEmail(s.email, title, title, body, `${SITE.url}/${locale}/digest`)
        if (result.delivered) {
          out.emailed += 1
          out.deliveredByLocale[locale].emailed += 1
        } else out.skipped += 1
      }
      const phone = s.whatsapp ?? s.phone
      if (phone) {
        const result = await sendWhatsAppProactive(phone, `${title}\n${body}`, s.locale)
        if (result.delivered) {
          out.whatsapped += 1
          out.deliveredByLocale[locale].whatsapped += 1
        } else out.skipped += 1
      }
      continue
    }

    const { title, body } = buildDailyBrief(groupBriefStories(batch.stories), {
      locale,
      dateLabel: batch.date_label,
      siteUrl: SITE.url,
      digestPath: `/${locale}/digest`,
      framing: s.diasporaMode ? 'diaspora' : 'standard',
      intro: batch.intro,
      subject: batch.subject,
    })
    const url = `${SITE.url}/${locale}/digest`
    if (s.email) {
      await recordAttempt(recipientId, batch.id, locale, 'email', () => sendEmail(s.email!, title, title, body, url))
    }
    const phone = s.whatsapp ?? s.phone
    if (phone) {
      await recordAttempt(recipientId, batch.id, locale, 'whatsapp', () =>
        sendWhatsAppProactive(phone, `${title}\n${body}`, s.locale))
    }
  }

  if (options.archive === false) return out
  for (const locale of ['en', 'fr'] as const) {
    const batch = batches[locale]
    if (!batch) continue
    await archiveDigestBatch(batch)
  }
  return out
}

/** Drain queued and confirmed-failed immutable batches; `unknown` is left for review. */
export async function retryPendingDigestBatches(cadence: 'daily' | 'weekly'): Promise<DigestDelivery> {
  const out = empty()
  const db = createAdminClient()
  const retryRows: { batch_id: string; subscriber_id: string; channel: string }[] = []
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from('digest_delivery_attempts')
      .select('batch_id, subscriber_id, channel')
      .in('status', ['pending', 'failed'])
      .order('id', { ascending: true })
      .range(offset, offset + 499)
    if (error) throw new Error(`Could not load failed digest deliveries: ${error.message}`)
    const page = (data ?? []).filter((row) => row.channel === 'email' || row.channel === 'whatsapp')
    retryRows.push(...page)
    if (page.length < 500) break
  }
  const batchIds = new Set(retryRows.map((row) => row.batch_id))
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from('digest_delivery_batches')
      .select('id')
      .eq('cadence', cadence)
      .is('archived_at', null)
      .order('sent_on', { ascending: true })
      .range(offset, offset + 499)
    if (error) throw new Error(`Could not load unarchived digest batches: ${error.message}`)
    for (const row of data ?? []) batchIds.add(row.id)
    if (!data || data.length < 500) break
  }
  if (batchIds.size === 0) return out

  const batchRows: DigestDeliveryBatch[] = []
  const ids = [...batchIds]
  for (let offset = 0; offset < ids.length; offset += 100) {
    const batch = ids.slice(offset, offset + 100)
    const { data, error } = await db
      .from('digest_delivery_batches')
      .select('id, sent_on, cadence, locale, date_label, subject, intro, stories, archived_at')
      .eq('cadence', cadence)
      .in('id', batch)
    if (error) throw new Error(`Could not load retryable digest batches: ${error.message}`)
    for (const row of data ?? []) {
      if (row.cadence !== 'daily' && row.cadence !== 'weekly') {
        throw new Error(`Unsupported digest batch cadence: ${row.cadence}`)
      }
      if (row.locale !== 'en' && row.locale !== 'fr') {
        throw new Error(`Unsupported digest batch locale: ${row.locale}`)
      }
      batchRows.push({ ...row, cadence: row.cadence, locale: row.locale, stories: parseBatchStories(row.stories) })
    }
  }
  const subscribers = await activeSubscribers()
  const activeById = new Map(subscribers.flatMap((subscriber) => subscriber.id ? [[subscriber.id, subscriber] as const] : []))

  for (const row of batchRows) {
    await archiveDigestBatch(row)
    const attempts = retryRows.filter((item) => item.batch_id === row.id)
    if (attempts.length === 0) continue
    const retryOnly: { subscriberId: string; channel: 'email' | 'whatsapp' }[] = []
    const recipients = new Map<string, PersonalRecipient>()
    for (const attempt of attempts) {
      const subscriber = activeById.get(attempt.subscriber_id)
      const hasDestination = subscriber && (
        attempt.channel === 'email' ? Boolean(subscriber.email) :
          attempt.channel === 'whatsapp' ? Boolean(subscriber.whatsapp ?? subscriber.phone) : false
      )
      if (!subscriber || !hasDestination) {
        const { error } = await db.from('digest_delivery_attempts')
          .update({ status: 'cancelled', last_error: 'Subscriber is inactive or no longer has this channel.', updated_at: new Date().toISOString() })
          .eq('batch_id', row.id).eq('subscriber_id', attempt.subscriber_id)
          .eq('channel', attempt.channel).in('status', ['pending', 'failed'])
        if (error) throw new Error(`Could not cancel inactive digest delivery: ${error.message}`)
        continue
      }
      if (attempt.channel !== 'email' && attempt.channel !== 'whatsapp') continue
      retryOnly.push({ subscriberId: attempt.subscriber_id, channel: attempt.channel })
      recipients.set(attempt.subscriber_id, subscriber)
    }
    if (retryOnly.length === 0) continue

    const result = await deliverDigest({
      storiesByLocale: { [row.locale]: row.stories },
      dateLabel: row.date_label,
      sentOn: row.sent_on,
      cadence: row.cadence,
      subject: { en: row.subject, fr: row.subject },
      recipients: [...recipients.values()],
      batchId: row.id,
      retryOnly,
    })
    out.emailed += result.emailed
    out.whatsapped += result.whatsapped
    out.skipped += result.skipped
    out.failed += result.failed
    out.uncertain += result.uncertain
    out.queuedByLocale[row.locale] += result.queuedByLocale[row.locale]
    out.deliveredByLocale[row.locale].emailed += result.deliveredByLocale[row.locale].emailed
    out.deliveredByLocale[row.locale].whatsapped += result.deliveredByLocale[row.locale].whatsapped
    out.durableByLocale[row.locale] = true
  }
  return out
}

/** Once a batch snapshot exists, keep its stories out of later daily issues. */
export async function markPersistedDigestSlots(
  cadence: 'daily' | 'weekly',
  throughDate: string,
): Promise<void> {
  if (cadence !== 'daily') return
  const db = createAdminClient()
  const seen = new Set<string>()
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from('digest_delivery_batches')
      .select('sent_on, locale')
      .eq('cadence', cadence)
      .lte('sent_on', throughDate)
      .order('sent_on', { ascending: true })
      .range(offset, offset + 499)
    if (error) throw new Error(`Could not load persisted digest batches: ${error.message}`)
    for (const batch of data ?? []) {
      const key = `${batch.sent_on}:${batch.locale}`
      if (seen.has(key)) continue
      seen.add(key)
      const { error: markError } = await db.rpc('digest_mark_locale_sent', {
        p_issue_date: batch.sent_on,
        p_locale: batch.locale,
      })
      if (markError) throw new Error(`Could not mark persisted ${batch.locale} digest slots: ${markError.message}`)
    }
    if (!data || data.length < 500) break
  }
}

const WEEKLY_SUBJECT: Record<'en' | 'fr', string> = {
  en: 'Eagle Eye Africa — weekly recap',
  fr: 'Eagle Eye Africa — résumé hebdomadaire',
}

/* ------------------------------------------------------------------ */
/* Personalized follow briefs (A6)                                    */
/* ------------------------------------------------------------------ */

type FollowRow = { user_id: string; content_type: string; category_id: string | null; location_id: string | null }
type ProfileRow = { id: string; email: string | null; phone: string | null; preferred_locale: string }

/** Does one frozen story match one follow row (type / location / category)? */
export function matchesFollow(story: BriefStory, follow: FollowRow): boolean {
  if (follow.location_id) return story.locationId === follow.location_id
  if (follow.category_id) return story.categoryId === follow.category_id
  return story.type === follow.content_type || (follow.content_type === 'news' && story.type === 'micro_story')
}

/**
 * Personal daily briefs for account holders with content follows: same
 * frozen slot pool as the site-wide digest, filtered to what they follow.
 * Email-only (profile email), min two matches — a one-story personal brief
 * is noise the site-wide send already covers. Never archived (personal
 * variants belong to the recipient, not the public /digest/archive page).
 */
export async function sendPersonalBriefs(
  storiesByLocale: Partial<Record<'en' | 'fr', BriefStory[]>>,
  dateLabel: string,
): Promise<{ sent: number; considered: number }> {
  const result = { sent: 0, considered: 0 }
  try {
    const db = createAdminClient()
    const { data: follows } = await db
      .from('content_follows')
      .select('user_id, content_type, category_id, location_id')
      .limit(5000)
    const rows = (follows ?? []) as FollowRow[]
    if (rows.length === 0) return result
    const userIds = [...new Set(rows.map((f) => f.user_id))].slice(0, 200)
    const { data: profiles } = await db
      .from('profiles')
      .select('id, email, phone, preferred_locale')
      .in('id', userIds)
    const profileById = new Map(((profiles ?? []) as ProfileRow[]).map((p) => [p.id, p]))
    const followsByUser = new Map<string, FollowRow[]>()
    for (const f of rows) {
      const list = followsByUser.get(f.user_id) ?? []
      list.push(f)
      followsByUser.set(f.user_id, list)
    }
    for (const userId of userIds) {
      const profile = profileById.get(userId)
      if (!profile?.email || !/^\S+@\S+\.\S+$/.test(profile.email)) continue
      const userFollows = followsByUser.get(userId) ?? []
      if (userFollows.length === 0) continue
      result.considered += 1
      const fr = /^fr/i.test(profile.preferred_locale ?? '')
      const pool = (fr ? storiesByLocale.fr : storiesByLocale.en) ?? storiesByLocale.en ?? []
      const personal = pool.filter((story) => userFollows.some((f) => matchesFollow(story, f)))
      if (personal.length < 2) continue
      const { title, body } = buildDailyBrief(groupBriefStories(personal), {
        locale: fr ? 'fr' : 'en',
        dateLabel,
        siteUrl: SITE.url,
        digestPath: fr ? '/fr/digest' : '/en/digest',
        framing: 'standard',
      })
      const res = await sendEmail(profile.email, title, title, body, `${SITE.url}/${fr ? 'fr' : 'en'}/digest`)
      if (res.delivered) result.sent += 1
    }
  } catch (e) {
    logger.error('digest/personal', 'personal briefs failed', { error: e instanceof Error ? e.message : String(e) })
  }
  return result
}

/**
 * Weekly recap (A5): aggregate the last `windowDays` of FIRST-published
 * items into one issue sent Mondays. Reads published content directly
 * (slots roll on), so a missed week still covers its full window.
 *
 * Duplicate-proof: filters on first_published_at (edits bump updated_at,
 * never first_published_at) AND excludes ids already frozen into
 * digest_slots with sent_at set — an edit can never re-enter as "this week".
 */
export async function sendWeeklyDigest(windowDays = 7): Promise<DigestDelivery & { stories: number }> {
  const retried = await retryPendingDigestBatches('weekly')
  const db = createAdminClient()
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString()
  // ids already delivered via the daily slots must not re-send in weekly
  const { data: sent } = await db
    .from('digest_slots')
    .select('content_item_id')
    .not('sent_at', 'is', null)
    .limit(5000)
  const sentIds = new Set(((sent ?? []) as { content_item_id: string }[]).map((r) => r.content_item_id))
  // first_published_at is new (migration 20261114000000) — fall back to
  // published_at on rows/deployments where it is still null.
  const { data, error } = await db
    .from('content_items')
    .select('id, type, slug, is_featured, published_at, first_published_at, updated_at, translations:content_translations(locale, title, share_text)')
    .eq('status', 'published')
    .eq('is_archived', false)
    .order('is_featured', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(120)
  if (error || !data) {
    logger.error('digest/weekly', 'source fetch failed', { error: error?.message ?? 'no data' })
    return { ...retried, stories: 0 }
  }
  const rows = (data as unknown as {
    id: string
    type: string | null
    slug: string | null
    is_featured: boolean
    published_at: string | null
    first_published_at?: string | null
    updated_at?: string | null
    translations: { locale: string; title: string | null; share_text: string | null }[] | { locale: string; title: string | null; share_text: string | null } | null
  }[]).filter((r) => {
    if (sentIds.has(r.id)) return false
    // An edit bumps updated_at but not first_published_at — only the
    // first go-live date counts for weekly inclusion.
    const first = r.first_published_at ?? r.published_at
    if (!first) return false
    return Date.parse(first) >= Date.parse(since)
  }).slice(0, 60)

  const SECTION_PATH: Record<string, string> = {
    photo_story: 'photo-stories',
    notice: 'notices',
    listing: 'buy-sell',
    culture: 'culture',
    news: 'news',
    micro_story: 'news',
  }

  const byLocale: Record<'en' | 'fr', BriefStory[]> = { en: [], fr: [] }
  for (const r of rows) {
    const list = Array.isArray(r.translations) ? r.translations : r.translations ? [r.translations] : []
    for (const locale of ['en', 'fr'] as const) {
      const tx = list.find((t) => t.locale === locale && t.title)
      const title = tx?.title ?? list.find((t) => t.title)?.title
      if (!title) continue
      byLocale[locale].push({
        title: title.slice(0, 120),
        type: r.type ?? 'news',
        path: `/${SECTION_PATH[r.type ?? 'news'] ?? 'news'}/${r.slug ?? r.id}`,
        shareText: tx?.share_text ?? null,
        contentItemId: r.id,
      })
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const label = new Date().toISOString().slice(5, 10)
  const result = await deliverDigest({
    storiesByLocale: byLocale,
    dateLabel: `week of ${label}`,
    sentOn: today,
    cadence: 'weekly',
    subject: WEEKLY_SUBJECT,
  })
  return {
    ...result,
    emailed: retried.emailed + result.emailed,
    whatsapped: retried.whatsapped + result.whatsapped,
    skipped: retried.skipped + result.skipped,
    failed: retried.failed + result.failed,
    uncertain: retried.uncertain + result.uncertain,
    queuedByLocale: {
      en: retried.queuedByLocale.en + result.queuedByLocale.en,
      fr: retried.queuedByLocale.fr + result.queuedByLocale.fr,
    },
    durableByLocale: {
      en: retried.durableByLocale.en || result.durableByLocale.en,
      fr: retried.durableByLocale.fr || result.durableByLocale.fr,
    },
    deliveredByLocale: {
      en: {
        emailed: retried.deliveredByLocale.en.emailed + result.deliveredByLocale.en.emailed,
        whatsapped: retried.deliveredByLocale.en.whatsapped + result.deliveredByLocale.en.whatsapped,
      },
      fr: {
        emailed: retried.deliveredByLocale.fr.emailed + result.deliveredByLocale.fr.emailed,
        whatsapped: retried.deliveredByLocale.fr.whatsapped + result.deliveredByLocale.fr.whatsapped,
      },
    },
    stories: byLocale.en.length + byLocale.fr.length,
  }
}
