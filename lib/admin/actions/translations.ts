'use server'

/**
 * Translation management (plan Phase 5.5, spec §55–§57).
 *
 * Content language is a first-class CMS concern: `translation_jobs` tracks
 * the per-locale pipeline (pending → in_progress → completed/failed) with an
 * explicit translator and reviewer, while `translation_memory` accumulates
 * source→target segments so repeat copy translates consistently.
 *
 * `autoTranslateJob` runs the existing DeepL integration
 * (`lib/translate/deepl.ts`) server-side and writes the result through the
 * same `upsertTranslations` path the edit drawer uses; `completeTranslationJob`
 * is the human-review door (spec §55: translator → reviewer → published
 * translation). UI translation strings stay separate (`lib/i18n/*`).
 */

import { createHash } from 'node:crypto'
import { assertCapability } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { translateTexts } from '@/lib/translate/deepl'
import { localizeContent } from '@/lib/translate/localize'
import { llmReady, llmLocalizeFields } from '@/lib/translate/prompts'
import { lookupSegment } from '@/lib/translate/tm'
import {
  auditEvent,
  fail,
  revalidateLocalized,
  upsertTranslations,
  type ActionResult,
} from './_shared'

export type TranslationStatus = 'pending' | 'in_progress' | 'completed' | 'failed'
export type TranslationLocale = 'en' | 'fr'

const STATUSES: TranslationStatus[] = ['pending', 'in_progress', 'completed', 'failed']

export type TranslationJob = {
  id: string
  contentItemId: string
  contentTitle: string | null
  sourceLocale: TranslationLocale
  targetLocale: TranslationLocale
  status: TranslationStatus
  translatorId: string | null
  translatorName: string | null
  reviewerId: string | null
  reviewerName: string | null
  errorMessage: string | null
  createdAt: string | null
  completedAt: string | null
}

function asName(value: unknown): string | null {
  const row = (Array.isArray(value) ? value[0] : value) as {
    display_name: string | null
    full_name: string | null
  } | null | undefined
  return row?.display_name ?? row?.full_name ?? null
}

function asLocale(value: unknown, fallback: TranslationLocale): TranslationLocale {
  return value === 'en' || value === 'fr' ? value : fallback
}

function toJob(row: Record<string, unknown>): TranslationJob {
  const content = row.content as { translations?: { locale: string; title: string }[] } | null
  const list = Array.isArray(content?.translations) ? content.translations : []
  return {
    id: row.id as string,
    contentItemId: row.content_item_id as string,
    contentTitle: list.find((t) => t.locale === 'en')?.title ?? list[0]?.title ?? null,
    sourceLocale: asLocale(row.source_locale, 'en'),
    targetLocale: asLocale(row.target_locale, 'fr'),
    status: STATUSES.includes(row.status as TranslationStatus) ? (row.status as TranslationStatus) : 'pending',
    translatorId: (row.translator_id as string | null) ?? null,
    translatorName: asName(row.translator),
    reviewerId: (row.reviewer_id as string | null) ?? null,
    reviewerName: asName(row.reviewer),
    errorMessage: (row.error_message as string | null) ?? null,
    createdAt: (row.created_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null,
  }
}

const JOB_COLUMNS = `id, content_item_id, source_locale, target_locale, status,
  translator_id, reviewer_id, error_message, created_at, completed_at,
  translator:profiles!translation_jobs_translator_id_fkey(display_name, full_name),
  reviewer:profiles!translation_jobs_reviewer_id_fkey(display_name, full_name),
  content:content_items(translations:content_translations(locale, title))`

export async function getTranslationJobs(status?: TranslationStatus): Promise<TranslationJob[]> {
  try {
    await assertCapability('manageContent')
  } catch {
    return []
  }
  const admin = createAdminClient()
  let query = admin.from('translation_jobs').select(JOB_COLUMNS).order('created_at', { ascending: false }).limit(100)
  if (status && STATUSES.includes(status)) query = query.eq('status', status)
  const { data } = await query
  return ((data ?? []) as unknown as Record<string, unknown>[]).map(toJob)
}

/**
 * Coverage report (spec §55 "translation status"): for the most recent
 * content items, which locales have a stored translation.
 */
export async function getTranslationCoverage(limit = 50): Promise<
  { contentItemId: string; title: string | null; locales: TranslationLocale[]; missing: TranslationLocale[] }[]
> {
  try {
    await assertCapability('manageContent')
  } catch {
    return []
  }
  const admin = createAdminClient()
  const { data } = await admin
    .from('content_items')
    .select('id, translations:content_translations(locale, title)')
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100))
  return ((data ?? []) as unknown as { id: string; translations: { locale: string; title: string }[] | null }[]).map(
    (row) => {
      const locales = (Array.isArray(row.translations) ? row.translations : [])
        .map((t) => t.locale)
        .filter((l): l is TranslationLocale => l === 'en' || l === 'fr')
      const missing: TranslationLocale[] = (['en', 'fr'] as const).filter((l) => !locales.includes(l))
      const en = (Array.isArray(row.translations) ? row.translations : []).find((t) => t.locale === 'en')
      return { contentItemId: row.id, title: en?.title ?? null, locales, missing }
    },
  )
}

export async function createTranslationJob(
  contentItemId: string,
  targetLocale: TranslationLocale,
  sourceLocale: TranslationLocale = targetLocale === 'en' ? 'fr' : 'en',
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  try {
    const ctx = await assertCapability('manageContent')
    if (targetLocale === sourceLocale) return { ok: false, error: 'Source and target locales must differ.' }
    const admin = createAdminClient()
    const { data: item } = await admin.from('content_items').select('id').eq('id', contentItemId).maybeSingle()
    if (!item) return { ok: false, error: 'Content item not found.' }
    const { data, error } = await admin
      .from('translation_jobs')
      .insert({
        content_item_id: contentItemId,
        target_locale: targetLocale,
        source_locale: sourceLocale,
        status: 'pending',
        translator_id: ctx.user.id,
      })
      .select('id')
      .single()
    if (error || !data) return { ok: false, error: error?.message ?? 'Could not create the job.' }
    await auditEvent(ctx.user.id, {
      action: 'translation.job_created',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'translation_job',
      resourceId: (data as { id: string }).id,
      metadata: { contentItemId, sourceLocale, targetLocale },
    })
    revalidateLocalized('/admin/translations')
    return { ok: true, id: (data as { id: string }).id }
  } catch (e) {
    return fail(e)
  }
}

/** Bulk-create `pending` jobs for content missing the target locale. */
export async function createMissingTranslationJobs(
  targetLocale: TranslationLocale,
  limit = 20,
): Promise<{ ok: true; created: number } | { ok: false; error: string }> {
  try {
    const ctx = await assertCapability('manageContent')
    const coverage = await getTranslationCoverage(100)
    const candidates = coverage.filter((c) => c.missing.includes(targetLocale)).slice(0, Math.min(Math.max(limit, 1), 50))
    if (candidates.length === 0) return { ok: true, created: 0 }
    const admin = createAdminClient()
    const sourceLocale = targetLocale === 'en' ? 'fr' : 'en'
    const { error } = await admin.from('translation_jobs').insert(
      candidates.map((c) => ({
        content_item_id: c.contentItemId,
        target_locale: targetLocale,
        source_locale: sourceLocale,
        status: 'pending',
        translator_id: ctx.user.id,
      })),
    )
    if (error) return { ok: false, error: error.message }
    await auditEvent(ctx.user.id, {
      action: 'translation.jobs_bulk_created',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'translation_job',
      metadata: { targetLocale, created: candidates.length },
    })
    revalidateLocalized('/admin/translations')
    return { ok: true, created: candidates.length }
  } catch (e) {
    return fail(e)
  }
}

function rememberSegment(sourceLocale: string, targetLocale: string, source: string, target: string): void {
  if (!source.trim() || !target.trim()) return
  const admin = createAdminClient()
  const hash = createHash('sha256').update(`${sourceLocale}:${targetLocale}:${source.trim()}`).digest('hex')
  void admin.from('translation_memory').upsert(
    {
      source_text_hash: hash,
      source_locale: sourceLocale,
      target_locale: targetLocale,
      source_text: source.trim().slice(0, 8000),
      target_text: target.trim().slice(0, 8000),
    },
    { onConflict: 'source_text_hash' },
  )
}

/**
 * Machine-translate the job's source translation into the target locale via
 * the localization pipeline (translation memory → editorial LLM → DeepL,
 * with the language guard), store it as the published translation and
 * complete the job. The acting admin is recorded as translator; a reviewer
 * should still confirm via `assignReviewer` for sensitive copy (spec §55).
 */
export async function autoTranslateJob(jobId: string): Promise<{ ok: true; warnings: string[] } | { ok: false; error: string }> {
  try {
    const ctx = await assertCapability('manageContent')
    const admin = createAdminClient()
    const { data: job } = await admin.from('translation_jobs').select('*').eq('id', jobId).maybeSingle()
    if (!job) return { ok: false, error: 'Translation job not found.' }
    const row = job as unknown as {
      id: string
      content_item_id: string
      source_locale: string
      target_locale: string
      status: string
    }
    if (row.status === 'completed') return { ok: false, error: 'Job is already completed.' }

    await admin.from('translation_jobs').update({ status: 'in_progress', error_message: null }).eq('id', jobId)

    const { data: source } = await admin
      .from('content_translations')
      .select('title, excerpt, body, seo_description')
      .eq('content_item_id', row.content_item_id)
      .eq('locale', row.source_locale)
      .maybeSingle()
    const src = source as unknown as { title: string | null; excerpt: string | null; body: string | null; seo_description: string | null } | null
    if (!src || (!src.title?.trim() && !src.body?.trim())) {
      await admin.from('translation_jobs').update({ status: 'failed', error_message: 'No source text to translate.' }).eq('id', jobId)
      return { ok: false, error: 'The source translation is empty — nothing to translate.' }
    }

    const from = row.source_locale === 'en' || row.source_locale === 'fr' ? row.source_locale : 'en'
    const to = row.target_locale === 'en' || row.target_locale === 'fr' ? row.target_locale : from === 'en' ? 'fr' : 'en'
    let translated: { title: string; excerpt: string; body: string; seo: string }
    let warnings: string[] = []
    try {
      const result = await localizeContent(
        {
          title: src.title ?? '',
          excerpt: src.excerpt ?? '',
          body: src.body ?? '',
          seoDescription: src.seo_description ?? '',
        },
        from,
        to,
        {
          deepl: translateTexts,
          llmAvailable: llmReady(),
          llmLocalize: llmLocalizeFields,
          tmLookup: lookupSegment,
        },
      )
      const filled = (['title', 'excerpt', 'body', 'seoDescription'] as const).filter((f) =>
        (f === 'seoDescription' ? src.seo_description : f === 'title' ? src.title : f === 'excerpt' ? src.excerpt : src.body)?.trim(),
      )
      if (filled.length > 0 && filled.every((f) => result.engines[f] === 'source')) {
        const error = result.warnings.join(' ') || 'Translation produced no usable output.'
        await admin.from('translation_jobs').update({ status: 'failed', error_message: error }).eq('id', jobId)
        return { ok: false, error }
      }
      translated = {
        title: result.fields.title,
        excerpt: result.fields.excerpt,
        body: result.fields.body,
        seo: result.fields.seoDescription,
      }
      warnings = result.warnings
    } catch (e) {
      await admin
        .from('translation_jobs')
        .update({ status: 'failed', error_message: e instanceof Error ? e.message : 'Translation failed.' })
        .eq('id', jobId)
      return fail(e)
    }

    await upsertTranslations(admin, row.content_item_id, [
      {
        locale: to,
        title: translated.title || src.title || '',
        excerpt: translated.excerpt,
        body: translated.body,
        seoDescription: translated.seo || undefined,
      },
    ])
    if (translated.title) rememberSegment(from, to, src.title ?? '', translated.title)
    if (translated.body) rememberSegment(from, to, src.body ?? '', translated.body)

    await admin
      .from('translation_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString(), translator_id: ctx.user.id })
      .eq('id', jobId)
    await auditEvent(ctx.user.id, {
      action: 'translation.job_auto_completed',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'translation_job',
      resourceId: jobId,
      metadata: { contentItemId: row.content_item_id, targetLocale: row.target_locale, warnings },
    })
    revalidateLocalized('/admin/translations')
    revalidateLocalized('/admin/content')
    return { ok: true, warnings }
  } catch (e) {
    return fail(e)
  }
}

/** Human-review door: save the reviewed text and complete the job. */
export async function completeTranslationJob(
  jobId: string,
  input: { title: string; excerpt?: string; body?: string },
): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('manageContent')
    const title = input.title.trim().slice(0, 300)
    if (!title && !(input.body ?? '').trim()) return { ok: false, error: 'Translated title or body is required.' }
    const admin = createAdminClient()
    const { data: job } = await admin
      .from('translation_jobs')
      .select('id, content_item_id, target_locale, status')
      .eq('id', jobId)
      .maybeSingle()
    if (!job) return { ok: false, error: 'Translation job not found.' }
    const row = job as unknown as { content_item_id: string; target_locale: string }
    await upsertTranslations(admin, row.content_item_id, [
      {
        locale: row.target_locale as 'en' | 'fr',
        title: title || 'Untitled',
        excerpt: input.excerpt,
        body: input.body,
      },
    ])
    await admin
      .from('translation_jobs')
      .update({ status: 'completed', completed_at: new Date().toISOString(), reviewer_id: ctx.user.id })
      .eq('id', jobId)
    await auditEvent(ctx.user.id, {
      action: 'translation.job_completed',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'translation_job',
      resourceId: jobId,
      metadata: { contentItemId: row.content_item_id },
    })
    revalidateLocalized('/admin/translations')
    revalidateLocalized('/admin/content')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function assignReviewer(jobId: string, reviewerId: string): Promise<ActionResult> {
  try {
    const ctx = await assertCapability('manageContent')
    if (!reviewerId) return { ok: false, error: 'A reviewer is required.' }
    const admin = createAdminClient()
    const { error } = await admin.from('translation_jobs').update({ reviewer_id: reviewerId }).eq('id', jobId)
    if (error) return { ok: false, error: error.message }
    await auditEvent(ctx.user.id, {
      action: 'translation.reviewer_assigned',
      actorRole: ctx.roles.join(',') || null,
      resourceType: 'translation_job',
      resourceId: jobId,
      metadata: { reviewerId },
    })
    revalidateLocalized('/admin/translations')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
