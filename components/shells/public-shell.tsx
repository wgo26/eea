import type { ReactNode } from 'react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { AnnouncementBanner, announcementId } from '@/components/system/announcement-banner'
import { getPublicSiteSettings } from '@/lib/admin/queries'
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
 * The header/footer brand (logo, name, tagline) comes from the same
 * settings (/admin/site-content → Brand & logo); unset values fall back to
 * the built-in Eye mark + wordmark.
 *
 * A3: `locale` arrives from the [locale] segment via the (public) layout —
 * never from getRequestLocale() — so this shell stays ISR-compatible.
 */
export async function PublicShell({ children, locale }: { children: ReactNode; locale: Locale }) {
  const settings = await getPublicSiteSettings()
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
        branding={{ logoUrl: settings.logoUrl, siteName: settings.siteName, siteTagline: settings.siteTagline, siteNameFr: settings.siteNameFr, siteTaglineFr: settings.siteTaglineFr }}
        chrome={getChromeStrings(locale)}
      />
      <main id="main-content" tabIndex={-1} className="flex-1">{children}</main>
      <SiteFooter
        socialLinks={{ facebook: settings.facebookUrl, youtube: settings.youtubeUrl }}
        branding={{ logoUrl: settings.logoUrl, siteName: settings.siteName, siteNameFr: settings.siteNameFr }}
        chrome={getChromeStrings(locale)}
      />
    </>
  )
}