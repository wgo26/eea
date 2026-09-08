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
 */
export async function PublicShell({ children }: { children: ReactNode }) {
  const social = await getPublicSiteSettings()
  return (
    <>
      <SiteHeader />
      <main className="flex-1">{children}</main>
      <SiteFooter socialLinks={{ facebook: social.facebookUrl, youtube: social.youtubeUrl }} />
    </>
  )
}