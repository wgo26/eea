import type { MetadataRoute } from 'next'

import { SITE } from '@/lib/constants'
import { loadBrandIdentity } from '@/lib/branding/identity'
import { PWA_ICON_BG } from '@/lib/pwa/icons'

/**
 * Web app manifest — makes the site installable (home-screen icon,
 * standalone display, themed browser chrome).
 *
 * Brand-aware, not committed constants: the name, short name and description
 * resolve through `loadBrandIdentity()` (published theme → site_settings →
 * constants), and every icon is rendered from the live logo by
 * `app/app-icons/[name]/route.ts`. Rename the site or upload a logo at
 * /admin/site-content and the install experience follows within the normal
 * settings cache window — no code change, no icon regeneration step.
 *
 * Root-level metadata route (not a user-facing page): installability is
 * locale-independent, so a single manifest serves both locales. Reads ONLY
 * `unstable_cache`'d data, so this never opts routes out of static
 * generation; a missing database yields the shipped identity.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const identity = await loadBrandIdentity()
  const name = identity.siteName
  // short_name is truncated to ~12 chars on launchers — prefer the real name
  // when it fits, else the brand acronym.
  const shortName = name.length <= 12 ? name : SITE.shortName
  const description = identity.tagline?.trim() || SITE.description
  const icon192 = '/app-icons/icon-192.png'

  return {
    id: '/',
    name,
    short_name: shortName,
    description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone'],
    orientation: 'portrait',
    background_color: PWA_ICON_BG,
    theme_color: PWA_ICON_BG,
    categories: ['news', 'social', 'entertainment'],
    icons: [
      {
        src: icon192,
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/app-icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
      {
        src: '/app-icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
    shortcuts: [
      {
        name: 'Submit a story',
        url: '/submit',
        description: 'Share news, photos, notices and culture with the community.',
        icons: [{ src: icon192, sizes: '192x192', type: 'image/png' }],
      },
      {
        name,
        url: '/',
        description,
        icons: [{ src: icon192, sizes: '192x192', type: 'image/png' }],
      },
    ],
  }
}
