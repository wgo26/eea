# Performance budget

Targets for the mobile-first, low-bandwidth audience (`features.md` gap §3).
Measure on a Moto G-class device, 4G throttled, `/en` homepage + one
`/news/[slug]` article. No Lighthouse CI yet — check by hand before scale-up.

## Budgets

| Surface | Budget | Enforced by |
|---|---|---|
| Homepage JS (anon) | ≤ 120 KB gzipped | `scripts/verify-anon-bundle.mjs` in `npm run check` (structural: Inter only, no remote fonts, chrome-slice dictionary) |
| LCP, homepage + article | < 2.5 s on 4G | Manual (no gate yet). Levers: AVIF-first (`next.config.ts` `formats`), `SmartImage`/`AdaptiveImage` + `sizes`, lite mode, ISR `revalidate: 300` |
| Article images | Optimized hosts via `next/image`; external pasted URLs fall back to lazy `<img>` | `SmartImage` (`components/media/smart-image.tsx`), `remotePatterns` env-driven |
| Imported Blogger bodies | ≤ 10 `<img>`, lazy past the lead | `capImportedImages` at ingestion (`lib/admin/blogger.ts` + `scripts/import-blogger.mjs` mirror); render-side `loading="lazy"` (`components/media/media-attachment.tsx`) |
| OG share cards | 1200×630 PNG; cover fetch capped 2.5 MB | `lib/seo/og-image.tsx` (+ per-route `opengraph-image.tsx`); default `public/og-default.png` (~43 KB) |
| Fonts | Inter variable + Newsreader Bold/ExtraBold static only (~47 KB); mono subtree-only | `verify-anon-bundle.mjs` root-font gate |
| DB weight per page | Indexed reads; 300 s ISR backstop; on-demand `revalidateTag` on publish | `lib/cache/tags.ts`, `revalidatePublicContentCache()` |

## Rules for new code

1. Every editorial `<img>` renders through `SmartImage` (or documents why not —
   `scripts/find-bg-images.mjs` blocks CSS-background regressions in `check`).
2. New public queries get `unstable_cache` + tag + 300 s revalidate, and their
   mutations call `revalidatePublicContentCache()` (the notices/listings/
   stories/culture gap of Phase 1 must not recur).
3. No new Google-Fonts weights, no client-side analytics beacons, no
   autoplay media. The ad beacon (`/api/ads/event`) is the only exception and
   stays fail-open + throttled.
4. Imported HTML never grows new active elements — the sanitizer allowlist
   (`lib/security/html.ts`) is append-only by review.
