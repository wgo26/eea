import { getDictionary, resolveLocale } from '@/lib/i18n'
import { getListingDetail } from '@/lib/queries/buy-sell'
import { articleOgImage, OG_WIDTH, OG_HEIGHT } from '@/lib/seo/og-image'

export const alt = 'Buy & sell listing'
export const size = { width: OG_WIDTH, height: OG_HEIGHT }
export const contentType = 'image/png'

/**
 * Dynamic share card for listings: section + category kicker, the listing
 * title, and the first photo as a side panel when the listing has one.
 */
export default async function Image({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params
  const locale = resolveLocale(raw)
  const dict = getDictionary(locale)
  const listing = await getListingDetail(id, locale)
  return articleOgImage({
    sectionLabel: dict.nav.buySell,
    title: listing?.title ?? dict.nav.buySell,
    category: listing?.category ?? null,
    imageUrl: listing?.imageUrl ?? null,
  })
}
