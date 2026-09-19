Where the project actually stands
Eagle Eye Africa is far past "prototype". Typecheck is clean, 203 unit tests pass, 48 migrations are gated, CSP/HSTS/COOP headers ship, RLS plus capability guards plus audited Server Functions form a real defense-in-depth chain, and the EN/FR parity test makes i18n drift a CI failure. Almost every item in audit.md and architecture-checklist.md has genuinely landed. So this audit deliberately ignores what those documents already cover and focuses on what I found by reading the code that the docs do not mention. The gaps fall into three groups: the GitHub-as-control decision needs locking in (the local git remote still points at GitLab); the low-bandwidth promise is undermined by a few structural choices in rendering and bundling; and the differentiators that would make it a masterpiece (place-first, timeline, memory, map, offline) are still mostly on paper.

Part 1: Architectural audit
A1. Platform control: GitHub is source of truth, GitLab remote is stale (Resolved by decision 2026-09-19) GitHub Actions own all automation: quality gates in .github/workflows/ci.yml, production crons in .github/workflows/scheduled-jobs.yml, migrations in .github/workflows/db-push.yml, updates via .github/dependabot.yml. The README badge correctly points to github.com/wgo26/eea. The only leftover is the local git remote, which still points at gitlab.com/fame-group3/wef.git, and there is no .gitlab-ci.yml (which is correct — none is wanted).

Decision: stop using GitLab, continue with GitHub as control. No GitLab CI, schedules, or dependency scanning work is required.
Remaining lock-in steps: point origin at github.com/wgo26/eea (git remote set-url), push/verify, remove any GitLab mirror/schedules if created, keep scripts/verify-crons.mjs parsing the GitHub scheduled-jobs.yml only.
A2. Both locales and all admin strings are shipped to every anonymous visitor (High — implemented 2026-09-19) Chrome strings (nav/header/theme/language/command/footer) moved to lib/i18n/chrome-en.ts/chrome-fr.ts (single source; en.ts/fr.ts reference them so Dictionary shape is unchanged and parity holds). SiteHeader/SiteFooter/ThemeToggle/CommandPaletteButton take string slices as props from PublicShell via getChromeStrings(locale); LanguageSwitcher imports from lib/i18n/config. Gate: scripts/verify-client-dictionary.mjs in `npm run check`; chrome contracts in lib/i18n/chrome.test.ts. Remaining per-page clients (error.tsx, route-error, policy-accept-button) tolerated and listed by the gate. Full @next/bundle-analyzer budget not added — static leak gate chosen instead (no build cost).
A3. Rendering strategy is only half converted to static (High — implemented 2026-09-19) All 15 public + 8 focused pages now resolve locale from params (zero headers() reads left in app/); ISR revalidate=300 added to 13 static-safe editorial pages (about/*, locations, contributors+detail, events detail, digest+archive, submit; advertise stays dynamic via auth, events index via searchParams). Homepage split into async sections (components/home/home-sections.tsx) each in <Suspense> with shell-matched skeletons sharing one cached getHomeData() read. lib/queries/locations.ts wrapped in unstable_cache under new CACHE_TAGS.locations, invalidated by revalidateTaxonomy + revalidatePublicContentCache. KEY FINDING: the page conversions alone changed nothing in build output — app/[locale]/not-found.tsx read getRequestLocale() (headers/cookies), which forced the ENTIRE [locale] subtree dynamic (0 pages prerendered). Fixed by threading params-locale through (public)/layout → PublicShell and making not-found static (URL-derived locale client-side + notFound chrome strings). Result: `npm run build` prerenders 134 static pages (SSG + 5m ISR), incl. /en, /fr, about/*, digest, locations, submit. Note: 4 of the 5 "remaining hot reads" were already cached — only locations was missing.
A4. The proxy runs a Supabase session refresh on every request, including anonymous static hits (Medium) proxy.ts calls updateSession() for all matched paths. For anonymous visitors there is no session to refresh; the client construction and any getUser() call are wasted latency on the hottest path.

Short-circuit updateSession when no sb-* cookie is present, or narrow the matcher so (public) routes skip it and only (app)/(focused)/api refresh.
A5. Search is ilike substring matching with two-step queries (High for scale, High for French) lib/queries/search.ts, news.ts, notices.ts, buy-sell.ts, culture.ts, photo-stories.ts all search with title.ilike.*x* and work around PostgREST's or() limitation by fetching translation ids first. No tsvector, no pg_trgm, no unaccent. "Bamenda 2026 infrastructure" (the flagship example in features.md) will not rank; "école" will not match "ecole".

Add a generated search_vector tsvector column on content_translations using unaccent and the locale's config (english/french), a GIN index, and a single search_content(q, locale, types[], location, category, from, to) RPC with ts_rank_cd and ts_headline.
Add pg_trgm for typo tolerance on titles and location names (also powers /api/search/suggest).
A6. No generated database types (Medium) There is no database.types.ts; every one of the 40 files that call createAdminClient uses hand-written row types. Schema drift (the exact class of bug the 2026-09-08 remote-drift repair fixed) is only detectable at runtime.

Add supabase gen types typescript --linked > lib/supabase/database.types.ts to CI, type both clients with Database, and fail CI when the committed file differs from the generated one.
A7. Two back-office monoliths (Medium) lib/admin/actions.ts is 3,932 lines inside a single 'use server' module; lib/admin/queries.ts is 2,381. Any import pulls the whole action graph into the RSC boundary, review is painful, and blast radius of one mistake is the entire admin.

Split by domain following the pattern actions-import.ts, actions-site.ts and actions-storage.ts already established: actions-content.ts, actions-moderation.ts, actions-ads.ts, actions-users.ts, actions-taxonomy.ts, actions-policies.ts. Same for queries. Keep a barrel for compatibility, then delete it.
A8. Test pyramid is a test column (Medium) 203 unit tests, 0 component tests, 0 e2e, 0 RLS integration tests. The security model's real wall (RLS) is unverified by any automated test; docs/known-issues.md names this itself.

Add Playwright (submit → moderate → publish → correction, in EN and FR, at 390 px and 1280 px, with axe assertions).
Add RLS tests against a disposable Supabase branch or supabase start in CI: "editor cannot delete", "anon cannot read user_roles", "contributor sees own submissions only".
Add Vitest browser-mode or React Testing Library for SubmitForm, MediaUploader, ReviewActions.
A9. Dependency drift (Low, quick win — implemented 2026-09-19) zod, react-hook-form, @hookform/resolvers and date-fns had zero imports and were removed from package.json; @types/node bumped ^20 → ^22; root db.js (untracked duplicate Supabase client, zero imports) deleted. If input validation is wanted later, re-add zod deliberately with schemas for lib/public/actions.ts.
A10. Repository hygiene (Low, quick win — implemented 2026-09-19) Twenty scratch artefacts sat at the root (build*.txt, scratch-*.cjs/.mjs/.ps1, repair.txt, migrations-apply.txt, checklist-dump.txt, tsc-out.txt, eea-read-build.cjs, .build-baseline.log) and ESLint had to special-case them. Root audit.md was a pasted tool transcript (canonical doc is docs/audit.md). Git history is a single "Initial commit" with main and initial-import at the same SHA.

Done in code: scratch files deleted, patterns added to .gitignore, ESLint special-cases removed. Still manual (GitHub settings): protect main, MR-only merges, conventional commits. Note: A12 still references a "GitLab scheduled job" — read it as "GitHub scheduled workflow" per the A1 GitHub-as-control decision.
A11. Observability stops at structured logs (Medium) lib/observability/logger.ts emits JSON, /api/health and /api/ready exist, but SENTRY_DSN is documented as "inert until the SDK is installed". No web-vitals reporting, no traces, no alert rules beyond the GitHub watchdog.

Install @sentry/nextjs (server + edge + client with tracesSampleRate tuned low), report web-vitals from the root layout to a /api/vitals beacon or Sentry, define three SLOs (p75 LCP < 2.5 s on the homepage, moderation action error rate < 0.5 %, cron success ≥ 99 %).
A12. Disaster recovery covers media but not the database (High) Media mirrors to B2 nightly with checksums, but docs/known-issues.md confirms there is no pg_dump → B2 job and no rehearsed restore. Supabase's own PITR depends on plan tier.

Add /api/cron/db-dump (or a GitLab scheduled job running pg_dump --format=custom | age -r ... | b2 upload) with 30-day retention, and a quarterly restore drill script that restores into a scratch project and runs verify-migrations + row-count assertions.
A13. CSP still relies on 'unsafe-inline' for scripts (Medium) The documented reason (nonces would kill ISR) is correct, but the two inline scripts (themeInitScript, localeInitScript) are static strings. SHA-256 hashes of those strings can be allowlisted in script-src, which removes 'unsafe-inline' without nonces and without losing static rendering.

Compute the hashes at build time in lib/security/csp.ts, add a test that fails when the script text changes without the hash updating.
A14. Legacy URLs from the Blogger era are not redirected (Medium, SEO) LEGACY_REDIRECTS in proxy.ts is empty, yet lib/admin/actions-import.ts imports Blogger posts and stores the original /YYYY/MM/slug.html path in notes. Every inbound link and search result from the old site 404s.

Persist legacy_path as a real column on content_items, and resolve it in the proxy (or a [...legacy] route) with a 301 to the localized canonical URL.
A15. PWA is installable but not offline-capable (Medium for the audience) app/manifest.ts and icons exist; no service worker. The spec's "offline-friendly reading" and "lite mode" are unimplemented.

Add Serwist (Workbox for Next 16): precache the shell, stale-while-revalidate for /_next/image and story pages, an offline fallback page, "Save for offline" on articles backed by Cache API, and a Save-Data header aware image quality switch in SmartImage.
A16. Data model does not yet carry the differentiators (Strategic) content_items + content_translations + type extension rows is a sound spine, but there is no timeline_entries table (Diff. #6), no photo_pairs for Then & Now (#11), no geo columns (lat, lng, geom) on locations or content for the map (#12), and no per-item Pidgin/Camfranglais share-text field (§20). leaflet is already installed and used in components/locations/location-map.tsx, so the map is started but has nothing to plot.

Part 2: UI/UX audit
U1. Legibility floor is broken on mobile. There are 70 uses of text-[10px] and 92 of text-[11px] for category pills, badges and metadata. On low-end Android screens 10 px is unreadable and fails WCAG for the audience the product targets. Set a design-token floor of 12 px (text-xs) for anything that carries meaning, and use uppercase tracking rather than shrinking type to signal hierarchy.

U2. No streaming means "everything pops at once". With zero <Suspense>, the user sees a full-page skeleton, then the whole page. On 3G the perceived wait is the slowest query. Stream hero and headline first, rails second, ads and polls last.

U3. The homepage is a hub but not yet a place. The differentiator is place-first journalism, yet the homepage treats Locations as one tile among six. Add a persistent "Your place" selector (cookie-backed, prompted once, editable in the header) that inserts a "Near you: {place}" rail mixing news, notices, listings and events for that place, which is exactly the "One Community Board" story in sitemap.md §16.

U4. Structured data is limited to news. Only news/[slug] emits JSON-LD. Add NewsArticle/ImageGallery for photo stories, Event for culture events, Product+Offer for listings, Person for contributors, Place for locations, BreadcrumbList everywhere. This unlocks rich results and Google Discover, which matters more than Twitter for this audience.

U5. Typography and identity are still "default shadcn with a gold primary". Inter is the body and heading face, Geist Sans is loaded but only referenced in a handful of shadcn primitives, and Geist Mono loads on every page for near-zero use. Dark mode is pure neutral grey. For an editorial masterpiece: pick one display face for headlines (a self-hosted variable serif such as Newsreader or Fraunces gives the "newspaper of record" feel), keep Inter for UI, drop Geist Sans, load Geist Mono only in admin. Introduce warm ink/paper tokens for dark mode rather than oklch(0.145 0 0).

U6. Reader controls promised in the spec are missing. Font-size control, lite/low-data mode and offline reading are in features.md §3 and §21 but nothing in the code implements them (contrast toggle and reduced-motion do exist, which is good). Add a reader toolbar on article pages: text size (persisted), lite mode (swap SmartImage to low-quality placeholders), save offline, and a sticky WhatsApp share on mobile.

U7. Search UX matches its backend: literal and unfaceted. Once A5 lands, the /search page should offer facets (type, place, category, date), highlighted snippets from ts_headline, recent searches (localStorage), and cross-locale results ("also found in French").

U8. Submit flow is one 659-line form. Guest submission is the core loop. On flaky connections a single long form with uploads is where people drop. Break it into steps with a progress rail, autosave the draft to localStorage after every field, make uploads resumable with per-file retry, show the moderation timeline (Submitted → In review → Published) on the confirmation page and in /account/submissions.

U9. Accessibility is well started but unverified. 419 aria-* attributes, a skip link, focus rings, contrast toggle and reduced-motion handling are present. There is no axe run, no keyboard-walk test, and the tiny-text issue in U1. Add @axe-core/playwright to the e2e suite and a manual 200 % zoom pass per shell.

U10. Admin ergonomics for a small editorial team. The command center is complete but moderation at volume needs keyboard shortcuts (j/k, a approve, r reject), saved queue filters, a side-by-side correction diff, and per-editor assignment. The 3.9k-line actions file (A7) also slows every admin route's cold start.

U11. Verification badges deserve to be a first-class visual language. The four trust states (Verified, Community, Official, Developing) are the product's transparency promise. Give them a consistent icon + colour + tooltip system used identically on cards, detail pages, notices and search results, and explain them on a /about/verification page linked from every badge.

Part 3: The masterpiece plan
Sequenced so that each phase unblocks the next and nothing regresses the gates that already exist. Effort is in focused engineer-weeks.

Phase 0: Lock in GitHub as control (done / verify only)

GitHub Actions (.github/workflows/ci.yml, scheduled-jobs.yml, db-push.yml) plus Dependabot stay canonical; no .gitlab-ci.yml work. Verify origin points at github.com/wgo26/eea, README badge passes, and one cron endpoint has received a call from a GitHub schedule.
Phase 1: Make it fast on a data plan (2 weeks)

Server-render header/footer; split public vs app dictionaries; add bundle budget gate.
Convert the 15 headers() pages to params; add ISR + cache tags to the remaining index pages.
Introduce <Suspense> boundaries for rails, ads, trending, polls, related content.
Short-circuit updateSession for anonymous requests.
Drop Geist Sans, scope Geist Mono to admin; add the display serif for headlines.
Hash-based CSP for the two bootstrap scripts. Acceptance: homepage JS ≤ 120 KB gzipped, p75 LCP < 2.5 s on a throttled "Slow 4G" Lighthouse run, no 'unsafe-inline' in script-src, all pages under (public) static or ISR except /search.
Phase 2: Harden the data layer (2 weeks)

Generate and commit database.types.ts; type both clients; CI diff gate.
Split lib/admin/actions.ts and queries.ts by domain.
Postgres full-text search: tsvector column, GIN, unaccent, pg_trgm, single RPC; rewrite lib/queries/search.ts and per-section searches on top of it.
Adopt zod for Server Function input schemas (or remove it).
RLS integration tests + Playwright smoke for the participation loop with axe. Acceptance: search returns ranked, accent-insensitive results in both locales under 100 ms on 10k rows; "editor cannot delete" fails as a test, not in production.
Phase 3: Editorial design system (2 weeks)

Token refresh: type scale with a 12 px floor, warm dark mode, elevation and motion scales, verification-badge system.
Card anatomy standardised across StoryCard, ListingCard, NoticeCard, EventCard, SearchResult.
Reader toolbar: text size, lite mode, offline save, sticky WhatsApp share.
JSON-LD on every public detail type + breadcrumbs.
Submit flow as stepped, autosaving, resumable form with moderation timeline. Acceptance: axe clean on every route in the e2e run; Rich Results Test passes for article, event, product, person; zero text-[10px] in the codebase.
Phase 4: Ship the differentiators (4 weeks)

Place-first: "Your place" selector, "Near you" homepage rail, lat/lng on locations, Leaflet map with clustered pins per content type on /locations/[place] and a new /map.
Eagle Eye Timeline: timeline_entries table, editor UI to append timestamped entries, live-updating article template with "Developing" badge, RSS item per update.
Community Memory: year-by-year archive view on location pages driven by published_at, plus photo_pairs for Then & Now with a slider component.
Eye on the Street micro-format: a content_type variant with a one-photo template and a Pidgin/Camfranglais share_text field used by the WhatsApp share button and the digest.
Offline PWA: Serwist service worker, offline fallback, saved-articles cache, Save-Data awareness.
Daily Brief upgrade: the existing digest fan-out gets a WhatsApp-first template with the five-line format from features.md Diff. #9. Acceptance: a reader in Mankon lands on /fr, is offered their place once, sees a local rail, opens a developing story that updates, and can read it later offline.
Phase 5: Operate like a newsroom (1 week, then continuous)

pg_dump → B2 nightly with encryption and a quarterly restore drill script.
Sentry SDK on server/client, web-vitals beacon, three SLOs with alert rules into the ops webhook.
Admin moderation shortcuts, saved filters, correction diff view, assignment.
Legacy Blogger redirect table backed by legacy_path. Acceptance: a simulated database loss is restored within one hour from B2; an error in a Server Function appears in Sentry with the correlation id already emitted by logger.
Phase 6: Launch discipline (ongoing) Two-locale manual sign-off per release using the checklist in architecture-checklist.md §12, WhatsApp handset preview check, Lighthouse CI budget in the pipeline, quarterly dependency and security review, and a public changelog so contributors see the platform improving.

Summary of priorities
If only three things happen: A2 + A3 (bundle and rendering, because the audience is on data plans), Phase 4.1 (place-first homepage and map, because that is the product's reason to exist), and Phase 2 search hardening (because discovery is the growth loop). A1 is resolved — GitHub is control. Everything else compounds on top of a codebase that is already unusually disciplined.