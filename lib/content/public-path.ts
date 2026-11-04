/**
 * Where each content type lives on the public site.
 *
 * The permalink field on the content form shows only the *slug*, but the
 * section a slug resolves under is decided by the content type — so an editor
 * who reads "Part of the public URL" off the slug and hand-builds
 * `/news/<slug>` for a photo story gets a 404 with a slug that looks perfectly
 * correct. One mapping, shared by the admin "View live" action, the permalink
 * preview on the form, and the publish-time route revalidation, removes that
 * class of dead end.
 *
 * Client- and server-safe (pure). Mirrors `contentLivePath`
 * (app/[locale]/(app)/admin/content/content-actions.tsx) and `SEGMENT_BY_TYPE`
 * (app/sitemap.ts, app/rss.xml/route.ts) — keep them in step.
 */
export const CONTENT_TYPE_SEGMENT: Record<string, string> = {
  photo_story: '/photo-stories',
  news: '/news',
  // Eye on the Street one-photo format shares the news detail template.
  micro_story: '/news',
  listing: '/buy-sell',
  notice: '/notices',
  culture: '/culture',
}

export type ContentPublicPathInput = {
  type: string
  /** Row id (used by notices, and as a fallback for listings/lookups). */
  id?: string | null
  /** Stored/typed slug (the primary identifier for every slug-addressed type). */
  slug?: string | null
}

/**
 * Public path for a content item, or null when it has no addressable page.
 *
 * Micro stories have no standalone page — they live on the /street rail, which
 * is what the admin "View live" action has always pointed at. Notices resolve
 * by id or slug (lib/queries/notices.ts); listings by slug then id; the rest are
 * slug-addressed.
 */
export function contentPublicPath({ type, id, slug }: ContentPublicPathInput): string | null {
  switch (type) {
    case 'micro_story':
      return '/street'
    case 'photo_story':
      return slug ? `/photo-stories/${slug}` : null
    case 'news':
      return slug ? `/news/${slug}` : null
    case 'listing':
      return slug || id ? `/buy-sell/${slug ?? id}` : null
    case 'notice':
      return id || slug ? `/notices/${id ?? slug}` : null
    case 'culture':
      return slug ? `/culture/${slug}` : null
    default:
      return null
  }
}
