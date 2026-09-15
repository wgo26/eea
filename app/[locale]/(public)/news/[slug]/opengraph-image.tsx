import { getDictionary, resolveLocale } from '@/lib/i18n'
import { getNewsBySlug } from '@/lib/queries/news'
import { previewImageUrl } from '@/lib/media/attachments'
import { articleOgImage, OG_WIDTH, OG_HEIGHT } from '@/lib/seo/og-image'

export const alt = 'Community news story'
export const size = { width: OG_WIDTH, height: OG_HEIGHT }
export const contentType = 'image/png'

/**
 * Dynamic share card for news articles: section + category kicker, the
 * article title, and the cover as a side panel. Next serves this route
 * automatically as the page's og:image / twitter:image, replacing the
 * generic static default for articles.
 */
export default async function Image({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale: raw, slug } = await params
  const locale = resolveLocale(raw)
  const dict = getDictionary(locale)
  const article = await getNewsBySlug(slug, locale)
  return articleOgImage({
    sectionLabel: dict.nav.news,
    title: article?.title ?? dict.nav.news,
    category: article?.category ?? null,
    imageUrl: previewImageUrl(article?.imageUrl, article?.attachments),
  })
}
