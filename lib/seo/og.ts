/**
 * Default social-share image (1200×630) used by any route that does not set
 * its own `openGraph.images` — the homepage, section indexes, advertise,
 * locations, search. Generated once by `scripts/generate-og-default.mjs`
 * (sharp) and committed as `public/og-default.png`; `metadataBase` in the
 * root layout resolves the path to an absolute share URL.
 */
export const DEFAULT_OG_IMAGE = "/og-default.png";

/** Standard X/Twitter card type — inherits the same default image. */
export const TWITTER_CARD = "summary_large_image" as const;
