import { ImageResponse } from 'next/og'
import { SITE } from '@/lib/constants'

export const OG_WIDTH = 1200
export const OG_HEIGHT = 630

export type ArticleOgInput = {
  /** Section label, already localized (e.g. dict.nav.news). */
  sectionLabel: string
  title: string
  /** Localized category name, when the story has one. */
  category: string | null
  /** Cover URL (absolute or site-relative). Unreachable covers fall back gracefully. */
  imageUrl: string | null
}

// Brand palette — mirrors scripts/generate-og-default.mjs and the tab icon.
const BG = '#0f172a'
const ACCENT = '#f59e0b'
const FG = '#f8fafc'
const MUTED = '#94a3b8'

const SERIF = "Georgia, 'Times New Roman', serif"
const SANS = "Arial, Helvetica, sans-serif"

/**
 * Best-effort cover fetch: returns a data URI when the image is reachable,
 * null otherwise (private hosts, hotlink protection, oversized files).
 * Pre-flighted so a dead cover can never fail the whole card render.
 */
async function coverDataUri(rawUrl: string | null): Promise<string | null> {
  if (!rawUrl) return null
  const url = rawUrl.startsWith('/') ? `${SITE.url}${rawUrl}` : rawUrl
  if (!/^https?:\/\//i.test(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (!type.startsWith('image/')) return null
    // Never embed SVG covers: this card is rasterized through the SVG-based
    // OG pipeline (next/og), and a crafted SVG image would put
    // attacker-controlled markup inside that pipeline. Covers are photos —
    // raster only.
    if (/svg/i.test(type)) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length > 2_500_000) return null
    return `data:${type.split(';')[0]};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/**
 * Strip anything that could break out of a text node in the OG pipeline.
 * Titles/kickers render as text (never attributes or styles), so removing
 * `<`/`>` plus control characters closes the tag-injection vector that
 * CVE-2026-94545 exploited upstream — independent of the patched runtime.
 * `&`, quotes and accents are preserved: they render literally as text.
 */
export function sanitizeOgText(raw: string): string {
  return raw
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function clampTitle(title: string, max = 120): string {
  const clean = sanitizeOgText(title)
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean
}

/**
 * Dynamic social-share card (1200×630): section kicker + optional category,
 * the article title, and the cover as a right-side panel. System fonts only
 * (no external font fetch — the build never hits the network), so this is
 * safe to render per-request on the Node runtime.
 */
export async function articleOgImage(input: ArticleOgInput): Promise<ImageResponse> {
  const cover = await coverDataUri(input.imageUrl)
  const section = sanitizeOgText(input.sectionLabel)
  const category = input.category ? sanitizeOgText(input.category) : null
  const kicker = category ? `${section} · ${category}` : section

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          backgroundColor: BG,
          color: FG,
          fontFamily: SANS,
        }}
      >
        {/* Copy panel */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            width: cover ? 660 : 1040,
            padding: '60px 64px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', marginBottom: 20 }}>
            <div style={{ width: 44, height: 6, borderRadius: 3, backgroundColor: ACCENT, marginRight: 14 }} />
            <div style={{ fontSize: 26, letterSpacing: 2, textTransform: 'uppercase', color: MUTED }}>
              {kicker}
            </div>
          </div>
          <div
            style={{
              fontFamily: SERIF,
              fontSize: 64,
              fontWeight: 700,
              lineHeight: 1.12,
              height: 216,
              overflow: 'hidden',
            }}
          >
            {clampTitle(input.title)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 28 }}>
            <div style={{ fontSize: 28, fontWeight: 700 }}>{SITE.name}</div>
            <div style={{ fontSize: 24, color: MUTED, marginLeft: 12 }}>· {SITE.shortName}</div>
          </div>
        </div>
        {/* Cover panel (or accent edge when there is no usable cover) */}
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt=""
            width={540}
            height={630}
            style={{ objectFit: 'cover', width: 540, height: 630 }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              width: 160,
              backgroundColor: ACCENT,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 72,
                height: 72,
                borderRadius: 36,
                border: '6px solid #0f172a',
              }}
            />
          </div>
        )}
      </div>
    ),
    { width: OG_WIDTH, height: OG_HEIGHT },
  )
}
