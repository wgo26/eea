/**
 * Blogspot (Blogger export) parsing + import helpers.
 *
 * A downloaded Blogspot backup is an Atom feed: `<feed>` containing one
 * `<entry>` per post / comment / template / setting. Only entries whose
 * Blogger kind category is `...#post` are real blog posts — everything else
 * (comments `kind#comment`, templates, settings) is skipped.
 *
 * The parser here is intentionally dependency-free (regex over the raw XML)
 * so it runs identically in vitest (node), in Server Actions, and — via the
 * mirrored DOMParser logic in the import client — in the browser. Keep the
 * two parsers in sync: entry filter = kind term contains `kind#post`.
 */

export type BloggerPost = {
  /** tag:blogger.com,…:post-<id> when present, else the alternate URL. */
  bloggerId: string
  title: string
  bodyHtml: string
  publishedAt: string | null
  updatedAt: string | null
  labels: string[]
  originalUrl: string | null
  authorName: string | null
}

function unescapeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => {
      const n = Number(code)
      return Number.isFinite(n) ? String.fromCharCode(n) : _
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => {
      const n = parseInt(code, 16)
      return Number.isFinite(n) ? String.fromCharCode(n) : _
    })
    .replace(/&amp;/g, '&')
}

/** First capturing group of `pattern` in `haystack`, trimmed, or null. */
function firstGroup(haystack: string, pattern: RegExp): string | null {
  const m = haystack.match(pattern)
  return m?.[1]?.trim() ? m[1].trim() : null
}

/**
 * Parse a Blogger Atom export into its blog posts. Throws on empty input;
 * returns [] when the feed holds no posts (e.g. comments-only file).
 */
export function parseBloggerExport(xml: string): BloggerPost[] {
  if (!xml || !xml.trim()) throw new Error('The export file is empty.')
  const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry\s*>/gi) ?? []
  const posts: BloggerPost[] = []

  for (const entry of entries) {
    // Kind filter: only real posts. Blogger marks them with a category whose
    // term ends in kind#post (scheme …/g/2005#kind). Comments use kind#comment.
    const kindTerms = [...entry.matchAll(/<category\b[^>]*\bterm=(["'])(.*?)\1/gi)].map((m) => m[2])
    const isPost = kindTerms.some((t) => t.includes('kind#post'))
    if (!isPost) continue

    const rawTitle = firstGroup(entry, /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)
    const rawContent = firstGroup(entry, /<content\b[^>]*>([\s\S]*?)<\/content\s*>/i)
    const bodyCdata = rawContent?.startsWith('<![CDATA[')
      ? rawContent.replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '')
      : (rawContent ?? '')
    const bodyHtml = unescapeXmlEntities(bodyCdata).trim()

    const publishedAt = firstGroup(entry, /<published\b[^>]*>([\s\S]*?)<\/published\s*>/i)
    const updatedAt = firstGroup(entry, /<updated\b[^>]*>([\s\S]*?)<\/updated\s*>/i)
    const bloggerId = firstGroup(entry, /<id\b[^>]*>([\s\S]*?)<\/id\s*>/i)

    // Labels live in categories with the blogger atom scheme.
    const labels = [...entry.matchAll(/<category\b[^>]*>/gi)]
      .map((m) => m[0])
      .filter((tag) => tag.includes('blogger.com/atom/ns'))
      .map((tag) => tag.match(/\bterm=(["'])(.*?)\1/i)?.[2]?.trim() ?? '')
      .filter(Boolean)

    // Alternate link = the original public post URL.
    let originalUrl: string | null = null
    for (const m of entry.matchAll(/<link\b[^>]*>/gi)) {
      const tag = m[0]
      if (!/\brel=(["'])alternate\1/i.test(tag)) continue
      const href = tag.match(/\bhref=(["'])(.*?)\1/i)?.[2]?.trim()
      if (href) {
        originalUrl = href
        break
      }
    }

    const authorName = firstGroup(entry, /<author\b[^>]*>[\s\S]*?<name\b[^>]*>([\s\S]*?)<\/name\s*>/i)

    // Title fallback: first words of the text so untitled photo posts still
    // import with a usable working title the editor can rename.
    const textFallback = stripHtml(bodyHtml).split(/\s+/).slice(0, 8).join(' ').trim()
    const title = unescapeXmlEntities(rawTitle ?? '').trim() || textFallback || 'Untitled import'

    posts.push({
      bloggerId: bloggerId ?? originalUrl ?? `${title}-${posts.length}`,
      title,
      bodyHtml,
      publishedAt: publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? publishedAt : null,
      updatedAt: updatedAt && !Number.isNaN(Date.parse(updatedAt)) ? updatedAt : null,
      labels,
      originalUrl,
      authorName: authorName ? unescapeXmlEntities(authorName) : null,
    })
  }

  return posts
}

/** All http(s) image sources in an HTML fragment, de-duplicated, capped. */
export function extractImageUrls(html: string, max = 5): string[] {
  const urls: string[] = []
  for (const m of html.matchAll(/<img\b[^>]*\bsrc=(["'])(.*?)\1/gi)) {
    const url = m[2].trim()
    if (!/^https?:\/\//i.test(url)) continue
    if (!urls.includes(url)) urls.push(url)
    if (urls.length >= max) break
  }
  return urls
}

/** Plain-text excerpt: strips tags, collapses whitespace, caps length. */
export function makeExcerpt(html: string, maxLength = 300): string | null {
  const text = stripHtml(html)
  if (!text) return null
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text
}

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
