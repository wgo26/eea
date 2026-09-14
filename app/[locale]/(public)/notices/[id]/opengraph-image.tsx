import { getDictionary, resolveLocale } from '@/lib/i18n'
import { getNoticeById } from '@/lib/queries/notices'
import { articleOgImage, OG_WIDTH, OG_HEIGHT } from '@/lib/seo/og-image'

export const alt = 'Community notice'
export const size = { width: OG_WIDTH, height: OG_HEIGHT }
export const contentType = 'image/png'

/**
 * Dynamic share card for notices: section + notice-type kicker, the notice
 * title, and the cover as a side panel when the notice carries one.
 */
export default async function Image({ params }: { params: Promise<{ locale: string; id: string }> }) {
  const { locale: raw, id } = await params
  const locale = resolveLocale(raw)
  const dict = getDictionary(locale)
  const notice = await getNoticeById(id, locale)
  return articleOgImage({
    sectionLabel: dict.nav.notices,
    title: notice?.title ?? dict.nav.notices,
    category: notice?.category ?? notice?.noticeType ?? null,
    imageUrl: notice?.imageUrl ?? null,
  })
}
