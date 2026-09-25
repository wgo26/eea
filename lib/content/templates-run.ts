import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/observability/logger'
import { SITE } from '@/lib/constants'
import { blocksFromBody, mergeStoryBlocksIntoBody, serializeStoryBlocks } from '@/lib/content/blocks'
import {
  allowedTypesFor,
  buildTemplateBlocks,
  buildTemplateIntro,
  selectTemplateSources,
  DRAFT_TYPE,
  templateDraftTitles,
  type TemplateConfig,
  type TemplateSourceItem,
} from './templates'

/**
 * Recap template runner (Stream B, B2 — the DB half; ./templates.ts is the
 * pure half). Compiles a content_templates row into a DRAFT content item:
 *
 *  - living   — one managed draft per template; each compile appends blocks
 *               for source items not yet in the draft's template_ledger.
 *               Deleted blocks stay deleted (their ids are ledgered), edited
 *               blocks round-trip through parse, and the editor's prose above
 *               the generated region is never touched.
 *  - one-shot — every compile creates a fresh draft (dated suffix).
 *
 * Nothing here publishes: the output always waits in the drafts queue for a
 * human ("suggest, never assert"). Called by the ops-digest (daily cadence)
 * and weekly-digest (weekly cadence) crons, and manually from the admin
 * templates page.
 */

export type CompileResult = {
  ok: boolean
  draftId?: string
  added?: number
  skipped?: 'no-new-items' | 'no-sources'
  error?: string
}

type TemplateRow = {
  id: string
  name: string
  name_fr: string | null
  slug_base: string
  section: string
  source_type: string | null
  source_filters: Record<string, unknown> | null
  window_days: number
  cadence: string
  living: boolean
}

const VALID_SECTIONS = new Set(['news', 'photo', 'notice', 'listing', 'culture'])

function toConfig(row: TemplateRow): TemplateConfig | { error: string } {
  if (!VALID_SECTIONS.has(row.section)) return { error: `Unknown template section ${row.section}` }
  const filters = row.source_filters ?? {}
  return {
    name: row.name,
    nameFr: row.name_fr,
    slugBase: row.slug_base,
    section: row.section as TemplateConfig['section'],
    sourceType: row.source_type,
    filters: {
      locationSlug: typeof filters.location_slug === 'string' ? filters.location_slug : null,
      tagSlug: typeof filters.tag_slug === 'string' ? filters.tag_slug : null,
    },
    windowDays: row.window_days,
    cadence: row.cadence === 'daily' ? 'daily' : 'weekly',
    living: row.living,
  }
}

async function slugifyUnique(base: string): Promise<string> {
  const db = createAdminClient()
  const root = base
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'recap'
  for (let i = 1; i <= 60; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`
    const { data } = await db.from('content_items').select('id').eq('slug', candidate).limit(1)
    if (!data || data.length === 0) return candidate
  }
  return `${root}-${Date.now()}`
}

async function fetchWindowItems(config: TemplateConfig): Promise<TemplateSourceItem[]> {
  const db = createAdminClient()
  const since = new Date(Date.now() - config.windowDays * 86_400_000).toISOString()
  let query = db
    .from('content_items')
    .select(
      `id, type, slug, is_featured, published_at,
       location:locations(slug),
       tags:content_tags(tag:tags(slug)),
       translations:content_translations(locale, title, excerpt),
       media:media_assets(public_url, alt_text, sort_order)`,
    )
    .eq('status', 'published')
    .eq('is_archived', false)
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(200)
  const types = allowedTypesFor(config)
  query = query.in('type', types)
  const { data, error } = await query
  if (error) {
    logger.error('content/templates', 'source query failed', { error: error.message, slugBase: config.slugBase })
    return []
  }
  const rows = (data ?? []) as unknown as {
    id: string
    type: string
    slug: string
    is_featured: boolean
    published_at: string | null
    location: { slug: string } | { slug: string }[] | null
    tags: { tag: { slug: string } | { slug: string }[] | null }[] | null
    translations: { locale: string; title: string | null; excerpt: string | null } | { locale: string; title: string | null; excerpt: string | null }[] | null
    media: { public_url: string | null; alt_text: string | null; sort_order: number } | { public_url: string | null; alt_text: string | null; sort_order: number }[] | null
  }[]
  return rows.map((r) => {
    const txs = Array.isArray(r.translations) ? r.translations : r.translations ? [r.translations] : []
    const media = Array.isArray(r.media) ? r.media : r.media ? [r.media] : []
    const firstImage = media.filter((m) => m.public_url).sort((a, b) => a.sort_order - b.sort_order)[0]
    const loc = Array.isArray(r.location) ? r.location[0] : r.location
    const tagSlugs = (r.tags ?? [])
      .flatMap((t) => (Array.isArray(t.tag) ? t.tag.map((x) => x.slug) : t.tag ? [t.tag.slug] : []))
      .filter(Boolean)
    return {
      id: r.id,
      type: r.type,
      slug: r.slug,
      isFeatured: r.is_featured,
      publishedAt: r.published_at,
      translations: txs.map((t) => ({ locale: t.locale, title: t.title, excerpt: t.excerpt })),
      locationSlug: loc?.slug ?? null,
      tagSlugs,
      imageUrl: firstImage?.public_url ?? null,
      imageAlt: firstImage?.alt_text ?? null,
    }
  })
}

async function ensureTranslations(contentItemId: string, titles: { en: string; fr: string }, bodies: { en: string; fr: string }) {
  const db = createAdminClient()
  for (const locale of ['en', 'fr'] as const) {
    const { data: existing } = await db
      .from('content_translations')
      .select('id')
      .eq('content_item_id', contentItemId)
      .eq('locale', locale)
      .limit(1)
    const row = {
      content_item_id: contentItemId,
      locale,
      voice: 'formal' as const,
      title: titles[locale],
      body: bodies[locale],
    }
    if (existing && existing.length > 0) {
      await db.from('content_translations').update(row).eq('id', existing[0].id)
    } else {
      await db.from('content_translations').insert(row)
    }
  }
}

/** Compile one template. Idempotent per cycle: a living re-run with no new sources is a no-op. */
export async function compileTemplate(templateId: string): Promise<CompileResult> {
  try {
    const db = createAdminClient()
    const { data: row, error } = await db.from('content_templates').select('*').eq('id', templateId).maybeSingle()
    if (error) return { ok: false, error: error.message }
    if (!row) return { ok: false, error: 'Template not found.' }

    const configOrError = toConfig(row as TemplateRow)
    if ('error' in configOrError) return { ok: false, error: configOrError.error }
    const config = configOrError

    const windowItems = selectTemplateSources(config, await fetchWindowItems(config))
    if (windowItems.length === 0) return { ok: true, skipped: 'no-sources', added: 0 }

    const windowLabel =
      config.cadence === 'daily'
        ? new Date().toISOString().slice(0, 10)
        : `week of ${new Date(Date.now() - (config.windowDays - 1) * 86_400_000).toISOString().slice(0, 10)}`

    let draft: { id: string; template_ledger: unknown } | null = null
    if (config.living) {
      const { data } = await db
        .from('content_items')
        .select('id, template_ledger')
        .eq('template_id', templateId)
        .eq('status', 'draft')
        .order('created_at', { ascending: true })
        .limit(1)
      draft = (data ?? [])[0] ?? null
    }

    const titles = templateDraftTitles(config, windowItems)

    if (draft) {
      // Living append-only: only items whose ids are NOT in the ledger.
      const ledger = Array.isArray(draft.template_ledger) ? (draft.template_ledger as unknown[]).map(String) : []
      const fresh = windowItems.filter((item) => !ledger.includes(item.id))
      if (fresh.length === 0) return { ok: true, draftId: draft.id, skipped: 'no-new-items', added: 0 }
      const bodies: Record<'en' | 'fr', string> = { en: '', fr: '' }
      const existingRows = await db
        .from('content_translations')
        .select('locale, body')
        .eq('content_item_id', draft.id)
      for (const t of ((existingRows.data ?? []) as { locale: string; body: string | null }[])) {
        if (t.locale === 'en' || t.locale === 'fr') bodies[t.locale] = t.body ?? ''
      }
      const merged = { en: '', fr: '' } as Record<'en' | 'fr', string>
      for (const locale of ['en', 'fr'] as const) {
        const generatedBlocks = blocksFromBody(bodies[locale])
        const newBlocks = buildTemplateBlocks(config, fresh, locale, SITE.url)
        const bodyBase = bodies[locale] || buildTemplateIntro(config, windowItems.length, locale, windowLabel)
        merged[locale] = mergeStoryBlocksIntoBody(bodyBase, serializeStoryBlocks([...generatedBlocks, ...newBlocks]))
      }
      await ensureTranslations(draft.id, titles, merged)
      await db
        .from('content_items')
        .update({ template_ledger: [...ledger, ...fresh.map((f) => f.id)] })
        .eq('id', draft.id)
      await db.from('content_templates').update({ last_compiled_at: new Date().toISOString(), last_added_count: fresh.length }).eq('id', templateId)
      logger.info('content/templates', 'living recap updated', { templateId, added: fresh.length })
      return { ok: true, draftId: draft.id, added: fresh.length }
    }

    // One-shot (or first living compile): fresh draft item.
    const suffix = config.living ? '' : `-${new Date().toISOString().slice(0, 10)}`
    const slug = await slugifyUnique(`${config.slugBase}${suffix}`)
    const { data: created, error: createErr } = await db
      .from('content_items')
      .insert({
        type: DRAFT_TYPE[config.section],
        slug,
        status: 'draft',
        template_id: templateId,
      })
      .select('id')
      .single()
    if (createErr || !created) return { ok: false, error: createErr?.message ?? 'Could not create the draft.' }

    const bodies: Record<'en' | 'fr', string> = { en: '', fr: '' }
    for (const locale of ['en', 'fr'] as const) {
      bodies[locale] = mergeStoryBlocksIntoBody(
        buildTemplateIntro(config, windowItems.length, locale, windowLabel),
        serializeStoryBlocks(buildTemplateBlocks(config, windowItems, locale, SITE.url)),
      )
    }
    await ensureTranslations(created.id, titles, bodies)
    if (config.living) {
      await db
        .from('content_items')
        .update({ template_ledger: windowItems.map((i) => i.id) })
        .eq('id', created.id)
    }
    await db.from('content_templates').update({ last_compiled_at: new Date().toISOString(), last_added_count: windowItems.length }).eq('id', templateId)
    logger.info('content/templates', 'recap draft created', { templateId, draftId: created.id, items: windowItems.length })

    // B5 — approval-to-suggestion hook (Stream A + B): a new recap draft means
    // editors should review it for the digest. Enqueuing a digest.ready_for_review
    // staff alert so the templates page and the digest page both surface it.
    // Best-effort: a failed courtesy copy never fails the compile.
    try {
      const { enqueueStaff } = await import('@/lib/notify/queue')
      await enqueueStaff(
        'digest.ready_for_review',
        { template: row.name, count: String(windowItems.length) },
        '/admin/templates',
      )
    } catch {
      /* swallow — the compile already succeeded */
    }

    return { ok: true, draftId: created.id, added: windowItems.length }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Compile failed' }
  }
}

/** Compile every active template whose cadence matches. Best-effort per template. */
export async function compileTemplatesForCadence(cadence: 'daily' | 'weekly'): Promise<{ compiled: number; drafted: number; errors: string[] }> {
  const db = createAdminClient()
  const { data, error } = await db.from('content_templates').select('id').eq('is_active', true).eq('cadence', cadence).is('state_id', null)
  if (error || !data) return { compiled: 0, drafted: 0, errors: [error?.message ?? 'template fetch failed'] }
  let compiled = 0
  let drafted = 0
  const errors: string[] = []
  for (const t of data as { id: string }[]) {
    const res = await compileTemplate(t.id)
    if (!res.ok) {
      errors.push(`${t.id}: ${res.error}`)
      continue
    }
    compiled += 1
    if (res.added && res.added > 0) drafted += 1
  }
  return { compiled, drafted, errors }
}

/**
 * Compile templates for a specific state_id and cadence.
 * Used by the state-schedules cron when a state activates/deactivates.
 * Templates with state_id=NULL are global and handled by compileTemplatesForCadence.
 */
export async function compileTemplatesForState(
  stateId: string,
  cadence: 'daily' | 'weekly',
): Promise<{ compiled: number; drafted: number; errors: string[] }> {
  const db = createAdminClient()
  const { data, error } = await db
    .from('content_templates')
    .select('id')
    .eq('is_active', true)
    .eq('cadence', cadence)
    .eq('state_id', stateId)
  if (error || !data) return { compiled: 0, drafted: 0, errors: [error?.message ?? 'template fetch failed'] }
  let compiled = 0
  let drafted = 0
  const errors: string[] = []
  for (const t of data as { id: string }[]) {
    const res = await compileTemplate(t.id)
    if (!res.ok) {
      errors.push(`${t.id}: ${res.error}`)
      continue
    }
    compiled += 1
    if (res.added && res.added > 0) drafted += 1
  }
  return { compiled, drafted, errors }
}
