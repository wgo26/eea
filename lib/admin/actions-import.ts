'use server'

import { revalidatePath } from 'next/cache'
import { assertCapability } from '@/lib/admin/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  extractImageUrls,
  makeExcerpt,
  slugify,
  type BloggerPost,
} from '@/lib/admin/blogger'

const LOCALES = ['en', 'fr'] as const

function revalidateLocalized(path: string) {
  for (const locale of LOCALES) revalidatePath(`/${locale}${path}`)
}

export type BloggerImportItem = Pick<
  BloggerPost,
  'title' | 'bodyHtml' | 'publishedAt' | 'labels' | 'originalUrl'
>

export type BloggerImportResult = {
  imported: { title: string; slug: string }[]
  failed: { title: string; error: string }[]
}

const IMPORT_TYPES = ['news', 'photo_story', 'culture', 'notice'] as const
export type BloggerImportType = (typeof IMPORT_TYPES)[number]

async function uniqueSlug(
  supabase: ReturnType<typeof createAdminClient>,
  base: string,
): Promise<string> {
  const root = slugify(base) || 'blogspot-import'
  for (let i = 1; i <= 50; i++) {
    const candidate = i === 1 ? root : `${root}-${i}`
    const { data } = await supabase.from('content_items').select('id').eq('slug', candidate).limit(1)
    if (!data || data.length === 0) return candidate
  }
  return `${root}-${Date.now()}`
}

async function ensureTag(
  supabase: ReturnType<typeof createAdminClient>,
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

/**
 * Import parsed Blogspot posts as content drafts (admin/editor with
 * manageContent). Every post becomes a draft with its English translation,
 * its inline images registered as media rows (hotlinked — no re-upload), and
 * its Blogger labels mapped to tags. Nothing publishes: editors review and
 * publish from /admin/content, adding the French translation there.
 */
export async function importBloggerPosts(
  items: BloggerImportItem[],
  type: BloggerImportType = 'news',
): Promise<BloggerImportResult> {
  const { supabase, user } = await assertCapability('manageContent')
  const admin = createAdminClient()
  const contentType = IMPORT_TYPES.includes(type) ? type : 'news'
  const result: BloggerImportResult = { imported: [], failed: [] }

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('No posts to import.')
  }
  if (items.length > 50) {
    throw new Error('Import at most 50 posts per batch — select fewer and repeat.')
  }

  for (const item of items) {
    const title = item.title?.trim().slice(0, 300) ?? ''
    if (!title) {
      result.failed.push({ title: '(untitled)', error: 'Missing title.' })
      continue
    }
    const bodyHtml = item.bodyHtml?.slice(0, 500_000) ?? ''
    if (!bodyHtml.trim()) {
      result.failed.push({ title, error: 'Empty post body.' })
      continue
    }

    try {
      const slug = await uniqueSlug(admin, title)
      const { data: created, error: createErr } = await admin
        .from('content_items')
        .insert({
          type: contentType,
          slug,
          status: 'draft',
          author_id: user.id,
        })
        .select('id')
        .single()
      if (createErr || !created) throw new Error(createErr?.message ?? 'Could not create the content item.')
      const contentId = (created as { id: string }).id

      try {
        const { error: tErr } = await admin.from('content_translations').upsert(
          {
            content_item_id: contentId,
            locale: 'en',
            title,
            excerpt: makeExcerpt(bodyHtml),
            body: bodyHtml,
          },
          { onConflict: 'content_item_id,locale,voice' },
        )
        if (tErr) throw new Error(`Could not save the translation: ${tErr.message}`)

        const imageUrls = extractImageUrls(bodyHtml, 5)
        if (imageUrls.length > 0) {
          const { error: mErr } = await admin.from('media_assets').insert(
            imageUrls.map((url, index) => ({
              content_item_id: contentId,
              kind: 'image' as const,
              provider: 'r2' as const,
              destination: 'public_photo' as const,
              public_url: url,
              sort_order: index,
              is_cover: index === 0,
            })),
          )
          if (mErr) throw new Error(`Could not save images: ${mErr.message}`)
        }

        const labels = [...new Set((item.labels ?? []).map((l) => l.trim()).filter(Boolean))].slice(0, 10)
        for (const label of labels) {
          const tagId = await ensureTag(admin, label)
          if (!tagId) continue
          await admin.from('content_tags').upsert(
            { content_item_id: contentId, tag_id: tagId },
            { onConflict: 'content_item_id,tag_id' },
          )
        }

        await supabase.from('moderation_log').insert({
          action: 'content:import:blogspot',
          content_item_id: contentId,
          actor_id: user.id,
          notes: `${contentType}/${slug} source=${item.originalUrl ?? 'blogspot'} published=${item.publishedAt ?? 'unknown'}`,
        })

        result.imported.push({ title, slug })
      } catch (e) {
        // Roll the half-built item back so a retry doesn't collide on slugs.
        await admin.from('content_items').delete().eq('id', contentId)
        throw e
      }
    } catch (e) {
      result.failed.push({ title, error: e instanceof Error ? e.message : 'Import failed.' })
    }
  }

  if (result.imported.length > 0) {
    revalidateLocalized('/admin/content')
    revalidateLocalized('/admin/dashboard')
  }
  return result
}
