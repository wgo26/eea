import 'server-only'

import { getPublicSiteSettings } from '@/lib/admin/queries/settings'
import { SITE } from '@/lib/constants'
import type { Locale } from '@/lib/i18n/config'
import { loadDocumentTheme } from './document'
import { resolveSiteIconUrl } from '@/lib/site-icon'

/**
 * The single answer to "what is this site called and what does it look like"
 * (gap 4).
 *
 * Before this existed the identity had two unrelated homes: `site_settings`
 * (logo / name / tagline, edited at /admin/site-content) fed the header, footer,
 * the tab icon and nothing else, while the published theme's
 * `imagery.logoUrl/faviconUrl/socialImageUrl` were written by the branding
 * editor and read by nobody — so a designer could publish a new logo and watch
 * the browser tab keep the old one. Both sources are real and both stay
 * editable; this resolves them in one place with a documented precedence:
 *
 *   published theme → site_settings → built-in constant
 *
 * The theme wins because publishing is the deliberate, two-person-controlled
 * act; `site_settings` remains the day-to-day editor an editor uses without a
 * review cycle, and the constants keep a database-less deployment rendering a
 * complete identity instead of blanks.
 *
 * Both reads underneath are `unstable_cache`'d (`brand` / `site` tags), so this
 * is safe to call from a layout, an icon route or a metadata function on every
 * render, and each admin surface already invalidates its own tag.
 */
export type BrandIdentity = {
  /** Canonical (English) name, falling back to the built-in constant. */
  siteName: string
  /** French name when set; callers fall back to `siteName` per locale. */
  siteNameFr: string | null
  tagline: string | null
  taglineFr: string | null
  /** The wordmark/logo every <img> surface renders. */
  logoUrl: string | null
  /** Tab icon: the theme's own favicon, else the logo, else site_settings. */
  faviconUrl: string | null
  /** Share card (1200x630); null means "use the generated default". */
  socialImageUrl: string | null
  /** Published theme name, for the admin surfaces that show what is live. */
  themeName: string | null
  isBaselineTheme: boolean
}

export async function loadBrandIdentity(): Promise<BrandIdentity> {
  const [settings, theme] = await Promise.all([getPublicSiteSettings(), loadDocumentTheme()])
  const imagery = theme.theme.imagery
  // Every candidate passes the same URL safety check the icon route has always
  // used: the theme's jsonb is admin-authored and the setting was validated on
  // save, but a renderer never trusts a stored URL (see lib/site-icon.ts).
  const logo = resolveSiteIconUrl(imagery.logoUrl) ?? resolveSiteIconUrl(settings.logoUrl)
  const favicon = resolveSiteIconUrl(imagery.faviconUrl) ?? logo ?? resolveSiteIconUrl(settings.logoUrl)
  return {
    siteName: settings.siteName?.trim() || SITE.name,
    siteNameFr: settings.siteNameFr?.trim() || null,
    tagline: settings.siteTagline?.trim() || null,
    taglineFr: settings.siteTaglineFr?.trim() || null,
    logoUrl: logo,
    faviconUrl: favicon,
    socialImageUrl: resolveSiteIconUrl(imagery.socialImageUrl),
    themeName: theme.themeName,
    isBaselineTheme: theme.isBaseline,
  }
}

/** Localized site name — French falls back to English, then the constant. */
export function siteNameFor(locale: Locale, identity: BrandIdentity): string {
  return locale === 'fr' ? identity.siteNameFr || identity.siteName : identity.siteName
}

/**
 * Taglines are NOT localized through a helper here: `SiteHeader` is a client
 * component that resolves `siteTaglineFr || siteTagline` itself from the URL, so
 * a second implementation would be a second source of truth for the fallback.
 * The localized NAME does need one, because the title template is built on the
 * server where that client logic cannot run — hence `siteNameFor` alone.
 */
