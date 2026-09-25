'use server'

import { assertCapability, type AdminContext } from '@/lib/admin/auth'
import { audit, revalidateLocalized } from './_shared'
import { compileTemplate } from '@/lib/content/templates-run'

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
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
  }
}

export async function deleteTemplate(id: string): Promise<SlotResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    // Living drafts survive the recipe: template_id cascades to null.
    const { error, count } = await supabase.from('content_templates').delete({ count: 'exact' }).eq('id', id)
    if (error) return { ok: false, error: error.message }
    if (!count) return { ok: false, error: 'Template not found.' }
    await auditSlot(supabase, user.id, 'template:delete', `template=${id}`)
    revalidateLocalized('/admin/templates')
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
    return { ok: true, added: res.added ?? 0 }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
  }
}
