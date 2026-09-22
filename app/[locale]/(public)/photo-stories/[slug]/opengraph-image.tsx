import { getDictionary, resolveLocale } from '@/lib/i18n'
import { getPhotoStoryBySlug } from '@/lib/queries/photo-stories'
import { previewImageUrl } from '@/lib/media/attachments'
import { articleOgImage, OG_WIDTH, OG_HEIGHT } from '@/lib/seo/og-image'

export const alt = 'Eagle Eye Africa'
export const size = { width: OG_WIDTH, height: OG_HEIGHT }
export const contentType = 'image/png'

/**
 * Dynamic share card for photo stories: section + category kicker, the
 * story title, and the cover as a side panel.
 */
export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: raw, slug } = await params
  const locale = resolveLocale(raw)
  const dict = getDictionary(locale)
  const story = await getPhotoStoryBySlug(slug, locale)
  return articleOgImage({
    sectionLabel: dict.nav.photoStories,
    title: story?.title ?? dict.nav.photoStories,
    category: story?.category ?? null,
    imageUrl: previewImageUrl(story?.imageUrl, story?.attachments),
  })
}
