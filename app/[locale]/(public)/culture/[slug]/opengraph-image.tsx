import { getDictionary, resolveLocale } from '@/lib/i18n'
import { getCultureBySlug } from '@/lib/queries/culture'
import { previewImageUrl } from '@/lib/media/attachments'
import { articleOgImage, OG_WIDTH, OG_HEIGHT } from '@/lib/seo/og-image'

export const alt = 'Eagle Eye Africa'
export const size = { width: OG_WIDTH, height: OG_HEIGHT }
export const contentType = 'image/png'

/**
 * Dynamic share card for culture stories: section + category kicker, the
 * story title, and the cover as a side panel.
 */
export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: raw, slug } = await params
  const locale = resolveLocale(raw)
  const dict = getDictionary(locale)
  const article = await getCultureBySlug(slug, locale)
  return articleOgImage({
    sectionLabel: dict.nav.culture,
    title: article?.title ?? dict.nav.culture,
    category: article?.category ?? null,
    imageUrl: previewImageUrl(article?.imageUrl, article?.attachments),
  })
}
