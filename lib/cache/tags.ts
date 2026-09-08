/**
 * Phase 4.1 — Public content cache tags (audit §4.1).
 *
 * Hot public reads are cached with `unstable_cache` (the sanctioned API for
 * non-`fetch` data sources while the project runs without `cacheComponents`)
 * and tagged so editorial mutations can invalidate them on demand:
 *
 *   - `news`  — every cached news query (cards, article bodies, facets, stats)
 *   - `home`  — the assembled homepage dataset (`getHomeData`)
 *   - `listings` — every cached buy-sell query (grids, detail, rails)
 *   - `notices` — every cached notice query (board, detail, facets, stats)
 *   - `stories` — every cached photo-story query (grids, detail, facets, stats)
 *   - `culture` — every cached culture/event query (articles, events, facets)
 *   - `site`  — public site config (footer social links) read by the shell on
 *     every public page; invalidated by the site-settings admin mutation.
 *
 * Invalidation uses the two-argument `revalidateTag(tag, profile)` form — the
 * single-argument form is deprecated in Next.js 16. `max` serves stale content
 * while the fresh render runs in the background (stale-while-revalidate), so
 * publishing never blocks a reader.
 *
 * The `revalidate: 300` on each cached query is the correctness backstop: even
 * without an explicit tag call (e.g. a direct SQL edit), cached public data is
 * at most five minutes stale.
 */

export const CACHE_TAGS = {
    news: "news",
    home: "home",
    listings: "listings",
    notices: "notices",
    stories: "stories",
    culture: "culture",
    site: "site",
} as const;

/** Cache/revalidate window for public content data + ISR pages (5 minutes). */
export const PUBLIC_CONTENT_REVALIDATE_SECONDS = 300;
