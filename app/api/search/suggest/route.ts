import { NextResponse } from 'next/server'
import { getSearchResults } from '@/lib/queries/search'
import { isLocale, type Locale } from '@/lib/i18n'

export const dynamic = 'force-dynamic'

/**
 * Search suggestions for the autocomplete dropdown: top matching published
 * titles for the query prefix. Unauthenticated, cheap (8 rows max, 2+
 * chars), locale-aware — the client links straight to each result.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const q = (url.searchParams.get('q') ?? '').trim().slice(0, 80)
  const rawLocale = url.searchParams.get('locale') ?? 'en'
  const locale: Locale = isLocale(rawLocale) ? rawLocale : 'en'
  if (q.length < 2) return NextResponse.json({ items: [] })
  try {
    const results = await getSearchResults({ q, locale, limit: 8 })
    const items = [
      ...results.photoStories,
      ...results.news,
      ...results.notices,
      ...results.listings,
      ...results.culture,
    ].slice(0, 8).map((r) => ({ id: r.id, type: r.type, title: r.title, href: r.href }))
    return NextResponse.json({ items })
  } catch {
    return NextResponse.json({ items: [] })
  }
}
