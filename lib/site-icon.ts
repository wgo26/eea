/**
 * Site icon (browser tab icon / favicon) — follows the uploaded logo.
 *
 * The branding panel's copy promises "the same logo feeds the browser tab
 * icon": `site_logo_url` (maintained at /admin/site-content) is the single
 * source. The old static `app/icon.svg` + `app/favicon.ico` demo-mark files
 * are replaced by two dynamic route handlers (`app/icon.svg/route.ts`,
 * `app/favicon.ico/route.ts`) that resolve the setting per request:
 *
 *   - logo uploaded → 307 redirect to the uploaded image (the absolute
 *     https URL the /api/uploads R2 destination returns, or a site-relative
 *     /uploads path) — the browser then renders the uploaded logo as the tab
 *     icon;
 *   - logo cleared → the built-in mark below is served, so the pre-upload
 *     icon returns (same empty-value semantics as the header wordmark).
 *
 * Both URLs are proxy-exempt (`/favicon.ico` explicitly, `/icon.svg` by the
 * asset-extension rule), locale-independent, and read the same `site`-tagged
 * cache the shell uses — `saveSiteSetting` invalidates it, so an admin save
 * refreshes the icon within the normal stale-while-revalidate window.
 */

/** The built-in mark served when no logo is uploaded (ex app/icon.svg). */
export const BUILTIN_ICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0f172a"/>
  <g fill="none" stroke="#f59e0b" stroke-width="4" stroke-linecap="round">
    <path d="M8 32c6-9 14-14 24-14s18 5 24 14c-6 9-14 14-24 14S14 41 8 32z"/>
    <circle cx="32" cy="32" r="7" fill="#f59e0b" stroke="none"/>
  </g>
</svg>`

/**
 * Same rules as the header/footer <img> safeLogoSrc: only an absolute
 * http(s) URL or a site-relative path without traversal or markup is safe to
 * redirect to (defense in depth — the setting was validated on save, but the
 * icon route never trusts the stored value).
 */
export function resolveSiteIconUrl(value: string | null): string | null {
    const trimmed = value?.trim()
    if (!trimmed) return null
    if (trimmed.startsWith("/")) {
        if (trimmed.includes("..") || /[\s<>"]/.test(trimmed)) return null
        return trimmed
    }
    try {
        const url = new URL(trimmed)
        return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null
    } catch {
        return null
    }
}

/**
 * Resolve the icon response for one request: redirect to the uploaded logo
 * when a safe URL is configured, else serve the built-in mark. The 5-minute
 * cache window mirrors the public-content revalidate semantics (a cleared or
 * changed logo propagates like any other site setting).
 */
export function serveSiteIcon(logoUrl: string | null, requestUrl: string): Response {
    const icon = resolveSiteIconUrl(logoUrl)
    const cacheControl = "public, max-age=300"
    if (icon) {
        return new Response(null, {
            status: 307,
            headers: {
                Location: new URL(icon, requestUrl).toString(),
                "Cache-Control": cacheControl,
            },
        })
    }
    return new Response(BUILTIN_ICON_SVG, {
        headers: {
            "Content-Type": "image/svg+xml; charset=utf-8",
            "Cache-Control": cacheControl,
        },
    })
}
