'use server'

import { revalidatePath } from 'next/cache'
import { getSessionUser } from '@/lib/auth/guards'
import type { Locale } from '@/lib/i18n'

export type SaveToggleResult = { ok: true; saved: boolean } | { ok: false; error: string }

function fail(error: string): SaveToggleResult {
  return { ok: false, error }
}

/**
 * Reader saves (bookmarks + listing favorites) on the existing
 * `saved_content` table (owner-only RLS). One row per (user, content item);
 * the same primitive backs article bookmarks (#13) and listing hearts (#19)
 * — the UI variant differs, the storage does not.
 */
export async function toggleSaved(contentItemId: string): Promise<SaveToggleResult> {
  const { supabase, user } = await getSessionUser()
  if (!user) return fail('Not authenticated.')
  const { data: existing } = await supabase
    .from('saved_content')
    .select('content_item_id')
    .eq('user_id', user.id)
    .eq('content_item_id', contentItemId)
    .limit(1)
  const isSaved = (existing?.length ?? 0) > 0
  const { error } = isSaved
    ? await supabase.from('saved_content').delete().eq('user_id', user.id).eq('content_item_id', contentItemId)
    : await supabase.from('saved_content').insert({ user_id: user.id, content_item_id: contentItemId })
  if (error) return fail(error.message)
  return { ok: true, saved: !isSaved }
}

/** Batch saved-state lookup for cards/lists (one round trip). Guests get {}. */
export async function getSavedStates(contentItemIds: string[]): Promise<Record<string, boolean>> {
  if (contentItemIds.length === 0) return {}
  const { supabase, user } = await getSessionUser()
  if (!user) return {}
  const { data } = await supabase
    .from('saved_content')
    .select('content_item_id')
    .eq('user_id', user.id)
    .in('content_item_id', contentItemIds)
  const states: Record<string, boolean> = {}
  for (const row of (data ?? []) as { content_item_id: string }[]) {
    states[row.content_item_id] = true
  }
  return states
}

export type SavedItem = {
  contentItemId: string
  type: string
  slug: string | null
  title: string
  imageUrl: string | null
  savedAt: string
}

export async function removeSaved(contentItemId: string): Promise<SaveToggleResult> {
  const { supabase, user } = await getSessionUser()
  if (!user) return fail('Not authenticated.')
  const { error } = await supabase
    .from('saved_content')
    .delete()
    .eq('user_id', user.id)
    .eq('content_item_id', contentItemId)
  if (error) return fail(error.message)
  revalidatePath('/account/saved', 'page')
  return { ok: true, saved: false }
}

/**
 * The user's reading list (account/saved): newest first, locale title with
 * fallback, cover thumbnail. Unauthenticated callers get [].
 */
export async function getSavedItems(locale: Locale = 'en'): Promise<SavedItem[]> {
  const { supabase, user } = await getSessionUser()
  if (!user) return []
  const { data } = await supabase
    .from('saved_content')
    .select(
      `content_item_id, created_at,
       content:content_items(id, type, slug,
         translations:content_translations(locale, title),
         cover:media_assets(public_url))`,
    )
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100)
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) => {
    const content = row.content as {
      id: string
      type: string
      slug: string | null
      translations: { locale: string; title: string | null }[] | { locale: string; title: string | null } | null
      cover: { public_url: string }[] | { public_url: string } | null
    } | null
    const translations = Array.isArray(content?.translations)
      ? content.translations
      : content?.translations
        ? [content.translations]
        : []
    const title =
      translations.find((t) => t.locale === locale)?.title ??
      translations[0]?.title ??
      content?.slug ??
      'Untitled'
    const cover = Array.isArray(content?.cover) ? content.cover[0] : content?.cover
    return {
      contentItemId: row.content_item_id as string,
      type: (content?.type ?? 'news') as string,
      slug: content?.slug ?? null,
      title,
      imageUrl: cover?.public_url ?? null,
      savedAt: row.created_at as string,
    }
  })
}
