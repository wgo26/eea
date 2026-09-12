import type { SupabaseClient } from '@supabase/supabase-js'

import { slugify } from './blogger'

/**
 * Shared tag helpers (Blogger import paths + the content edit drawer).
 * Plain async functions, not Server Actions — every caller gates the
 * `manageContent` capability itself before touching these.
 */

/** Find-or-create a tag by label and return its id (null when unusable). */
export async function ensureTag(
  supabase: SupabaseClient,
  label: string,
): Promise<string | null> {
  const slug = slugify(label)
  if (!slug) return null
  const { data: existing } = await supabase.from('tags').select('id').eq('slug', slug).limit(1)
  if (existing?.[0]) return (existing[0] as { id: string }).id
  const { data: created, error } = await supabase.from('tags').insert({ slug }).select('id').single()
  if (error || !created) return null
  const tagId = (created as { id: string }).id
  await supabase.from('tag_translations').upsert(
    { tag_id: tagId, locale: 'en', name: label.slice(0, 120) },
    { onConflict: 'tag_id,locale' },
  )
  return tagId
}

/** Cap on labels synced per item — matches the import path's guard. */
const MAX_TAGS = 12

/**
 * Reconcile an item's content_tags rows with the given labels: creates tags
 * for new labels (ensureTag), inserts missing links, deletes removed ones.
 * Labels that produce no usable slug are ignored.
 */
export async function syncContentTags(
  supabase: SupabaseClient,
  contentItemId: string,
  labels: readonly string[],
): Promise<void> {
  const wanted: string[] = []
  for (const label of [...new Set(labels.map((l) => l.trim()).filter(Boolean))].slice(0, MAX_TAGS)) {
    const tagId = await ensureTag(supabase, label)
    if (tagId) wanted.push(tagId)
  }
  const { data: existing } = await supabase
    .from('content_tags')
    .select('tag_id')
    .eq('content_item_id', contentItemId)
  const existingIds = new Set((existing ?? []).map((r) => (r as { tag_id: string }).tag_id))
  const toRemove = [...existingIds].filter((id) => !wanted.includes(id))
  if (toRemove.length > 0) {
    const { error } = await supabase
      .from('content_tags')
      .delete()
      .eq('content_item_id', contentItemId)
      .in('tag_id', toRemove)
    if (error) throw new Error(`Could not update tags: ${error.message}`)
  }
  for (const tagId of wanted) {
    if (existingIds.has(tagId)) continue
    const { error } = await supabase
      .from('content_tags')
      .upsert(
        { content_item_id: contentItemId, tag_id: tagId },
        { onConflict: 'content_item_id,tag_id' },
      )
    if (error) throw new Error(`Could not update tags: ${error.message}`)
  }
}