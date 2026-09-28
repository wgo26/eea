'use server'

import { assertAnyCapability, assertCapability } from '@/lib/admin/auth'
import { type Capability } from '@/lib/auth/capabilities'
import { getAppFlag } from '@/lib/automation/flags'
import { createAdminClient } from '@/lib/supabase/admin'
import { getLlmStatus, logLlmCall } from '@/lib/translate/llm'
import {
  llmDraftHeadlines,
  llmDraftExcerptSeo,
  llmSuggestEntities,
  llmClassify,
  llmModerationTriage,
  llmVerificationSuggest,
  llmDigestIntro,
  llmDraftShareLine,
} from '@/lib/translate/prompts'
import { chatVision } from '@/lib/translate/llm'
import { type ActionResult, fail } from './_shared'

/**
 * Intelligence-layer server actions (Tier 1).
 *
 * Auto-apply policy (approved): AI writes into the FORM for review, never
 * straight to published rows — except the explicitly allow-listed
 * fire-and-forget fields below, which may auto-fill empty form inputs:
 *   tags, alt text, credit, slug, excerpt/SEO drafts, share line.
 * Category / location / verification / publish status ALWAYS require a
 * human tap (confidence-gated suggestion + rationale shown).
 *
 * Every action: capability-gated → kill-switch checked → budget checked →
 * LLM called → usage logged best-effort. Offline when unconfigured.
 */

export type AiStatus = {
  enabled: boolean
  configured: boolean
  model: string
  providerHost: string
  /** Where the key came from: vault (Admin → Secrets), env, or none. */
  keySource: 'vault' | 'env' | 'none'
  tokensUsedToday: number
  budgetTokensDay: number
  flags: Record<string, boolean>
}

const AI_FLAGS = ['ai.content_draft', 'ai.translate', 'ai.digest_intro', 'ai.moderation_triage', 'ai.media_qa'] as const

async function aiFlag(key: string, fallback = true): Promise<boolean> {
  return getAppFlag<boolean>(key, fallback)
}

async function tokensUsedToday(): Promise<number> {
  try {
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          gte: (col: string, v: string) => { limit: (n: number) => Promise<{ data: { tokens_in: number | null; tokens_out: number | null }[] | null }> }
        }
      }
    }
    const since = new Date()
    since.setUTCHours(0, 0, 0, 0)
    const { data } = await db
      .from('llm_calls')
      .select('tokens_in, tokens_out')
      .gte('created_at', since.toISOString())
      .limit(2000)
    return ((data ?? []) as { tokens_in: number | null; tokens_out: number | null }[]).reduce(
      (n, r) => n + (r.tokens_in ?? 0) + (r.tokens_out ?? 0),
      0,
    )
  } catch {
    return 0
  }
}

/**
 * The desks allowed to ask what the intelligence layer can do: the content
 * desk and the moderation desk. A reviewer drafting a submission into a post is
 * doing the same work as an editor drafting a post, so the *status* probe must
 * admit both. Asserting `manageContent` alone made an admin whose grants were
 * `moderate`-only throw here, and because every caller swallows the rejection
 * and renders the offline state, the screen then told them "AI off — configure
 * LLM_API_KEY" while the model was configured and running.
 */
const AI_STATUS_CAPABILITIES: Capability[] = ['manageContent', 'moderate']

/**
 * The desks allowed to draft *into a form*: content and moderation. A reviewer
 * turning a submission into a post is doing the same drafting work as an editor
 * writing one, and the approve path needs the same help — arguably more of it,
 * since a citizen's raw payload is the messiest input in the system.
 *
 * This is deliberately narrower than getAiStatus: it does NOT admit roles that
 * only read analytics or manage the archive. Drafting is the action, so the
 * capability named here is the one that performs it.
 */
async function assertDraftingCapability(): Promise<void> {
  await assertAnyCapability(AI_STATUS_CAPABILITIES)
}

export async function getAiStatus(): Promise<AiStatus> {
  await assertAnyCapability(AI_STATUS_CAPABILITIES)
  const { getLlmRuntime, providerHostOf } = await import('@/lib/ai/settings')
  const rt = await getLlmRuntime()
  const flags: Record<string, boolean> = {}
  for (const f of AI_FLAGS) flags[f] = await aiFlag(f, true)
  const used = await tokensUsedToday()
  const allOn = Object.values(flags).some(Boolean)
  return {
    enabled: rt.enabled && allOn,
    configured: Boolean(rt.apiKey),
    model: rt.model,
    providerHost: providerHostOf(rt.baseUrl),
    keySource: rt.source,
    tokensUsedToday: used,
    budgetTokensDay: rt.budgetTokensDay,
    flags,
  }
}

/** Runtime model name for usage logging (vault-aware, env fallback). */
async function runtimeModel(): Promise<string> {
  try {
    return ((await import('@/lib/ai/settings')).getLlmRuntime().then((r) => r.model))
  } catch {
    return getLlmStatus().model
  }
}

async function guard(flag: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const { getLlmRuntime } = await import('@/lib/ai/settings')
  const rt = await getLlmRuntime()
  if (!rt.apiKey)
    return { ok: false, error: 'Generation is not configured (Admin → Secrets → AI provider, or LLM_API_KEY). Using offline smart fill.' }
  if (rt.disabled) return { ok: false, error: 'AI drafting is paused (Admin → Secrets → AI provider).' }
  if (!(await aiFlag(flag, true))) return { ok: false, error: `AI capability ${flag} is switched off.` }
  const used = await tokensUsedToday()
  if (used >= rt.budgetTokensDay) return { ok: false, error: 'Daily AI budget reached — offline smart fill only until midnight UTC.' }
  return { ok: true }
}

export type AiDraftAllResult =
  | {
      ok: true
      patch: Record<string, string>
      provenance: Record<string, 'llm' | 'offline'>
      notes: string[]
    }
  | { ok: false; error: string }

/**
 * One AI pass over the empty derived fields. Respects the form's `touched`
 * contract via `skip` (fields the editor claimed). Category/location/
 * verification are returned as suggestions with rationale — the caller
 * decides whether to apply (confidence >= 0.6 auto-applies per policy,
 * below that the UI shows "AI unsure").
 */
export async function aiDraftRemaining(input: {
  enTitle: string
  frTitle: string
  enBody: string
  frBody: string
  skip?: string[]
  categories?: { id: string; name: string }[]
  locations?: { id: string; name: string }[]
  knownTags?: string[]
  voice?: string
}): Promise<AiDraftAllResult> {
  try {
    await assertDraftingCapability()
    const g = await guard('ai.content_draft')
    if (!g.ok) return g
    const t0 = Date.now()
    const skip = new Set(input.skip ?? [])
    const patch: Record<string, string> = {}
    const provenance: Record<string, 'llm' | 'offline'> = {}
    const notes: string[] = []
    const title = (input.enTitle || input.frTitle).trim()
    const body = (input.enBody || input.frBody).trim()
    if (!title && !body) return { ok: false, error: 'Enter a title or body first.' }

    const run = async <T>(action: string, fn: () => Promise<T>): Promise<T | null> => {
      const s = Date.now()
      try {
        const out = await fn()
        await logLlmCall({ action, model: await runtimeModel(), latencyMs: Date.now() - s, status: 'ok' })
        return out
      } catch (e) {
        await logLlmCall({ action, model: await runtimeModel(), latencyMs: Date.now() - s, status: 'error' })
        notes.push(`${action} fell back to offline: ${e instanceof Error ? e.message.slice(0, 120) : 'error'}`)
        return null
      }
    }

    if (!skip.has('enExcerpt') || !skip.has('enSeo')) {
      const r = await run('ai.excerpt_seo_en', () => llmDraftExcerptSeo({ title, body, locale: 'en' }))
      if (r) {
        if (!skip.has('enExcerpt') && r.excerpt) {
          patch.enExcerpt = r.excerpt.slice(0, 2000)
          provenance.enExcerpt = 'llm'
        }
        if (!skip.has('enSeo') && r.seoDescription) {
          patch.enSeo = r.seoDescription.slice(0, 300)
          provenance.enSeo = 'llm'
        }
      }
    }
    // Bilingual parity: French fields draft from FRENCH source only (never
    // launder EN). Mirrors the Tier 0 hasFrSource guard in auto-fill.ts.
    const hasFrSource = Boolean((input.frTitle || input.frBody || '').trim())
    if (hasFrSource && (!skip.has('frExcerpt') || !skip.has('frSeo'))) {
      const frTitle = input.frTitle.trim() || title
      const frBody = input.frBody.trim() || body
      const r = await run('ai.excerpt_seo_fr', () => llmDraftExcerptSeo({ title: frTitle, body: frBody, locale: 'fr' }))
      if (r) {
        if (!skip.has('frExcerpt') && r.excerpt) {
          patch.frExcerpt = r.excerpt.slice(0, 2000)
          provenance.frExcerpt = 'llm'
        }
        if (!skip.has('frSeo') && r.seoDescription) {
          patch.frSeo = r.seoDescription.slice(0, 300)
          provenance.frSeo = 'llm'
        }
      }
    }
    if (!skip.has('tags')) {
      const r = await run('ai.entities', () =>
        llmSuggestEntities({ title, body, knownTags: input.knownTags ?? [] }),
      )
      if (r && r.tags.length > 0) {
        patch.tags = r.tags.join(', ')
        provenance.tags = 'llm'
        if (r.entities.places.length > 0) notes.push(`Places seen: ${r.entities.places.slice(0, 4).join(', ')}`)
      }
    }
    if ((!skip.has('categoryId') || !skip.has('locationId')) && (input.categories?.length || input.locations?.length)) {
      const r = await run('ai.classify', () =>
        llmClassify({ title, body, categories: input.categories ?? [], locations: input.locations ?? [] }),
      )
      if (r) {
        // Auto-apply policy: only high-confidence classification writes
        // itself in; low confidence stays a suggestion in `notes`.
        if (!skip.has('categoryId') && r.categoryId && r.confidence >= 0.6) {
          patch.categoryId = r.categoryId
          provenance.categoryId = 'llm'
        } else if (r.categoryId) {
          notes.push(`Category suggestion (${Math.round(r.confidence * 100)}%): ${r.rationale.slice(0, 200)}`)
        }
        if (!skip.has('locationId') && r.locationId && r.confidence >= 0.6) {
          patch.locationId = r.locationId
          provenance.locationId = 'llm'
        } else if (r.locationId) {
          notes.push(`Location suggestion (${Math.round(r.confidence * 100)}%): ${r.rationale.slice(0, 200)}`)
        }
        if (!r.categoryId && !r.locationId) notes.push(r.rationale.slice(0, 220) || 'AI abstained on category/location.')
      }
    }
    if (!skip.has('shareText')) {
      const r = await run('ai.share', () =>
        llmDraftShareLine({ title, excerpt: input.enBody.slice(0, 1500), voice: (input.voice as 'formal' | 'pidgin' | 'camfranglais') ?? 'formal', locale: 'en' }),
      )
      if (r) {
        patch.shareText = r.slice(0, 280)
        provenance.shareText = 'llm'
      }
    }
    await logLlmCall({ action: 'ai.draft_all', model: await runtimeModel(), latencyMs: Date.now() - t0, status: 'ok' })
    if (Object.keys(patch).length === 0) return { ok: false, error: notes.join(' ') || 'AI produced nothing usable — offline fill still applies.' }
    return { ok: true, patch, provenance, notes }
  } catch (e) {
    return fail(e) as { ok: false; error: string }
  }
}

/**
 * Standalone tag/entity suggest for the single-field Tags button upgrade.
 * Merges with existing tags (dedup, lowercase) — caller decides apply.
 */
export async function aiTagsSuggest(input: { title: string; body: string; knownTags?: string[]; existing?: string[] }): Promise<
  ActionResult & { tags?: string[]; places?: string[] }
> {
  try {
    await assertDraftingCapability()
    const g = await guard('ai.content_draft')
    if (!g.ok) return g
    const out = await llmSuggestEntities({ title: input.title, body: input.body, knownTags: input.knownTags ?? [] })
    await logLlmCall({ action: 'ai.tags', model: await runtimeModel(), status: 'ok' })
    const have = new Set((input.existing ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean))
    const fresh = out.tags.map((t) => t.trim()).filter((t) => t && !have.has(t.toLowerCase())).slice(0, 8)
    return { ok: true, tags: fresh, places: out.entities.places.slice(0, 4) } as ActionResult & { tags?: string[]; places?: string[] }
  } catch (e) {
    return fail(e)
  }
}

/**
 * Standalone classifier for the Category/Location button upgrades.
 * Returns full rationale + alternatives; auto-apply threshold (0.6) is
 * enforced by the CALLER so the UI can show "AI unsure" with reasons.
 */
export async function aiClassifySuggest(input: {
  title: string
  body: string
  categories: { id: string; name: string }[]
  locations: { id: string; name: string }[]
}) {
  try {
    await assertDraftingCapability()
    const g = await guard('ai.content_draft')
    if (!g.ok) return { ok: false as const, error: g.error }
    const out = await llmClassify(input)
    await logLlmCall({ action: 'ai.classify', model: await runtimeModel(), status: 'ok' })
    return { ok: true as const, ...out }
  } catch (e) {
    return fail(e) as { ok: false; error: string }
  }
}

export async function aiHeadlines(input: { topic: string; body: string; locale: 'en' | 'fr' }): Promise<ActionResult & { headlines?: string[] }> {
  try {
    await assertDraftingCapability()
    const g = await guard('ai.content_draft')
    if (!g.ok) return g
    const headlines = await llmDraftHeadlines(input)
    await logLlmCall({ action: 'ai.headlines', model: await runtimeModel(), status: 'ok' })
    return { ok: true, headlines } as ActionResult & { headlines?: string[] }
  } catch (e) {
    return fail(e)
  }
}

export async function aiVerification(input: { title: string; body: string }) {
  try {
    await assertDraftingCapability()
    const g = await guard('ai.content_draft')
    if (!g.ok) return { ok: false as const, error: g.error }
    const out = await llmVerificationSuggest(input)
    await logLlmCall({ action: 'ai.verification', model: await runtimeModel(), status: 'ok' })
    return { ok: true as const, ...out }
  } catch (e) {
    return fail(e) as { ok: false; error: string }
  }
}

export async function aiImageAlt(input: { imageUrl: string; title: string }): Promise<ActionResult & { alt?: string }> {
  try {
    // P6: the media desk (media.manage, no manageContent) describes the
    // archive it owns, and the moderation desk drafts alt text into the
    // approve form — any of the three may call, the flag/budget gate is shared.
    try {
      await assertAnyCapability(AI_STATUS_CAPABILITIES)
    } catch {
      await assertCapability('media.manage')
    }
    const g = await guard('ai.media_qa')
    if (!g.ok) return g
    const alt = await chatVision(
      `Write alt text (max 125 chars) for this photo in the context of the story titled: ${input.title.slice(0, 200)}. Concrete, no "image of" preamble.`,
      input.imageUrl,
      { maxTokens: 200 },
    )
    await logLlmCall({ action: 'ai.image_alt', model: await runtimeModel(), status: 'ok' })
    return { ok: true, alt: alt.slice(0, 200) } as ActionResult & { alt?: string }
  } catch (e) {
    return fail(e)
  }
}

/**
 * P4 — moderation triage (opt-in). Advisory scores for the human reviewer;
 * NEVER auto-acts. Flag ai.moderation_triage defaults false (migration
 * 20261114000000) — the panel offers the run button regardless and reports
 * the flag state honestly when off.
 */
export async function aiModerationTriage(input: { text: string; hasPhotos?: boolean }) {
  try {
    await assertCapability('moderate')
    const g = await guard('ai.moderation_triage')
    if (!g.ok) return { ok: false as const, error: g.error }
    const text = (input.text ?? '').trim()
    if (!text) return { ok: false as const, error: 'Nothing to triage yet.' }
    const out = await llmModerationTriage({ text, hasPhotos: input.hasPhotos ?? false })
    await logLlmCall({ action: 'ai.triage', model: await runtimeModel(), status: 'ok' })
    const clamp = (n: number) => Math.max(0, Math.min(1, Math.round(n * 100) / 100))
    return {
      ok: true as const,
      spam: clamp(out.spam),
      scam: clamp(out.scam),
      toxicity: clamp(out.toxicity),
      pii: out.pii,
      overall: clamp(out.overall),
      flags: out.flags.map((f) => String(f).slice(0, 40)).filter(Boolean).slice(0, 6),
      suggestedAction: out.suggestedAction,
      rationale: out.rationale.slice(0, 400),
    }
  } catch (e) {
    return fail(e) as { ok: false; error: string }
  }
}

/**
 * P5 — embed up to `limit` published items missing an embedding.
 * Nightly-cron shaped (idempotent, bounded, best-effort per row).
 */
export async function aiEmbedMissing(limit = 50): Promise<{ embedded: number; skipped: number }> {
  await assertCapability('manageContent')
  const out = { embedded: 0, skipped: 0 }
  try {
    const { embedConfiguredAsync, embeddingText, storeEmbedding } = await import('@/lib/ai/embeddings')
    if (!(await embedConfiguredAsync())) return out
    const db = createAdminClient() as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          eq: (a: string, b: unknown) => {
            is: (a: string, b: null) => {
              order: (a: string, o: Record<string, unknown>) => {
                limit: (n: number) => Promise<{ data: unknown[] | null }>
              }
            }
          }
        }
      }
    }
    const { data } = await db
      .from('content_items')
      .select('id, translations:content_translations(locale, title, excerpt, body)')
      // NOTE: typed client lacks the new embedding columns until types:db
      // regenerates — the is() chain below is intentionally loose.
      .eq('status', 'published')
      .is('embedding', null)
      .order('published_at', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100))
    const rows = ((data ?? []) as unknown as {
      id: string
      translations: { locale: string; title: string | null; excerpt: string | null; body: string | null }[] | null
    }[])
    for (const row of rows) {
      const txs = row.translations ?? []
      const en = txs.find((t) => t.locale === 'en' && t.title) ?? txs.find((t) => t.title)
      if (!en?.title) {
        out.skipped += 1
        continue
      }
      const ok = await storeEmbedding(row.id, embeddingText({ title: en.title, excerpt: en.excerpt ?? '', body: en.body ?? '' })).catch(
        () => false,
      )
      if (ok) out.embedded += 1
      else out.skipped += 1
    }
    await logLlmCall({ action: 'ai.embed_backfill', model: await runtimeModel(), status: 'ok' })
  } catch {
    /* best-effort */
  }
  return out
}

/**
 * P5 — submission/content dedupe: semantic neighbours for pasted text.
 * Returns published neighbours with similarity + path for the reviewer.
 */
export async function aiFindDuplicates(input: { text: string; excludeId?: string; threshold?: number }): Promise<
  { ok: true; hits: { id: string; title: string; path: string; similarity: number }[] } | { ok: false; error: string }
> {
  try {
    await assertCapability('moderate')
    // Kill-switch parity: aiModerationTriage, which this runs alongside on the
    // review screen, is gated by ai.moderation_triage. A duplicate check that
    // ignored the flag made the switch a lie — turning triage "off" left half
    // of the triage result still being computed and rendered.
    const g = await guard('ai.moderation_triage')
    if (!g.ok) return g
    const text = (input.text ?? '').trim().slice(0, 4000)
    if (text.length < 40) return { ok: true, hits: [] }
    const { embedConfiguredAsync, embedText, findSimilar } = await import('@/lib/ai/embeddings')
    if (!(await embedConfiguredAsync()))
      return { ok: false, error: 'Semantic dedupe needs a key (Admin → Secrets → AI provider, or LLM_API_KEY).' }
    const vec = await embedText(text)
    const hits = await findSimilar(vec, { threshold: input.threshold ?? 0.78, count: 5 })
    if (hits.length === 0) return { ok: true, hits: [] }
    const db = createAdminClient()
    const { data } = await db
      .from('content_items')
      .select('id, type, slug, translations:content_translations(locale, title)')
      .in(
        'id',
        hits.map((h) => h.id),
      )
      .limit(5)
    const rows = ((data ?? []) as unknown as {
      id: string
      type: string | null
      slug: string | null
      translations: { locale: string; title: string | null }[] | null
    }[])
    const SEG: Record<string, string> = { photo_story: 'photo-stories', notice: 'notices', listing: 'buy-sell', culture: 'culture', news: 'news', micro_story: 'news' }
    const byId = new Map(hits.map((h) => [h.id, h.similarity]))
    return {
      ok: true,
      hits: rows
        .filter((r) => r.id !== input.excludeId)
        .map((r) => ({
          id: r.id,
          title: (r.translations?.find((t) => t.locale === 'en' && t.title)?.title ?? r.translations?.[0]?.title ?? r.type ?? 'Story').slice(0, 120),
          path: `/${SEG[r.type ?? 'news'] ?? 'news'}/${r.slug ?? r.id}`,
          similarity: Math.round((byId.get(r.id) ?? 0) * 100) / 100,
        }))
        .sort((a, b) => b.similarity - a.similarity),
    }
  } catch (e) {
    return fail(e) as { ok: false; error: string }
  }
}

/** P5 — repurpose engine: one story → every surface. */
export async function aiRepurpose(input: { title: string; excerpt?: string; body?: string; locale: 'en' | 'fr' }) {
  try {
    await assertDraftingCapability()
    const g = await guard('ai.content_draft')
    if (!g.ok) return { ok: false as const, error: g.error }
    const { llmRepurpose } = await import('@/lib/translate/prompts')
    const out = await llmRepurpose({
      title: input.title,
      excerpt: input.excerpt ?? '',
      body: input.body ?? '',
      locale: input.locale,
    })
    await logLlmCall({ action: 'ai.repurpose', model: await runtimeModel(), status: 'ok' })
    const clip = (s: string, n: number) => s.trim().slice(0, n)
    return {
      ok: true as const,
      whatsapp: clip(out.whatsapp, 280),
      social: clip(out.social, 240),
      micro: clip(out.micro, 600),
      pidgin: clip(out.pidgin, 280),
      emailSubject: clip(out.emailSubject, 70),
    }
  } catch (e) {
    return fail(e) as { ok: false; error: string }
  }
}

/**
 * P6-final — trust & safety note drafters. Review-before-save: the text
 * lands in the resolution input, never straight to the register.
 */
export async function aiCorrectionNote(input: { correctionText: string; contentTitle: string; locale: 'en' | 'fr' }) {
  try {
    await assertCapability('moderate')
    const g = await guard('ai.content_draft')
    if (!g.ok) return { ok: false as const, error: g.error }
    if (!input.correctionText.trim()) return { ok: false as const, error: 'The report text is empty.' }
    const { llmDraftCorrectionNote } = await import('@/lib/translate/prompts')
    const out = await llmDraftCorrectionNote(input)
    await logLlmCall({ action: 'ai.correction_note', model: await runtimeModel(), status: 'ok' })
    return { ok: true as const, note: out.note.trim().slice(0, 500) }
  } catch (e) {
    return fail(e) as { ok: false; error: string }
  }
}

export async function aiReportResponse(input: {
  reportType: string
  subject: string
  description: string
  contentTitle: string
  locale: 'en' | 'fr'
}) {
  try {
    await assertCapability('moderate')
    const g = await guard('ai.content_draft')
    if (!g.ok) return { ok: false as const, error: g.error }
    const { llmDraftReportResponse } = await import('@/lib/translate/prompts')
    const out = await llmDraftReportResponse(input)
    await logLlmCall({ action: 'ai.report_response', model: await runtimeModel(), status: 'ok' })
    return { ok: true as const, note: out.note.trim().slice(0, 500) }
  } catch (e) {
    return fail(e) as { ok: false; error: string }
  }
}

/**
 * Draft the message a reviewer sends to a contributor (rejection reason or
 * clarification question) from the reviewer's points. Review-before-send: the
 * text lands in the decision textarea, never sent directly — the submitter
 * gets whatever prose the reviewer typed, so tone matters.
 */
export async function aiModerationResponse(input: {
  decision: 'reject' | 'clarify'
  submissionType: string
  submissionText: string
  points: string
  locale: 'en' | 'fr'
}) {
  try {
    await assertCapability('moderate')
    const g = await guard('ai.content_draft')
    if (!g.ok) return { ok: false as const, error: g.error }
    if (!input.submissionText.trim() && !input.points.trim()) {
      return { ok: false as const, error: 'Nothing to draft from yet.' }
    }
    const { llmDraftModerationResponse } = await import('@/lib/translate/prompts')
    const out = await llmDraftModerationResponse(input)
    await logLlmCall({ action: 'ai.moderation_response', model: await runtimeModel(), status: 'ok' })
    return { ok: true as const, note: out.note.trim().slice(0, 500) }
  } catch (e) {
    return fail(e) as { ok: false; error: string }
  }
}

/** P5 — morning brief prose (offline bullets when the model is off). */
export async function aiMorningBrief(locale: 'en' | 'fr'): Promise<{ ok: true; bullets: string[]; ai: boolean } | { ok: false; error: string }> {
  try {
    await assertCapability('manageContent')
    const { getMorningStats, offlineBullets } = await import('@/lib/ai/briefing')
    const stats = await getMorningStats()
    const g = await guard('ai.content_draft')
    if (!g.ok) return { ok: true, bullets: offlineBullets(stats), ai: false }
    try {
      const { llmMorningBrief } = await import('@/lib/translate/prompts')
      const out = await llmMorningBrief({ locale, stats: stats as unknown as Record<string, number | string> })
      await logLlmCall({ action: 'ai.morning_brief', model: await runtimeModel(), status: 'ok' })
      const bullets = out.bullets.map((b) => b.trim()).filter(Boolean).slice(0, 5)
      if (bullets.length === 0) return { ok: true, bullets: offlineBullets(stats), ai: false }
      return { ok: true, bullets, ai: true }
    } catch {
      return { ok: true, bullets: offlineBullets(stats), ai: false }
    }
  } catch (e) {
    return fail(e) as { ok: false; error: string }
  }
}

/** P5 — weekly retro narrator for /admin/insights. */
export async function aiWeeklyRetro(locale: 'en' | 'fr', input: { stats: Record<string, number | string>; topTitles: string[] }) {
  try {
    await assertCapability('manageContent')
    const g = await guard('ai.content_draft')
    if (!g.ok) return { ok: false as const, error: g.error }
    const { llmWeeklyRetro } = await import('@/lib/translate/prompts')
    const out = await llmWeeklyRetro({ locale, stats: input.stats, topTitles: input.topTitles })
    await logLlmCall({ action: 'ai.weekly_retro', model: await runtimeModel(), status: 'ok' })
    return { ok: true as const, grew: out.grew.slice(0, 400), flopped: out.flopped.slice(0, 400), bets: out.bets.map((b) => b.slice(0, 200)).slice(0, 3) }
  } catch (e) {
    return fail(e) as { ok: false; error: string }
  }
}

export async function aiDigestIntro(input: { locale: 'en' | 'fr'; dateLabel: string; headlines: string[] }) {
  try {
    await assertCapability('manageContent')
    const g = await guard('ai.digest_intro')
    if (!g.ok) return { ok: false as const, error: g.error }
    const out = await llmDigestIntro(input)
    await logLlmCall({ action: 'ai.digest_intro', model: await runtimeModel(), status: 'ok' })
    return { ok: true as const, ...out }
  } catch (e) {
    return fail(e) as { ok: false; error: string }
  }
}
