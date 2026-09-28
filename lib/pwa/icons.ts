import 'server-only'

import sharp from 'sharp'

import { loadBrandIdentity } from '@/lib/branding/identity'
import { resolveSiteIconUrl } from '@/lib/site-icon'

/**
 * PWA icon pipeline — the install icon IS the project logo.
 *
 * The admin uploads the logo once at /admin/site-content (or publishes a
 * theme with one); these routes render it onto the brand background as
 * properly-sized PNGs on demand, so the home-screen icon, the maskable icon
 * and the Apple touch icon always match the live brand with no rebuild and
 * no committed binaries to drift. Reads underneath are `unstable_cache`'d
 * (`brand` + `site` tags), so an admin save revalidates the icons within the
 * normal settings window.
 *
 * Served by `app/app-icons/[name]/route.ts` (`.png` suffix keeps the proxy's
 * asset exemption, so the routes are never locale-redirected).
 */

export const PWA_ICON_BG = '#0f172a' // slate-900 — matches theme_color + status bar
const PWA_ICON_ACCENT = '#f59e0b' // amber-500

export type PwaIconSpec = {
  /** File name served by the route, e.g. `icon-192.png`. */
  name: string
  /** Square edge in px. */
  size: number
  /** Full-bleed background with the mark inside the 80% safe zone. */
  maskable: boolean
}

export const PWA_ICON_SPECS: PwaIconSpec[] = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-512-maskable.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: false },
]

/** The built-in eye mark, drawn on a 64-unit grid (same mark as BUILTIN_ICON_SVG). */
function eyeMark(size: number, scale: number, offset: number, bg: 'round' | 'square'): string {
  const rect =
    bg === 'round'
      ? `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${PWA_ICON_BG}"/>`
      : `<rect width="${size}" height="${size}" fill="${PWA_ICON_BG}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${rect}<g fill="none" stroke="${PWA_ICON_ACCENT}" stroke-width="${size * 0.055}" stroke-linecap="round" transform="translate(${offset},${offset}) scale(${scale})"><path d="M8 32c6-9 14-14 24-14s18 5 24 14c-6 9-14 14-24 14S14 41 8 32z"/><circle cx="32" cy="32" r="7" fill="${PWA_ICON_ACCENT}" stroke="none"/></g></svg>`
}

function backgroundSvg(size: number, maskable: boolean): string {
  // Maskable icons must be full-bleed (the launcher crops the shape);
  // standard + Apple icons carry the rounded brand tile themselves.
  const rect = maskable
    ? `<rect width="${size}" height="${size}" fill="${PWA_ICON_BG}"/>`
    : `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${PWA_ICON_BG}"/>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${rect}</svg>`
}

/**
 * Fetch the configured logo as bytes. Only http(s) or site-relative URLs
 * (same safety rule as the tab-icon route — the stored value is never
 * trusted blindly); non-image responses and oversized files are refused so a
 * hostile setting cannot turn icon rendering into an SSRF/file hose.
 */
async function fetchLogoBytes(logoUrl: string | null, origin: string): Promise<Buffer | null> {
  const safe = resolveSiteIconUrl(logoUrl)
  if (!safe) return null
  try {
    const absolute = safe.startsWith('/') ? new URL(safe, origin).toString() : safe
    const res = await fetch(absolute, { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (type && !/image\/(png|jpe?g|webp|gif|svg\+xml)/i.test(type)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0 || buf.length > 5 * 1024 * 1024) return null
    return buf
  } catch {
    return null
  }
}

/**
 * Render one named icon as a PNG buffer. Logo uploads win; anything missing
 * or unusable falls back to the built-in eye mark so the route never 500s on
 * a fresh install with no brand configured yet.
 */
export async function renderPwaIcon(name: string, origin: string): Promise<Buffer | null> {
  const spec = PWA_ICON_SPECS.find((s) => s.name === name)
  if (!spec) return null
  const { size } = spec

  let logo: Buffer | null = null
  try {
    const identity = await loadBrandIdentity()
    logo = await fetchLogoBytes(identity.logoUrl, origin)
  } catch {
    logo = null
  }

  // No usable logo — serve the built-in mark (fitted, or inside the safe
  // zone for the maskable variant, mirroring the old committed icons).
  if (!logo) {
    const scale = spec.maskable ? (size * 0.8) / 64 : size / 64
    const offset = spec.maskable ? size * 0.1 : 0
    return sharp(Buffer.from(eyeMark(size, scale, offset, spec.maskable ? 'square' : 'round')))
      .png()
      .toBuffer()
  }

  // The logo (often a wide wordmark with transparency) is contained in the
  // central box so launchers can crop around it: ~66% of the canvas keeps it
  // inside the maskable safe zone on every variant.
  const box = Math.round(size * 0.66)
  try {
    const fitted = await sharp(logo)
      .resize(box, box, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toBuffer()
    return await sharp(Buffer.from(backgroundSvg(size, spec.maskable)))
      .composite([{ input: fitted, gravity: 'center' }])
      .png()
      .toBuffer()
  } catch {
    // Corrupt/unsupported upload — degrade to the built-in mark, same as above.
    const scale = spec.maskable ? (size * 0.8) / 64 : size / 64
    const offset = spec.maskable ? size * 0.1 : 0
    return sharp(Buffer.from(eyeMark(size, scale, offset, spec.maskable ? 'square' : 'round')))
      .png()
      .toBuffer()
  }
}
