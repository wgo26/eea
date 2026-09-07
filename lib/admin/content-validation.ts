export type ContentDraftInput = {
  slugBase: string
  verification?: 'verified' | 'community_submission' | 'official_source' | 'developing' | null
  locationId?: string | null
  categoryId?: string | null
  photographerCredit?: string | null
  translations: { locale: 'en' | 'fr'; title: string; excerpt?: string; body?: string }[]
  photos?: { url: string; caption?: string; credit?: string }[]
  keepPhotoIds?: string[]
  listing?: {
    price?: number | null
    currency?: string
    contactPhone?: string | null
    contactEmail?: string | null
    whatsappNumber?: string | null
    sellerName?: string | null
  }
  notice?: {
    noticeType: string
    organizationName?: string | null
    contactPhone?: string | null
    isOfficial?: boolean
    noticeDate?: string | null
    expiryDate?: string | null
  }
  event?: {
    startsAt?: string | null
    endsAt?: string | null
    venueName?: string | null
    ticketUrl?: string | null
    organizerName?: string | null
    organizerPhone?: string | null
    organizerEmail?: string | null
  }
}

const VERIFICATION_VALUES = ['verified', 'community_submission', 'official_source', 'developing'] as const

export function validateContentDraft(input: ContentDraftInput, requireBilingual: boolean): string | null {
  const en = input.translations.find((t) => t.locale === 'en')
  const fr = input.translations.find((t) => t.locale === 'fr')
  if (!en?.title?.trim()) return 'An English title is required.'
  if (requireBilingual && !fr?.title?.trim()) return 'A French title is required before publishing.'
  for (const photo of input.photos ?? []) {
    if (!/^https?:\/\//i.test(photo.url.trim())) return `Photo links must start with http:// or https:// (${photo.url}).`
  }
  if (input.verification && !VERIFICATION_VALUES.includes(input.verification)) return 'Unknown verification value.'
  if (input.event) {
    if (input.event.ticketUrl && !/^https?:\/\//i.test(input.event.ticketUrl.trim())) return 'Event ticket link must start with http:// or https://.'
    if (input.event.startsAt && Number.isNaN(Date.parse(input.event.startsAt))) return 'Event start date is invalid.'
    if (input.event.endsAt && Number.isNaN(Date.parse(input.event.endsAt))) return 'Event end date is invalid.'
    if (input.event.endsAt && input.event.startsAt && new Date(input.event.endsAt) < new Date(input.event.startsAt)) return 'Event end must be after start.'
  }
  return null
}
