'use server'

import { assertCapability, type AdminContext } from '@/lib/admin/auth'
import { audit, revalidateLocalized } from './_shared'
import { compileTemplate } from '@/lib/content/templates-run'
import { channelStatus } from '@/lib/notify/channels'
import {
  deliverDigest,
  markPersistedDigestSlots,
  retryFailedDigestBatches,
  sendWeeklyDigest,
} from '@/lib/digest/deliver'
import { parseDigestFreeze } from '@/lib/digest/freeze'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/observability/logger'
import { getAppFlag, setAppFlag } from '@/lib/automation/flags'
import { isPublicFanoutPaused } from '@/lib/platform/fanout'

/* ------------------------------------------------------------------ */
/* Digest slots (Stream A) — editor pin / drop for the open issue      */
/* ------------------------------------------------------------------ */

type SlotResult = { ok: true } | { ok: false; error: string }

const VALID_SECTIONS = ['news', 'photo', 'notice', 'listing', 'culture'] as const
export type TemplateSection = (typeof VALID_SECTIONS)[number]

function auditSlot(supabase: AdminContext['supabase'], userId: string, action: string, notes: string) {
  return audit(supabase, userId, { action, notes })
}

/** Pin (rank first) or un-pin a slot for its issue. Only open slots change. */
export async function setSlotPinned(slotId: string, pinned: boolean): Promise<SlotResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const { error, count } = await supabase
      .from('digest_slots')
      .update({ pinned }, { count: 'exact' })
      .eq('id', slotId)
      .is('sent_at', null)
    if (error) return { ok: false, error: error.message }
    if (!count) return { ok: false, error: 'Slot not found or already delivered.' }
    await auditSlot(supabase, user.id, pinned ? 'digest:pin' : 'digest:unpin', `slot=${slotId}`)
    revalidateLocalized('/admin/digest')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
  }
}

/** Drop a slot from the issue (restore with value false). */
export async function setSlotRemoved(slotId: string, removed: boolean): Promise<SlotResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const { error, count } = await supabase
      .from('digest_slots')
      .update({ removed }, { count: 'exact' })
      .eq('id', slotId)
      .is('sent_at', null)
    if (error) return { ok: false, error: error.message }
    if (!count) return { ok: false, error: 'Slot not found or already delivered.' }
    await auditSlot(supabase, user.id, removed ? 'digest:drop' : 'digest:restore', `slot=${slotId}`)
    revalidateLocalized('/admin/digest')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
  }
}

/* ------------------------------------------------------------------ */
/* AI Intro Override (stored in flags)                                 */
/* ------------------------------------------------------------------ */

export async function setDigestIntroOverride(
  locale: 'en' | 'fr',
  intro: string | null,
  subject: string | null
): Promise<SlotResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const flagKey = `digest.intro_override.${locale}`
    const value = intro?.trim() || subject?.trim() ? { intro: intro?.trim() || null, subject: subject?.trim() || null } : null
    await setAppFlag(flagKey, value)
    await auditSlot(supabase, user.id, 'digest:intro_override', `locale=${locale}`)
    revalidateLocalized('/admin/digest')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
  }
}

export async function clearDigestIntroOverride(locale: 'en' | 'fr'): Promise<SlotResult> {
  return setDigestIntroOverride(locale, null, null)
}

/* ------------------------------------------------------------------ */
/* Subscriber management                                               */
/* ------------------------------------------------------------------ */

export async function toggleDigestSubscriber(subscriberId: string, isActive: boolean): Promise<SlotResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const { error, count } = await supabase
      .from('digest_subscribers')
      .update({ is_active: isActive }, { count: 'exact' })
      .eq('id', subscriberId)
    if (error) return { ok: false, error: error.message }
    if (!count) return { ok: false, error: 'Subscriber not found.' }
    await auditSlot(supabase, user.id, isActive ? 'digest:subscriber:activate' : 'digest:subscriber:deactivate', `subscriber=${subscriberId}`)
    revalidateLocalized('/admin/digest')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
  }
}

/* ------------------------------------------------------------------ */
/* Test send (deliver to current admin)                               */
/* ------------------------------------------------------------------ */

export async function sendTestDigest(
  locale: 'en' | 'fr',
  cadence: 'daily' | 'weekly'
): Promise<SlotResult & { detail?: { emailed: number; whatsapped: number } }> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    if ((locale !== 'en' && locale !== 'fr') || (cadence !== 'daily' && cadence !== 'weekly')) {
      return { ok: false, error: 'Choose a supported locale and digest cadence.' }
    }
    // Get admin's contact info
    const { data: profile, error: profileError } = await createAdminClient()
      .from('profiles')
      .select('email, phone')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError) return { ok: false, error: 'Could not load your test-send contact details.' }
    if (!profile?.email && !profile?.phone) {
      return { ok: false, error: 'Admin profile has no email or phone to send test to.' }
    }

    const issueDate = new Date().toISOString().slice(0, 10)
    type DigestStorySeed = { title: string; type: string; path: string; shareText?: string | null }
    let storiesByLocale: { en?: DigestStorySeed[]; fr?: DigestStorySeed[] }

    if (cadence === 'daily') {
      const { data, error } = await supabase.rpc('digest_freeze', { p_issue_date: issueDate })
      if (error) return { ok: false, error: 'Could not load the current daily digest.' }
      storiesByLocale = parseDigestFreeze(data)
    } else {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('content_items')
        .select('id, type, slug, translations:content_translations(locale, title, share_text)')
        .eq('status', 'published')
        .eq('is_archived', false)
        .gte('published_at', since)
        .order('published_at', { ascending: false })
        .limit(20)
      if (error) return { ok: false, error: 'Could not load the current weekly digest.' }
      type TranslationRow = { locale: string; title: string | null; share_text?: string | null }
      type ContentRow = { id: string; type: string | null; slug: string | null; translations: TranslationRow[] | TranslationRow | null }
      const rows = (data ?? []) as ContentRow[]
      const sectionPath: Record<string, string> = {
        photo_story: 'photo-stories',
        notice: 'notices',
        listing: 'buy-sell',
        culture: 'culture',
        news: 'news',
        micro_story: 'news',
      }
      storiesByLocale = { en: [], fr: [] }
      for (const r of rows) {
        const list = Array.isArray(r.translations) ? r.translations : r.translations ? [r.translations] : []
        for (const locale of ['en', 'fr'] as const) {
          const preferred = list.find((t) => t.locale === locale && t.title) ?? list.find((t) => t.title)
          if (!preferred?.title) continue
          storiesByLocale[locale]?.push({
            title: preferred.title.slice(0, 120),
            type: r.type ?? 'news',
            path: `/${sectionPath[r.type ?? 'news'] ?? 'news'}/${r.slug ?? r.id}`,
            shareText: preferred.share_text ?? null,
          })
        }
      }
    }

    const result = await deliverDigest({
      storiesByLocale,
      dateLabel: issueDate,
      sentOn: issueDate,
      cadence,
      subject: { en: 'TEST — Eagle Eye Africa daily digest', fr: 'TEST — Eagle Eye Africa résumé du jour' },
      recipients: [{
        email: profile.email,
        phone: profile.phone,
        whatsapp: profile.phone,
        locale,
        diasporaMode: false,
      }],
      archive: false,
    })

    await auditSlot(supabase, user.id, 'digest:test_send', `locale=${locale} cadence=${cadence}`)
    return { ok: true, detail: { emailed: result.emailed, whatsapped: result.whatsapped } }
  } catch (e) {
    logger.error('admin/digest', 'test send failed', { error: e instanceof Error ? e.message : String(e) })
    return { ok: false, error: e instanceof Error ? e.message : 'Test send failed' }
  }
}

/* ------------------------------------------------------------------ */
/* Manual trigger (run tonight's ops-digest / weekly-digest now)      */
/* ------------------------------------------------------------------ */

export async function runOpsDigestNow(): Promise<SlotResult> {
  try {
    await assertCapability('manageContent')
    const fanoutGate = await isPublicFanoutPaused()
    if (fanoutGate.paused) return { ok: false, error: 'Digest delivery is paused by the current system state.' }
    const db = createAdminClient()
    const issueDate = new Date().toISOString().slice(0, 10)
    await markPersistedDigestSlots('daily', issueDate)
    const retries = await retryFailedDigestBatches('daily')
    const { data: frozen, error: freezeError } = await db.rpc('digest_freeze', { p_issue_date: issueDate })
    if (freezeError) throw new Error(`Digest freeze failed: ${freezeError.message}`)
    const storiesByLocale = parseDigestFreeze(frozen)
    let deliveryFailures = retries.failed
    if (storiesByLocale && (storiesByLocale.en?.length || storiesByLocale.fr?.length)) {
      const delivery = await deliverDigest({
        storiesByLocale,
        dateLabel: issueDate,
        sentOn: issueDate,
        cadence: 'daily',
        subject: { en: 'Eagle Eye Africa — daily digest', fr: 'Eagle Eye Africa — résumé du jour' },
      })
      deliveryFailures += delivery.failed
      for (const locale of ['en', 'fr'] as const) {
        if (!delivery.durableByLocale[locale]) continue
        const { error } = await db.rpc('digest_mark_locale_sent', {
          p_issue_date: issueDate,
          p_locale: locale,
        })
        if (error) throw new Error(`Could not mark ${locale} digest slots sent: ${error.message}`)
      }
    }
    if (deliveryFailures > 0) return { ok: false, error: 'Some confirmed delivery failures remain and will be retried on the next run.' }
    return { ok: true }
  } catch (e) {
    logger.error('admin/digest', 'manual ops-digest failed', { error: e instanceof Error ? e.message : String(e) })
    return { ok: false, error: e instanceof Error ? e.message : 'Manual run failed' }
  }
}

export async function runWeeklyDigestNow(): Promise<SlotResult> {
  try {
    await assertCapability('manageContent')
    const fanoutGate = await isPublicFanoutPaused()
    if (fanoutGate.paused) return { ok: false, error: 'Digest delivery is paused by the current system state.' }
    const delivery = await sendWeeklyDigest(7)
    if (delivery.failed > 0) return { ok: false, error: 'Some confirmed delivery failures remain and will be retried on the next run.' }
    return { ok: true }
  } catch (e) {
    logger.error('admin/digest', 'manual weekly-digest failed', { error: e instanceof Error ? e.message : String(e) })
    return { ok: false, error: e instanceof Error ? e.message : 'Manual run failed' }
  }
}

/** Requeue one uncertain delivery after staff have checked the provider dashboard. */
export async function retryDigestDeliveryAfterReview(id: string): Promise<SlotResult> {
  try {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return { ok: false, error: 'Invalid delivery identifier.' }
    const { supabase, user } = await assertCapability('manageContent')
    const db = createAdminClient()
    const staleBefore = new Date(Date.now() - 2 * 60_000).toISOString()
    const update = (status: 'unknown' | 'sending') => {
      let query = db.from('digest_delivery_attempts')
        .update({ status: 'failed', last_error: 'Manually requeued after provider review.', updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('status', status)
      if (status === 'sending') query = query.lt('updated_at', staleBefore)
      return query.select('batch_id, channel').maybeSingle()
    }

    let { data, error } = await update('unknown')
    if (!data && !error) ({ data, error } = await update('sending'))
    if (error) return { ok: false, error: error.message }
    if (!data) return { ok: false, error: 'Delivery is no longer reviewable or is still in progress.' }

    await audit(supabase, user.id, {
      action: 'digest:delivery_requeued_after_review',
      notes: `batch=${data.batch_id} channel=${data.channel}`,
    })
    const { data: batch, error: batchError } = await db
      .from('digest_delivery_batches')
      .select('cadence')
      .eq('id', data.batch_id)
      .single()
    if (batchError) return { ok: false, error: `Delivery requeued but its issue could not be loaded: ${batchError.message}` }
    if (batch.cadence !== 'daily' && batch.cadence !== 'weekly') {
      return { ok: false, error: 'Delivery requeued but its issue cadence is invalid.' }
    }
    const retry = await retryFailedDigestBatches(batch.cadence)
    revalidateLocalized('/admin/digest')
    if (retry.failed > 0) return { ok: false, error: 'Some confirmed delivery failures remain.' }
    if (retry.uncertain > 0) return { ok: false, error: 'The provider outcome is still uncertain; review it again before retrying.' }
    return { ok: true }
  } catch (e) {
    logger.error('admin/digest', 'uncertain delivery requeue failed', { error: e instanceof Error ? e.message : String(e) })
    return { ok: false, error: e instanceof Error ? e.message : 'Could not requeue delivery.' }
  }
}

/* ------------------------------------------------------------------ */
/* Channel status (for admin panel)                                    */
/* ------------------------------------------------------------------ */

export async function getChannelStatus() {
  return channelStatus()
}

/* ------------------------------------------------------------------ */
/* Recap templates (Stream B) — CRUD + manual compile                  */
/* ------------------------------------------------------------------ */

export type TemplateInput = {
  name: string
  nameFr?: string | null
  slugBase: string
  section: (typeof VALID_SECTIONS)[number]
  sourceType?: string | null
  locationSlug?: string | null
  tagSlug?: string | null
  windowDays: number
  cadence: 'daily' | 'weekly'
  living: boolean
  isActive?: boolean
}

function validateTemplate(input: TemplateInput): string | null {
  if (!input.name.trim()) return 'A template name is required.'
  if (!/^[a-z0-9][a-z0-9-]{1,60}$/.test(input.slugBase)) return 'Slug base must be lowercase letters, digits and hyphens.'
  if (!VALID_SECTIONS.includes(input.section)) return 'Unknown section.'
  if (!Number.isFinite(input.windowDays) || input.windowDays < 1 || input.windowDays > 90) return 'Window must be between 1 and 90 days.'
  if (input.cadence !== 'daily' && input.cadence !== 'weekly') return 'Unknown cadence.'
  return null
}

function toRow(input: TemplateInput) {
  return {
    name: input.name.trim(),
    name_fr: input.nameFr?.trim() || null,
    slug_base: input.slugBase.trim(),
    section: input.section,
    source_type: input.sourceType || null,
    source_filters: {
      ...(input.locationSlug ? { location_slug: input.locationSlug } : {}),
      ...(input.tagSlug ? { tag_slug: input.tagSlug } : {}),
    },
    window_days: Math.round(input.windowDays),
    cadence: input.cadence,
    living: input.living,
    is_active: input.isActive ?? true,
  }
}

export async function createTemplate(input: TemplateInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const invalid = validateTemplate(input)
    if (invalid) return { ok: false, error: invalid }
    const { supabase, user } = await assertCapability('manageContent')
    const { data, error } = await supabase
      .from('content_templates')
      .insert({ ...toRow(input), created_by: user.id })
      .select('id')
      .single()
    if (error) return { ok: false, error: error.message }
    await auditSlot(supabase, user.id, 'template:create', `slug=${input.slugBase}`)
    revalidateLocalized('/admin/templates')
    revalidateLocalized('/admin/digest')
    return { ok: true, id: data.id }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
  }
}

export async function updateTemplate(id: string, input: TemplateInput): Promise<SlotResult> {
  try {
    const invalid = validateTemplate(input)
    if (invalid) return { ok: false, error: invalid }
    const { supabase, user } = await assertCapability('manageContent')
    const { error, count } = await supabase
      .from('content_templates')
      .update(toRow(input), { count: 'exact' })
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    if (!count) return { ok: false, error: 'Template not found.' }
    await auditSlot(supabase, user.id, 'template:update', `template=${id}`)
    revalidateLocalized('/admin/templates')
    revalidateLocalized('/admin/digest')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
  }
}

export async function deleteTemplate(id: string): Promise<SlotResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const { error, count } = await supabase.from('content_templates').delete({ count: 'exact' }).eq('id', id)
    if (error) return { ok: false, error: error.message }
    if (!count) return { ok: false, error: 'Template not found.' }
    await auditSlot(supabase, user.id, 'template:delete', `template=${id}`)
    revalidateLocalized('/admin/templates')
    revalidateLocalized('/admin/digest')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
  }
}

/** Compile a template now (the daily/weekly crons call the same runner). */
export async function compileTemplateNow(id: string): Promise<SlotResult & { added?: number }> {
  try {
    await assertCapability('manageContent')
    const res = await compileTemplate(id)
    if (!res.ok) return { ok: false, error: res.error ?? 'Compile failed' }
    revalidateLocalized('/admin/templates')
    revalidateLocalized('/admin/content')
    revalidateLocalized('/admin/digest')
    return { ok: true, added: res.added ?? 0 }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
  }
}