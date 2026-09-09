import type { ReactNode } from 'react'
import { SiteHeader } from '@/components/site-header'
import { SiteFooter } from '@/components/site-footer'
import { getPublicSiteSettings } from '@/lib/admin/queries'

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
 */
export async function PublicShell({ children }: { children: ReactNode }) {
  const settings = await getPublicSiteSettings()
  return (
    <>
      <SiteHeader
        branding={{ logoUrl: settings.logoUrl, siteName: settings.siteName, siteTagline: settings.siteTagline, siteNameFr: settings.siteNameFr, siteTaglineFr: settings.siteTaglineFr }}
      />
      <main className="flex-1">{children}</main>
      <SiteFooter
        socialLinks={{ facebook: settings.facebookUrl, youtube: settings.youtubeUrl }}
        branding={{ logoUrl: settings.logoUrl, siteName: settings.siteName, siteNameFr: settings.siteNameFr }}
      />
    </>
  )
}