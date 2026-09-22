export type ContentDraftInput = {
  slugBase: string
  /** Explicit permalink (slugified server-side, collision-suffixed). Undefined = keep the stored slug. */
  slug?: string
  /** Publish date override (ISO). Only applied when a non-empty value is sent. */
  publishedAt?: string | null
  /** Expiry date override (ISO). Undefined = keep stored; null/empty = clear. */
  expiresAt?: string | null
  verification?: 'verified' | 'community_submission' | 'official_source' | 'developing' | null
  locationId?: string | null
  categoryId?: string | null
  /** Profile author (uuid). Undefined = keep stored; null = clear the profile author (falls back to byline). */
  authorId?: string | null
  photographerCredit?: string | null
  translations: {
    locale: 'en' | 'fr'
    title: string
    excerpt?: string
    body?: string
    /** SEO/meta description — written only when provided (undefined = keep stored). */
    seoDescription?: string | null
    /** Human byline for when no profile author is linked (imported posts). */
    byline?: string | null
    /**
     * Phase 4 — Pidgin/Camfranglais WhatsApp share line (≤280 chars,
     * undefined = keep stored). Written to content_translations.share_text.
     */
    shareText?: string | null
    /** Voice register for the share line (undefined = keep stored). */
    voiceType?: 'formal' | 'pidgin' | 'camfranglais' | null
  }[]
  tags?: string[]
  photos?: { url: string; alt?: string; caption?: string; credit?: string; assetId?: string; kind?: string; mimeType?: string; durationSeconds?: number | null }[]
  keepPhotoIds?: string[]
  /** Supporting video/audio/document links (Phase B) — stored as media_assets with kind. */
  attachments?: { url: string; kind?: 'video' | 'audio' | 'document' | 'image'; caption?: string; assetId?: string }[]
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

type ValidationLocale = 'en' | 'fr'

const STRINGS: Record<ValidationLocale, Record<string, string>> = {
  en: {
    enTitle: 'An English title is required.',
    frTitle: 'A French title is required before publishing.',
    photoLink: 'Photo links must start with http:// or https://.',
    mediaLink: 'Media links must start with http:// or https://.',
    verification: 'Unknown verification value.',
    author: 'Unknown author — please pick an author from the search results.',
    publishDate: 'The publish date is invalid.',
    expiryDate: 'The expiry date is invalid.',
    tags: 'Use at most 12 tags.',
    ticketLink: 'Event ticket link must start with http:// or https://.',
    eventStart: 'Event start date is invalid.',
    eventEnd: 'Event end date is invalid.',
    eventOrder: 'Event end must be after start.',
  },
  fr: {
    enTitle: 'Un titre anglais est requis.',
    frTitle: 'Un titre français est requis avant publication.',
    photoLink: 'Les liens photo doivent commencer par http:// ou https://.',
    mediaLink: 'Les liens média doivent commencer par http:// ou https://.',
    verification: 'Valeur de vérification inconnue.',
    author: 'Auteur inconnu — choisissez un auteur dans les résultats.',
    publishDate: 'La date de publication est invalide.',
    expiryDate: 'La date d’expiration est invalide.',
    tags: '12 étiquettes maximum.',
    ticketLink: 'Le lien de billetterie doit commencer par http:// ou https://.',
    eventStart: 'La date de début est invalide.',
    eventEnd: 'La date de fin est invalide.',
    eventOrder: 'La fin doit être après le début.',
  },
}

export function validateContentDraft(input: ContentDraftInput, requireBilingual: boolean, locale: ValidationLocale = 'en'): string | null {
  const t = STRINGS[locale] ?? STRINGS.en
  const en = input.translations.find((t) => t.locale === 'en')
  const fr = input.translations.find((t) => t.locale === 'fr')
  if (!en?.title?.trim()) return t.enTitle
  if (requireBilingual && !fr?.title?.trim()) return t.frTitle
  for (const photo of input.photos ?? []) {
    if (!/^https?:\/\//i.test(photo.url.trim())) return `${t.photoLink} (${photo.url})`
  }
  for (const att of input.attachments ?? []) {
    if (!/^https?:\/\//i.test(att.url.trim())) return `${t.mediaLink} (${att.url})`
  }
  if (input.verification && !VERIFICATION_VALUES.includes(input.verification)) return t.verification
  if (input.authorId !== undefined && input.authorId !== null && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(input.authorId)) {
    return t.author
  }
  if (input.publishedAt !== undefined && input.publishedAt && Number.isNaN(Date.parse(input.publishedAt))) {
    return t.publishDate
  }
  if (input.expiresAt !== undefined && input.expiresAt && Number.isNaN(Date.parse(input.expiresAt))) {
    return t.expiryDate
  }
  if (input.tags && input.tags.length > 12) return t.tags
  if (input.event) {
    if (input.event.ticketUrl && !/^https?:\/\//i.test(input.event.ticketUrl.trim())) return t.ticketLink
    if (input.event.startsAt && Number.isNaN(Date.parse(input.event.startsAt))) return t.eventStart
    if (input.event.endsAt && Number.isNaN(Date.parse(input.event.endsAt))) return t.eventEnd
    if (input.event.endsAt && input.event.startsAt && new Date(input.event.endsAt) < new Date(input.event.startsAt)) return t.eventOrder
  }
  return null
}
