/**
 * Content-Security-Policy construction (audit P0-3).
 *
 * Pure and dependency-free so it can be unit-tested (`csp.test.ts`) and
 * imported by `next.config.ts` at config-load time. Never import anything
 * Next-specific or server-only here.
 *
 * ## Why inline scripts are still allowed
 * Next.js ships its RSC flight payload and bootstrap inline, and the documented
 * nonce approach requires dynamic rendering for every page that carries it
 * (`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`:
 * reading `headers()` in the root layout opts the whole tree out of static
 * generation). This app's public pages are statically generated / ISR, so a
 * nonce would trade the entire caching layer for one directive. Instead:
 *
 *  - `script-src-attr 'none'` — the containment layer that matters most here.
 *    Inline *event-handler attributes* (`onerror=`, `onload=`, `onclick=`) are
 *    refused outright, so if a stored-HTML payload ever slips past the
 *    sanitizer it cannot fire from an attribute. CSP3 separates this from
 *    `script-src-elem`, and the explicit directive overrides inheritance from
 *    `script-src 'unsafe-inline'`.
 *  - `'unsafe-eval'` is dropped in production (kept in development for
 *    Turbopack/React refresh).
 *
 * Revisit nonces when the public content routes move to dynamic rendering.
 *
 * ## Third-party ad tags
 * Remnant-network origins are never hardcoded per network: `cspFromEnv()` asks
 * `adNetworkOrigins()` (lib/ads/networks.ts) for the origins of the tags the
 * deployment configured, plus `CSP_AD_EXTRA_HOSTS`. One reviewed exception is
 * the always-on Google ad-selling group (`GOOGLE_AD_HOSTS`): the admin can turn
 * AdSense on from /admin/ads without a rebuild, and a policy baked without those
 * hosts would silently block the unit's frames and creatives.
 *
 * ## Third-party challenge origins
 * Cloudflare Turnstile's origins are only emitted when the caller passes
 * `turnstileEnabled` (`NEXT_PUBLIC_HUMAN_MODE=turnstile`). The default
 * human-verification mode is a same-origin proof-of-work challenge
 * (`lib/security/human-gate.ts`), which needs no CDN entry at all — so the
 * policy stays as tight as the active mode allows.
 */

import { adNetworkOrigins } from "../ads/networks";

export type CspOptions = {
  isProduction: boolean;
  /** Supabase project URL — also seeds the connect-src allowlist. */
  supabaseUrl?: string;
  /** R2 custom domain / r2.dev base URL that serves public media. */
  r2PublicBaseUrl?: string;
  /** Enables the Cloudinary transform host when a cloud name is configured. */
  cloudinaryCloudName?: string;
  /** Comma/space separated extra image hosts (custom CDNs). */
  extraImageHosts?: string;
  /**
   * Third-party ad-tag origins (PropellerAds/Monetag, AdSense, Adsterra, …),
   * derived from `NEXT_PUBLIC_AD_SLOTS` by `adNetworkOrigins()`, plus any manual
   * `CSP_AD_EXTRA_HOSTS` entries. Applied to `script-src`, `frame-src`,
   * `img-src` and `connect-src`. Empty when no remnant network is configured, so
   * a site without ad tags keeps a policy that names no ad host at all.
   */
  adHosts?: string[];
  /** Comma/space separated extra connect (fetch/XHR/WebSocket) hosts. */
  extraConnectHosts?: string;
  /**
   * Adds the Cloudflare Turnstile origins (script, frame, connect) to the
   * policy. Only true when the deployment resolves to `turnstile` mode
   * (`NEXT_PUBLIC_HUMAN_MODE=turnstile`): the default proof-of-work gate is
   * same-origin, so the CDN origins are not needed and keeping them out of
   * the policy is the tighter posture.
   */
  turnstileEnabled?: boolean;
  /**
   * Escape hatch: restore the old blanket `https:` image source. Documented as
   * a security downgrade — it re-opens image-beacon exfiltration for any
   * injected markup. Set CSP_ALLOW_ANY_IMAGE_HOST=1 only when editors depend on
   * pasting arbitrary external image URLs.
   */
  allowAnyImageHost?: boolean;
  /** Optional CSP violation reporting endpoint. */
  reportUri?: string;
};

/** Google ad-serving origins that every publisher tag needs. */
const GOOGLE_AD_HOSTS = [
  "https://pagead2.googlesyndication.com",
  "https://googleads.g.doubleclick.net",
  "https://tpc.googlesyndication.com",
  "https://securepubads.g.doubleclick.net",
  "https://adservice.google.com",
  "https://www.google.com",
];

const TURNSTILE = "https://challenges.cloudflare.com";
const GOOGLE_FONTS_CSS = "https://fonts.googleapis.com";
const GOOGLE_FONTS_FILES = "https://fonts.gstatic.com";
/** Leaflet loads map tiles as <img> from components/location-map.tsx. */
const MAP_TILES = "https://tile.openstreetmap.org";
const CLOUDINARY = "https://res.cloudinary.com";
const SEED_PLACEHOLDERS = "https://picsum.photos";
/**
 * Imported Blogger posts keep their original <img src> — the importer does not
 * re-host media (`lib/admin/blogger.ts`). `SmartImage` falls back to a plain
 * `<img>` for non-optimizable hosts (so no next/image remotePattern is needed),
 * which means these request Google directly and MUST be allowlisted here or
 * every imported article photo is CSP-blocked in production.
 */
const BLOGGER_IMAGES = "https://blogger.googleusercontent.com";
/** Video embeds rendered by components/media/media-attachment.tsx. */
const MEDIA_FRAMES = ["https://www.youtube.com", "https://player.vimeo.com"];
/**
 * Community live events (Phase 3): the Facebook video plugin iframe used by
 * the LivePlayer for `provider = 'facebook'` streams. Same posture as the
 * media embeds above — a single named origin, no wildcards.
 */
const LIVE_FRAMES = ["https://www.facebook.com"];
/**
 * Video thumbnail host: YouTube post previews (cards, heroes, OG images) use
 * `https://i.ytimg.com/vi/<id>/hqdefault.jpg` when a post has a YouTube URL
 * but no uploaded cover (`previewImageUrl` in lib/media/attachments.ts), so
 * the host must be an allowed image source or every video-only preview is
 * CSP-blocked in production.
 */
const VIDEO_THUMBNAILS = "https://i.ytimg.com";

/**
 * Scheme + host of a URL, or null when unset/invalid.
 *
 * The port is preserved when it is non-default: a CSP host-source without a
 * port matches only the scheme's default port, so dropping `:8443` here would
 * silently produce an allowlist entry that never matches the host it names.
 * (WHATWG `URL` already normalizes away a *default* port, so `parsed.port` is
 * `""` for `https://x.example:443` and this never emits a redundant `:443`.)
 */
export function originOf(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    if (!parsed.hostname) return null;
    return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ""}`;
  } catch {
    return null;
  }
}

/** Normalizes "cdn.example.com, other.net" into full https origins. */
export function parseHostList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => originOf(/^https?:\/\//i.test(entry) ? entry : `https://${entry}`))
    .filter((value): value is string => value !== null);
}

/**
 * Whether an admin-configured tag's entry-point origin is covered by the CSP
 * emitted at build time. Database-backed tags are runtime-editable, but CSP
 * remains deployment configuration; reject a tag that would silently be
 * blocked by the browser.
 */
export function isAdTagOriginAllowed(
  rawUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const origin = originOf(rawUrl);
  if (!origin) return false;
  const allowed = unique([
    ...GOOGLE_AD_HOSTS,
    ...adNetworkOrigins(env),
    ...parseHostList(env.CSP_AD_EXTRA_HOSTS),
  ].map((host) => originOf(host)));
  return allowed.includes(origin);
}

/** Dedupes while preserving first-seen order, so output CSPs are stable. */
function unique(values: (string | null)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function buildCsp(options: CspOptions): string {
  const {
    isProduction,
    supabaseUrl,
    r2PublicBaseUrl,
    cloudinaryCloudName,
    extraImageHosts,
    extraConnectHosts,
    adHosts = [],
    turnstileEnabled = false,
    allowAnyImageHost = false,
    reportUri,
  } = options;

  /** Turnstile is a third-party origin — allowlisted only in turnstile mode. */
  const turnstile = turnstileEnabled ? TURNSTILE : null;

  /**
   * Ad-network origins. `adNetworkOrigins()` returns `URL.origin` values, but
   * re-validating through `originOf` means a hand-built `CspOptions.adHosts`
   * can never smuggle `javascript:`/`data:` into the policy.
   *
   * The Google group is always present: the admin can enable an AdSense unit at
   * any time from /admin/ads, and this policy is baked at build time, so making
   * it conditional would mean "enable AdSense, then discover the console
   * blocked half the creative until the next rebuild". The marginal exposure is
   * a set of Google ad-serving origins in a policy that already allows
   * `'unsafe-inline'` scripts; the sanitizer, not this directive, is what
   * prevents injected markup in the first place.
   */
  const adOrigins = unique([...GOOGLE_AD_HOSTS, ...adHosts.map((host) => originOf(host))]);

  // Supabase storage serves public media from the project origin, which the
  // REST/auth endpoints share. Realtime surfaces upgrade to WebSocket, so both
  // schemes are allowlisted (plus the wildcard for self-hosted/custom domains).
  const supabaseOrigin = originOf(supabaseUrl);
  const supabaseConnect =
    supabaseOrigin && supabaseOrigin.startsWith("https:")
      ? [supabaseOrigin, supabaseOrigin.replace("https:", "wss:")]
      : [supabaseOrigin];
  const supabaseWildcard = ["https://*.supabase.co", "wss://*.supabase.co"];

  // Image + media (video/audio attachment) hosts.
  const mediaHosts = unique([
    supabaseOrigin,
    originOf(r2PublicBaseUrl),
    cloudinaryCloudName ? CLOUDINARY : null,
    SEED_PLACEHOLDERS,
    BLOGGER_IMAGES,
    MAP_TILES,
    VIDEO_THUMBNAILS,
    ...adOrigins,
    ...parseHostList(extraImageHosts),
  ]);

  const imgSrc = allowAnyImageHost
    ? ["'self'", "data:", "blob:", "https:"]
    : ["'self'", "data:", "blob:", ...mediaHosts];

  const connectSrc = unique([
    "'self'",
    ...supabaseWildcard,
    ...supabaseConnect,
    turnstile,
    ...adOrigins,
    ...parseHostList(extraConnectHosts),
  ]);

  const scriptSrc = unique([
    "'self'",
    "'unsafe-inline'",
    isProduction ? null : "'unsafe-eval'",
    turnstile,
    ...adOrigins,
  ]);

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    // Supersedes X-Frame-Options for modern browsers; both are still sent.
    "frame-ancestors 'none'",
    "form-action 'self'",
    `script-src ${scriptSrc.join(" ")}`,
    // Neutralizes inline event-handler attributes in any markup that reaches
    // the DOM — see the module doc comment.
    "script-src-attr 'none'",
    `style-src 'self' 'unsafe-inline' ${GOOGLE_FONTS_CSS}`,
    `font-src 'self' data: ${GOOGLE_FONTS_FILES}`,
    `img-src ${imgSrc.join(" ")}`,
    `media-src ${unique(["'self'", "blob:", ...mediaHosts]).join(" ")}`,
    `connect-src ${connectSrc.join(" ")}`,
    `frame-src ${unique(["'self'", turnstile, ...adOrigins, ...MEDIA_FRAMES, ...LIVE_FRAMES]).join(" ")}`,
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
    ...(reportUri ? [`report-uri ${reportUri}`, `report-to ${reportUri}`] : []),
  ];

  return directives.join("; ");
}

/** Reads the CSP knobs from process.env and builds the header value. */
export function cspFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  return buildCsp({
    isProduction: env.NODE_ENV === "production",
    supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
    r2PublicBaseUrl: env.R2_PUBLIC_BASE_URL ?? env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL,
    cloudinaryCloudName: env.CLOUDINARY_CLOUD_NAME,
    extraImageHosts: env.CSP_EXTRA_IMAGE_HOSTS,
    extraConnectHosts: env.CSP_EXTRA_CONNECT_HOSTS,
    // Derived from the same `NEXT_PUBLIC_AD_SLOTS` config the renderer reads, plus
    // the documented escape hatch for a tag that also pulls creatives from a
    // second CDN (the browser console names it).
    adHosts: [...adNetworkOrigins(env), ...parseHostList(env.CSP_AD_EXTRA_HOSTS)],
    turnstileEnabled: env.NEXT_PUBLIC_HUMAN_MODE === "turnstile",
    allowAnyImageHost: env.CSP_ALLOW_ANY_IMAGE_HOST === "1",
    reportUri: env.CSP_REPORT_URI,
  });
}