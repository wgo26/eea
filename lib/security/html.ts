/**
 * Shared server-side HTML sanitizer.
 *
 * Regex-based stripping of active content — scripts, embedded objects,
 * forms, meta/base/link, event-handler attributes and javascript:/data:/
 * vbscript: URLs — used both by ad creatives (lib/ads/creatives.ts) and by
 * public article bodies imported from Blogger (rendered via
 * dangerouslySetInnerHTML inside a `prose` container). Static markup and
 * inline CSS survive; interactivity is intentionally unsupported.
 */

/** content_translations.body carries up to 500k chars (DB check). */
export const MAX_BODY_HTML_CHARS = 500_000

export function sanitizeHtml(raw: string | null | undefined, maxChars: number): string | null {
  if (!raw) return null
  let html = raw.slice(0, maxChars * 2)
  // Remove whole dangerous elements including their content.
  html = html.replace(/<(script|object|embed|form|base|meta|link|iframe|frame|frameset)[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
  html = html.replace(/<(script|object|embed|form|base|meta|link|iframe|frame|frameset)[^>]*\/?>/gi, '')
  // Strip event-handler attributes (onclick=, onerror=, …).
  html = html.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  // Neutralize javascript:/data:/vbscript: URLs in href/src/action/background.
  html = html.replace(/\s+(href|src|action|background|xlink:href)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (m, attr, _q, d1: string, d2: string, d3: string) => {
    const url = (d1 ?? d2 ?? d3 ?? '').trim()
    if (/^(javascript|data|vbscript):/i.test(url)) return ` ${attr}="#"`
    return m
  })
  html = html.trim()
  if (!html) return null
  return html.slice(0, maxChars)
}

/**
 * Sanitized article body for public rendering. Unlike ad creatives, plain
 * text passes through (native drafts) and the size cap matches the DB
 * column so imported bodies are never silently truncated.
 */
export function sanitizeBodyHtml(raw: string | null | undefined): string | null {
  return sanitizeHtml(raw, MAX_BODY_HTML_CHARS)
}