'use server'

import { assertStaff, assertCapability } from '@/lib/admin/auth'
import { type ActionResult, audit, fail, revalidateLocalized, revalidatePublicContentCache } from './_shared'

/* ------------------------------------------------------------------ */
/* Homepage curation                                                  */
/* ------------------------------------------------------------------ */

export async function assignHomepageSlot(slotId: string, contentItemId: string | null): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertStaff()
    const { error } = await supabase.from('homepage_slots').update({ content_item_id: contentItemId }).eq('id', slotId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'slot:assign',
      notes: `slot=${slotId} content=${contentItemId ?? 'none'}`,
    })
    revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    revalidateLocalized('/admin/dashboard')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function toggleSlotActive(slotId: string, isActive: boolean): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertStaff()
    const { error } = await supabase.from('homepage_slots').update({ is_active: isActive }).eq('id', slotId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'slot:status',
      toStatus: isActive ? 'active' : 'inactive',
      notes: `slot=${slotId}`,
    })
    revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}

export async function createHomepageSlot(input: { slotKey: string; sortOrder?: number; startsAt?: string | null; endsAt?: string | null; contentItemId?: string | null }): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const slotKey = input.slotKey.trim()
    if (!slotKey) return { ok: false, error: 'A slot key is required.' }
    if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) return { ok: false, error: 'Slot end must be after its start.' }
    const { error } = await supabase.from('homepage_slots').insert({ slot_key: slotKey, content_item_id: input.contentItemId ?? null, sort_order: input.sortOrder ?? 0, starts_at: input.startsAt || null, ends_at: input.endsAt || null, created_by: user.id })
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, { action: 'slot:create', entityType: 'homepage_slot', notes: slotKey })
    revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    revalidateLocalized('/')
    return { ok: true }
  } catch (e) { return fail(e) }
}

/** Delete a homepage slot (staff). Content keeps its own status — only the slot goes away. */
export async function deleteHomepageSlot(slotId: string): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const { data: row } = await supabase.from('homepage_slots').select('id, slot_key').eq('id', slotId).limit(1)
    const found = (row ?? [])[0] as { id: string; slot_key: string } | undefined
    if (!found) return { ok: false, error: 'Slot not found.' }

    const { error } = await supabase.from('homepage_slots').delete().eq('id', slotId)
    if (error) return { ok: false, error: error.message }

    await audit(supabase, user.id, { action: 'slot:delete', entityType: 'homepage_slot', notes: found.slot_key })
    revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    revalidateLocalized('/')
    return { ok: true }
  } catch (e) { return fail(e) }
}

/** Swap a homepage slot's sort_order with its up/down neighbour. */
export async function reorderHomepageSlot(slotId: string, direction: 'up' | 'down'): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    const { data: rows } = await supabase
      .from('homepage_slots')
      .select('id, sort_order')
      .order('sort_order', { ascending: true })
    const ordered = (rows ?? []) as { id: string; sort_order: number }[]
    const idx = ordered.findIndex((r) => r.id === slotId)
    if (idx === -1) return { ok: false, error: 'Slot not found.' }
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= ordered.length) return { ok: false, error: 'Already at the edge.' }

    const a = ordered[idx]
    const b = ordered[swapIdx]
    await supabase.from('homepage_slots').update({ sort_order: b.sort_order }).eq('id', a.id)
    await supabase.from('homepage_slots').update({ sort_order: a.sort_order }).eq('id', b.id)

    await audit(supabase, user.id, { action: 'slot:reorder', entityType: 'homepage_slot', notes: `${a.id} ${direction}` })
    revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    revalidateLocalized('/')
    return { ok: true }
  } catch (e) { return fail(e) }
}
/** Update a homepage slot's optional display window (staff). Null = no bound on that side. */
export async function updateHomepageSlotWindow(
  slotId: string,
  input: { startsAt?: string | null; endsAt?: string | null },
): Promise<ActionResult> {
  try {
    const { supabase, user } = await assertCapability('manageContent')
    if (input.startsAt && Number.isNaN(Date.parse(input.startsAt))) return { ok: false, error: 'The start date is invalid.' }
    if (input.endsAt && Number.isNaN(Date.parse(input.endsAt))) return { ok: false, error: 'The end date is invalid.' }
    if (input.startsAt && input.endsAt && new Date(input.endsAt) <= new Date(input.startsAt)) {
      return { ok: false, error: 'Slot end must be after its start.' }
    }
    const { error } = await supabase
      .from('homepage_slots')
      .update({ starts_at: input.startsAt || null, ends_at: input.endsAt || null })
      .eq('id', slotId)
    if (error) return { ok: false, error: error.message }
    await audit(supabase, user.id, {
      action: 'slot:window',
      entityType: 'homepage_slot',
      notes: `slot=${slotId} starts=${input.startsAt ?? 'none'} ends=${input.endsAt ?? 'none'}`,
    })
    revalidatePublicContentCache()
    revalidateLocalized('/admin/content')
    revalidateLocalized('/')
    return { ok: true }
  } catch (e) {
    return fail(e)
  }
}
