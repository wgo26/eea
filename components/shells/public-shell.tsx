import type { ReactNode } from 'react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AnnouncementBanner } from '@/components/system/announcement-banner'
import { announcementId } from '@/lib/announcement'
import { getPublicSiteSettings } from '@/lib/admin/queries'
import { loadBrandIdentity } from '@/lib/branding/identity'
import { getDictionary, type Locale } from '@/lib/i18n'
import { getChromeStrings } from '@/lib/i18n/chrome'

/**
 * PublicShell (checklist item 2) — the browsing chrome: global header +
 * footer around content. Applied via the (public) route group so every
 * public page gets exactly this chrome, in both locales, with no page able
 * to opt out silently. The global header/footer self-localize from the URL.
 *
 * The footer's social links come from the admin-maintained site settings
 * (/admin/site-content → Footer social links); unset links hide the icon.
 * The header/footer brand (logo, name, tagline) comes from
 * `loadBrandIdentity()`: the published theme's logo first, then the same
 * settings (/admin/site-content → Brand & logo), then the built-in Eye mark +
 * wordmark — so a rebrand published in /admin/branding repaints the chrome
 * without a code change.
 *
 * A3: `locale` arrives from the [locale] segment via the (public) layout —
 * never from getRequestLocale() — so this shell stays ISR-compatible.
 */
export async function PublicShell({ children, locale }: { children: ReactNode; locale: Locale }) {
  // Identity (logo/name/tagline) resolves through the brand layer so a published
  // theme's logo wins over the day-to-day site setting, with site_settings and
  // the built-in constants behind it. Both reads underneath are cached, so this
  // stays ISR-compatible (A3). Social links keep coming from settings directly.
  const [settings, identity] = await Promise.all([getPublicSiteSettings(), loadBrandIdentity()])
  const dict = getDictionary(locale)
  // A2: the every-page client chrome (header/footer) receives only this
  // small string slice as props, so the full dictionary — including the
  // admin vocabulary — never enters the anonymous client bundle.
  // Announcement banner: locale text with fallback to the other language;
  // empty in both languages turns the banner off.
  const announcementText =
    locale === 'fr'
      ? settings.announcementTextFr?.trim() || settings.announcementTextEn?.trim() || null
      : settings.announcementTextEn?.trim() || settings.announcementTextFr?.trim() || null
  // Request-time clock read: this is a server component (one render per
  // request), so Date.now() is stable for the render. The react-hooks/purity
  // rule targets client render purity — disabled for this line only.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now()
  const windowOpen =
    (!settings.announcementStartsAt || Date.parse(settings.announcementStartsAt) <= now) &&
    (!settings.announcementEndsAt || Date.parse(settings.announcementEndsAt) > now)
  const announcementUrl =
    locale === 'fr'
      ? settings.announcementUrlFr || settings.announcementUrlEn || settings.announcementUrl
      : settings.announcementUrlEn || settings.announcementUrlFr || settings.announcementUrl
  return (
    <>
      {/* a11y: keyboard bypass past the global nav into the page content. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        {dict.common.skipToContent}
      </a>
      {announcementText && windowOpen && (
        <AnnouncementBanner
          id={announcementId(announcementText, announcementUrl)}
          text={announcementText}
          url={announcementUrl}
          dismissLabel={dict.common.dismiss}
        />
      )}
      <SiteHeader
        branding={{ logoUrl: identity.logoUrl, siteName: identity.siteName, siteTagline: identity.tagline, siteNameFr: identity.siteNameFr, siteTaglineFr: identity.taglineFr }}
        chrome={getChromeStrings(locale)}
      />
      <main id="main-content" tabIndex={-1} className="flex-1">{children}</main>
      <SiteFooter
        socialLinks={{ facebook: settings.facebookUrl, youtube: settings.youtubeUrl }}
        branding={{ logoUrl: identity.logoUrl, siteName: identity.siteName, siteNameFr: identity.siteNameFr }}
        chrome={getChromeStrings(locale)}
      />
    </>
  )
}