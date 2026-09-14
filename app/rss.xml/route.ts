import { SITE } from '@/lib/constants'
import { createAdminClient } from '@/lib/supabase/admin'

export const revalidate = 600

/**
 * RSS 2.0 feed of the latest published stories (all sections, English
 * titles). Exempt from the locale redirect like sitemap.xml (asset-like
 * `.xml` path). Best-effort: an unreachable database yields an empty feed,
 * never a 500 — aggregators retry.
 */
const SEGMENT_BY_TYPE: Record<string, string> = {
  news: '/news',
  photo_story: '/photo-stories',
  culture: '/culture',
  listing: '/buy-sell',
  notice: '/notices',
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export async function GET() {
  type Row = {
    type: string
    id: string
    slug: string | null
    published_at: string | null
    translations: { title: string | null; excerpt: string | null }[] | null
  }
  let rows: Row[] = []
  try {
    const supabase = createAdminClient()
    const nowIso = new Date().toISOString()
    const { data, error } = await supabase
      .from('content_items')
      .select('type, id, slug, published_at, translations:content_translations!inner(locale, title, excerpt)')
      .eq('status', 'published')
      .eq('is_archived', false)
      .eq('translations.locale', 'en')
      .lte('published_at', nowIso)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
      .order('published_at', { ascending: false })
      .limit(40)
    if (!error) rows = (data ?? []) as unknown as Row[]
  } catch {
    rows = []
  }

  const items = rows
    .map((row) => {
      const segment = SEGMENT_BY_TYPE[row.type]
      if (!segment) return null
      const t = row.translations?.[0]
      const title = t?.title?.trim() || row.slug || 'Untitled'
      const link = `${SITE.url}/en${segment}/${row.slug ?? row.id}`
      const pubDate = row.published_at ? new Date(row.published_at).toUTCString() : null
      return (
        `    <item>\n` +
        `      <title>${escapeXml(title)}</title>\n` +
        `      <link>${escapeXml(link)}</link>\n` +
        `      <guid>${escapeXml(link)}</guid>\n` +
        (t?.excerpt ? `      <description>${escapeXml(t.excerpt)}</description>\n` : '') +
        (pubDate ? `      <pubDate>${pubDate}</pubDate>\n` : '') +
        `    </item>`
      )
    })
    .filter((x): x is string => x !== null)
    .join('\n')

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<rss version="2.0">\n` +
    `  <channel>\n` +
    `    <title>${escapeXml(SITE.name)}</title>\n` +
    `    <link>${escapeXml(`${SITE.url}/en`)}</link>\n` +
    `    <description>${escapeXml(SITE.description)}</description>\n` +
    `    <language>en</language>\n` +
    (items ? `${items}\n` : '') +
    `  </channel>\n` +
    `</rss>\n`

  return new Response(xml, {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  })
}
