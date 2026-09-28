import { PWA_ICON_SPECS, renderPwaIcon } from '@/lib/pwa/icons'

/**
 * Dynamic PWA icons — the install icon is the project logo.
 *
 * `/app-icons/icon-192.png`, `/app-icons/icon-512.png`,
 * `/app-icons/icon-512-maskable.png` (manifest) and
 * `/app-icons/apple-touch-icon.png` (iOS home screen) render the live brand
 * logo from `loadBrandIdentity()` (published theme → site_settings) onto the
 * brand background via sharp, falling back to the built-in eye mark when no
 * logo is configured. Upload a logo at /admin/site-content and every app
 * icon follows within the normal settings cache window — no rebuild, no
 * committed binaries.
 *
 * The `.png` suffix keeps the proxy's asset exemption, so these routes are
 * never locale-redirected. `force-dynamic` avoids a build-time prerender
 * against empty settings (same pattern as the tab-icon route).
 */
export const dynamic = 'force-dynamic'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
): Promise<Response> {
  const { name } = await params
  if (!PWA_ICON_SPECS.some((s) => s.name === name)) {
    return new Response('Not found', { status: 404 })
  }
  const png = await renderPwaIcon(name, new URL(request.url).origin)
  if (!png) {
    return new Response('Not found', { status: 404 })
  }
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      // Mirrors the tab-icon route: a changed logo propagates like any other
      // site setting (launchers also re-cache install icons on their own).
      'Cache-Control': 'public, max-age=300',
    },
  })
}
