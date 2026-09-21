'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { assertCapability } from '@/lib/admin/auth'
import { CACHE_TAGS } from '@/lib/cache/tags'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Phase 4 — Eagle Eye Timeline editor actions (Differentiator #6).
 *
 * Editors append timestamped updates to a developing story; each mutation
 * revalidates the `news` cache tag so the article's live timeline refreshes
 * without waiting for the ISR window. Authorization is capability-scoped
 * (`manageContent`); the RLS policy on timeline_entries is the data-layer
 * backstop. Writes go through the service-role client (same as the rest of
 * lib/admin/actions.ts) after the capability check.
 */

type ActionResult = { ok: true; id?: string } | { ok: false; error: string }

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : 'Operation failed' }
}

const LOCALES = ['en', 'fr'] as const

function revalidateTimeline() {
  revalidateTag(CACHE_TAGS.news, 'max')
  for (const locale of LOCALES) revalidatePath(`/${locale}/news`)
}

function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

export async function createTimelineEntryAction(input: {
  contentItemId: string
  title: string
  body: string
  locale?: string
  timestamp?: string
  isPublished?: boolean
}): Promise<ActionResult> {
  try {
    await assertCapability('manageContent')
    const title = cleanText(input.title, 200)
    const body = cleanText(input.body, 2000)
    if (!title) return { ok: false, error: 'A title is required.' }
    if (!body) return { ok: false, error: 'Body text is required.' }
    if (!input.contentItemId) return { ok: false, error: 'A story is required.' }
    const locale = input.locale === 'fr' ? 'fr' : 'en'
    const timestamp = input.timestamp?.trim() || new Date().toISOString()
    if (Number.isNaN(Date.parse(timestamp))) return { ok: false, error: 'Invalid timestamp.' }

    const { data, error } = await createAdminClient()
      .from('timeline_entries')
      .insert({
        content_item_id: input.contentItemId,
        title,
        body,
        locale,
        timestamp,
        is_published: input.isPublished ?? true,
      })
      .select('id')
      .single()
    if (error) return { ok: false, error: error.message }
    revalidateTimeline()
    return { ok: true, id: (data as { id: string } | null)?.id }
  } catch (e) {
    return fail(e)
  }
}

export async function updateTimelineEntryAction(
  id: string,
  input: { title?: string; body?: string; timestamp?: string; isPublished?: boolean },
): Promise<ActionResult> {
  try {
    await assertCapability('manageContent')
    if (!id) return { ok: false, error: 'An entry is required.' }
    const patch: { title?: string; body?: string; timestamp?: string; is_published?: boolean } = {}
    if (input.title !== undefined) {
      const title = cleanText(input.title, 200)
      if (!title) return { ok: false, error: 'A title is required.' }
      patch.title = title
    }
    if (input.body !== undefined) {
      const body = cleanText(input.body, 2000)
      if (!body) return { ok: false, error: 'Body text is required.' }
      patch.body = body
    }
    if (input.timestamp !== undefined) {
      if (Number.isNaN(Date.parse(input.timestamp))) return { ok: false, error: 'Invalid timestamp.' }
      patch.timestamp = input.timestamp
    }
    if (input.isPublished !== undefined) patch.is_published = input.isPublished
    if (Object.keys(patch).length === 0) return { ok: true, id }

    const { error } = await createAdminClient()
      .from('timeline_entries')
      .update(patch)
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidateTimeline()
    return { ok: true, id }
  } catch (e) {
    return fail(e)
  }
}

export async function deleteTimelineEntryAction(id: string): Promise<ActionResult> {
  try {
    await assertCapability('manageContent')
    if (!id) return { ok: false, error: 'An entry is required.' }
    const { error } = await createAdminClient()
      .from('timeline_entries')
      .delete()
      .eq('id', id)
    if (error) return { ok: false, error: error.message }
    revalidateTimeline()
    return { ok: true, id }
  } catch (e) {
    return fail(e)
  }
}
