Where the project actually stands
Eagle Eye Africa is far past "prototype". Typecheck is clean, 231 tests pass (28 files), 58 migrations are gated,
CSP/HSTS/COOP headers ship, RLS plus capability guards plus audited Server Functions form a real
defense-in-depth chain, and the EN/FR parity test makes i18n drift a CI failure. Almost every item in
audit.md and architecture-checklist.md has genuinely landed. So this audit deliberately ignores what
those documents already cover and focuses on what I found by reading the code that the docs do not
mention.

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
A8. Test pyramid is a test column (Medium) 231 tests across 28 files: 203 unit tests (incl. parity, chrome, format, admin actions, reveal-contact, client-dict), 18 RLS integration invariants (D3 FIXED via `npm run test:rls`), 10 e2e a11y specs. The security model's real wall (RLS) is now covered by CI-blocking invariant tests — a dropped or widened policy fails the build (proven by negative test: dropping "Own/reviewable submissions" turns the suite red).

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
A15. PWA is installable but not offline-capable (Medium — implemented 2026-09-21) Offline reading shipped without a new dependency: hand-rolled public/sw.js (navigation network-first with locale offline fallback, /_next/image cache-first, visited story pages stale-while-revalidate trimmed to 50, explicit SAVE message), app/[locale]/(public)/offline/page.tsx with the saved-articles list, SaveOfflineButton on news articles (Cache API + localStorage index), ServiceWorkerRegister in the locale layout (production only), and Save-Data aware AdaptiveImage (quality ~35 on saveData/2G) on the article hero. INTENTIONAL DEVIATION: no Serwist/Workbox — a ~150-line worker covers the strategy matrix with zero bundle/toolchain cost; graduate to Serwist only if background-sync or precache-routing needs appear.
A16. Data model does not yet carry the differentiators (Strategic — implemented 2026-09-21) Tables landed in supabase/migrations/20261010000000_phase4_differentiators.sql: timeline_entries (+RLS), photo_pairs (+RLS), content_translations.share_text + voice_type, content_type 'micro_story', user_place_preferences, saved_articles. App wiring completed in the Phase 4 pass (see Phase 4 DONE notes). INTENTIONALLY NOT DONE: PostGIS geom/geography columns — locations.latitude/longitude (numeric) plus content→location inheritance via getMappedContent() plot everything the map needs; add a geom column only when radius queries arrive. Per-item lat/lng on content_items likewise deferred by design (single source of truth stays on locations).

Part 2: UI/UX audit
U1. Legibility floor is broken on mobile. (Implemented 2026-09-21) All 69 text-[10px] + 97 text-[11px] uses codemodded to text-xs (12px floor); hierarchy stays via uppercase + tracking. Enforcement: scripts/find-tiny-text.mjs (fails on any text-[<12px] in app/components/lib) wired into `npm run check`; the `text-floor` token documents the floor in app/globals.css.

U2. No streaming means "everything pops at once". With zero <Suspense>, the user sees a full-page skeleton, then the whole page. On 3G the perceived wait is the slowest query. Stream hero and headline first, rails second, ads and polls last.

U3. The homepage is a hub but not yet a place. (Implemented 2026-09-21) "Your place" selector (eea-place cookie, editable in the header via PlaceSelector) + first-visit PlacePrompt (offered once, localStorage dismissal) + "Near you: {place}" homepage rail (HomeNearYou) + clustered Leaflet pins per content type on /locations/[place] (LocationHubMap, golden-angle declustered) and /map (getMappedContent story pins). Map filters on /map are static checkboxes (visual only) — wire them client-side if filtering demand appears.

U4. Structured data is limited to news. Only news/[slug] emits JSON-LD. Add NewsArticle/ImageGallery for photo stories, Event for culture events, Product+Offer for listings, Person for contributors, Place for locations, BreadcrumbList everywhere. This unlocks rich results and Google Discover, which matters more than Twitter for this audience.

U5. Typography and identity are still "default shadcn with a gold primary". Inter is the body and heading face, Geist Sans is loaded but only referenced in a handful of shadcn primitives, and Geist Mono loads on every page for near-zero use. Dark mode is pure neutral grey. For an editorial masterpiece: pick one display face for headlines (a self-hosted variable serif such as Newsreader or Fraunces gives the "newspaper of record" feel), keep Inter for UI, drop Geist Sans, load Geist Mono only in admin. Introduce warm ink/paper tokens for dark mode rather than oklch(0.145 0 0).

U6. Reader controls promised in the spec are missing. (Implemented 2026-09-21) Unified ReaderToolbar (text size + lite toggle + save offline + WhatsApp, with a sticky WhatsApp action on mobile) mounted on news/photo-story/notice detail pages; lite mode persists per device (eea-lite) and forces AdaptiveImage low quality everywhere via useSaveData. Save offline (Cache API + /offline list) and font-size control pre-existed and are now composed into the toolbar.

U7. Search UX matches its backend: literal and unfaceted. Once A5 lands, the /search page should offer facets (type, place, category, date), highlighted snippets from ts_headline, recent searches (localStorage), and cross-locale results ("also found in French").

U8. Submit flow is one 659-line form. Guest submission is the core loop. On flaky connections a single long form with uploads is where people drop. Break it into steps with a progress rail, autosave the draft to localStorage after every field, make uploads resumable with per-file retry, show the moderation timeline (Submitted → In review → Published) on the confirmation page and in /account/submissions.

U9. Accessibility is well started but unverified. 419 aria-* attributes, a skip link, focus rings, contrast toggle and reduced-motion handling are present. There is no axe run, no keyboard-walk test, and the tiny-text issue in U1. Add @axe-core/playwright to the e2e suite and a manual 200 % zoom pass per shell.

U10. Admin ergonomics for a small editorial team. The command center is complete but moderation at volume needs keyboard shortcuts (j/k, a approve, r reject), saved queue filters, a side-by-side correction diff, and per-editor assignment. The 3.9k-line actions file (A7) also slows every admin route's cold start.

U11. Verification badges deserve to be a first-class visual language. (Implemented 2026-09-21) Single TrustBadge component (icon + data-layer colour/label + tooltip, linking to /about/verification; link=false inside card links to avoid nested anchors) used identically on StoryCard, ListingCard-adjacent surfaces, NoticeCard, EventCard, SearchResult, spotlights, hero, fundraiser, and all detail headers; legacy components/verification-badge.tsx deleted; search results carry verification from the query; /about/verification explains all four states (sitemap-registered).

Part 3: The masterpiece plan
Sequenced so that each phase unblocks the next and nothing regresses the gates that already exist. Effort is in focused engineer-weeks.

Phase 0: Lock in GitHub as control (done / verify only)

GitHub Actions (.github/workflows/ci.yml, scheduled-jobs.yml, db-push.yml) plus Dependabot stay canonical; no .gitlab-ci.yml work. Verify origin points at github.com/wgo26/eea, README badge passes, and one cron endpoint has received a call from a GitHub schedule.
Phase 1: Make it fast on a data plan (2 weeks) — DONE 2026-09-21, removed per instruction

- Server-rendered header/footer: confirmed — PublicShell is an async server
  component receiving params-locale; only string slices cross to clients.
- Split public/app dictionaries + bundle budget gate: implemented as the
  static leak gate (scripts/verify-client-dictionary.mjs) plus the new
  scripts/verify-anon-bundle.mjs (root ships Inter-only, no remote fonts, no
  leak) wired into `npm run check`. A full @next/bundle-analyzer budget was
  intentionally NOT added (build cost on every check run).
- 15 headers() pages → params: done. All (public) pages resolve locale from
  params (zero next/headers reads left in app/); the 7 (focused) auth pages
  (login, mfa-challenge, reset-password, reset update, signup,
  auth-code-error, auth landing) were converted from getRequestLocale() to
  params this pass. Remaining getRequestLocale() users are (app) account +
  admin pages, which are authenticated/dynamic by design. (app) layouts are
  guard-owned, not locale-owned, so no conversion applies there.
- ISR + cache tags on remaining index pages: done where ISR is valid.
  Added `revalidate = 300` to /advertise, /locations/[place], /map (map's
  `force-dynamic` removed — Leaflet initialises in useEffect and all reads
  are cached). Filter/search-param index pages (news, buy-sell, notices,
  photo-stories, culture, events, search) stay dynamic BY DESIGN — a page
  that reads searchParams cannot be statically prerendered; their hot reads
  are cached under CACHE_TAGS with the 5-minute window instead.
- <Suspense> boundaries: homepage + map have shell-matched skeletons per
  rail. Index pages render synchronously from cached queries (no per-rail
  async islands to split); no change needed.
- Anonymous updateSession short-circuit: confirmed in proxy.ts
  (sb-*-auth-token fast path) — no change needed.
- Fonts: GeistSans (dead code — nothing read --font-geist-sans) dropped;
  root ships Inter-only; GeistMono scoped to the (app) subtree via
  app/[locale]/(app)/fonts.ts (was 58 KB unused on every public page).
  INTENTIONALLY NOT DONE: the "display serif for headlines" — headlines
  render in Inter (font-heading = --font-sans) and adding a serif would ADD
  font bytes against the data-plan budget. No font-display/serif utility is
  referenced anywhere; the audit's premise was stale.
- Homepage cookies() ISR fix: HomeNearYou read the place cookie with
  cookies() (opting the whole page out of ISR despite revalidate=300).
  Moved to HomeNearYouClient (client island reading document.cookie +
  fetching /api/places?place=); home-sections.tsx is now request-API-free.
- Hash-based CSP: INTENTIONALLY NOT DONE as specified. The audit asks for
  hashes AND no 'unsafe-inline' in script-src, but Next.js 16 ships RSC
  flight/bootstrap inline scripts whose hashes change per build — a static
  hash allowlist breaks hydration, and the documented nonce alternative
  requires dynamic rendering of every page (defeats ISR). Current posture
  kept: script-src 'self' + 'unsafe-inline' with script-src-attr 'none'
  (kills inline event-handler XSS), no unsafe-eval in production. The two
  bootstrap scripts' sha256 hashes are recorded here for reference:
  theme-init 'sha256-98d5gLooYySALC2j91N+UCYbhX3zM6o+KHBLc9L6kR0=',
  locale-init 'sha256-10eVgOxrOqT1jh//Btcg/JyFBjHkUih0SNqr1Rh1T8Q='.
- Acceptance deltas: homepage-JS ≤ 120 KB / LCP < 2.5 s / Lighthouse CI
  budget are NOT run here (no browser/Lighthouse in this environment);
  structural gates above are the committed enforcement. /search stays
  dynamic by design (query-driven), not an exception to fix.
Phase 2: Harden the data layer (2 weeks)

Generate and commit database.types.ts; type both clients; CI diff gate.
Split lib/admin/actions.ts and queries.ts by domain.
Postgres full-text search: tsvector column, GIN, unaccent, pg_trgm, single RPC; rewrite lib/queries/search.ts and per-section searches on top of it.
Adopt zod for Server Function input schemas (or remove it).
RLS integration tests + Playwright smoke for the participation loop with axe. Acceptance: search returns ranked, accent-insensitive results in both locales under 100 ms on 10k rows; "editor cannot delete" fails as a test, not in production.
Phase 3: Editorial design system (2 weeks) — DONE 2026-09-21, removed per instruction

Gates after the pass: tsc clean, full suite 189/189 green, bare-href/bg-images/tiny-text/sitemap/migration/cron/server-action/client-dictionary gates clean, ESLint 0 errors on touched files.

- Token refresh: 12px floor enforced (69 text-[10px] + 97 text-[11px] → text-xs; scripts/find-tiny-text.mjs in `npm run check`; `text-floor` token in globals.css); warm ink/paper dark mode (gold-hue chroma on all dark surfaces, brand gold untouched); elevation (shadow-card/shadow-lift) + motion (ease-standard) tokens, used by the shared card parts.
- Card anatomy: components/home/card-parts.tsx (CardShell/Cover/BadgeRow/Title/Meta/MetaItem) composed by StoryCard (grid+row), ListingCard, NoticeCard (spine kept, bare locale-less href fixed), SearchResult, and the newly extracted EventCard (was inline in culture/events). TrustBadge upgrade folded in (see U11).
- Reader toolbar: ReaderToolbar on news/photo-story/notice pages (text size, persisted lite toggle, offline save, WhatsApp + sticky mobile WA action); useSaveData honors the explicit lite flag.
- JSON-LD: lib/seo/jsonld.ts builders; ImageGallery (photo-stories), Article (culture, notices), Event (events), Product+Offer (buy-sell), Person (contributors), Place (locations) + BreadcrumbList on every detail page; ContentBreadcrumb added to contributors/events/locations; /about/verification and /street and /offline and /map registered in STATIC_PATHS.
- Submit flow: stepped form kept, plus per-type localStorage autosave with restored-draft notice + discard (use-submit-draft.ts, hydration-safe), per-file upload retry in MediaUploader (failed File refs re-sent only; localized copy via MediaField), and the ModerationTimeline (Submitted → In review → Published/Rejected) on the confirmation page and every /account/submissions row.
- Acceptance replay: zero text-[10px] is a CI failure now; article/event/product/person schemas emit valid JSON-LD by construction (Rich Results Test itself is an external manual step); axe e2e NOT done — no e2e infra exists (A8 open), so "axe clean on every route" stays future work.
- Deliberately left: chunked/tus resumable uploads (single-shot + per-file retry covers flaky links at zero infra cost); U5 serif/display-face work (Phase 1 already decided Inter-only for the data-plan budget).
Phase 4: Ship the differentiators (4 weeks) — DONE 2026-09-21, removed per instruction

Tables already existed (migration 20261010000000: timeline_entries, photo_pairs, share_text/voice_type, micro_story, user_place_preferences, saved_articles); this pass built the app/UI layer. Gates after the pass: tsc clean, 190/191 unit tests green (the 1 failure is a pre-existing search.test.ts p_types null-vs-undefined mismatch in an untouched file), bare-href/sitemap/client-dictionary/migration/cron/server-action gates clean, ESLint 0 errors on touched files.

- Place-first: PlacePrompt first-visit once-dialog (components/locations/place-prompt.tsx, chrome-slice strings, mounted in SiteHeader) writing the same eea-place cookie; LocationHubMap on /locations/[place] with golden-angle declustered story pins; getMappedContent() (lib/queries/locations.ts) feeding clustered per-type pins to /map with a stories-on-map count. No PostGIS by design (see A16).
- Eagle Eye Timeline: TimelineSection on news/[slug] (live "Developing" rail, anchorable entries); lib/admin/actions-timeline.ts (manageContent-guarded create/update/delete + news-tag revalidation) + TimelineEditor client + /admin/content/timeline manager page (admin.content.timeline* strings); RSS per-update "Developing:" items + micro_story segment in app/rss.xml/route.ts.
- Community Memory: getPhotoPairsForPlace (lib/queries/photo-pairs.ts) + ThenNowSlider (keyboard-first range slider) + year-by-year published_at archive on /locations/[place].
- Eye on the Street: micro_story end-to-end — ContentType union + labels + admin typeFilters/TYPE_FILTERS/CONTENT_TYPES allowlist, news queries select type/share_text/voice_type (getNewsBySlug + getMicroStories), one-photo template markers (streetEyebrow badge + "Spotted in {place}") on news/[slug], /street index page (sitemap-registered), ArticleShare shareText preference, share_text/voice_type persistence via upsertTranslations + create/edit dialog fields, getContentItemEditData coverage.
- Offline PWA: hand-rolled public/sw.js + /offline fallback + SaveOfflineButton + ServiceWorkerRegister + AdaptiveImage Save-Data hero (see A15). No Serwist by design.
- Daily Brief: lib/digest/brief.ts pure builders (Diff. #9 caps, share-register lines, 1500-char template-safe truncation) + brief.test.ts (4 tests); ops-digest fan-out rewritten on top (per-type curation, story URLs not section links, archive shape unchanged).
- Acceptance replay: a reader in Mankon lands on /fr → PlacePrompt offers their place once → homepage Near-you rail → a developing story shows the live timeline (editors append via /admin/content/timeline, RSS carries each update) → Save offline → readable from /fr/offline without a network.
- Deliberately left: /map filter checkboxes are visual-only; saved_articles table has no server sync (Cache API + localStorage index cover offline); geom columns deferred (see A16).
Phase 5: Operate like a newsroom (1 week, then continuous) — implemented 2026-09-21 (A12 db-dump + A14 legacy redirects; moderation UI shortcuts deferred). Sentry SDK installed in this pass (D6 sampling tuned to 0.1 in production).

- pg_dump → B2 nightly: `/api/cron/db-dump` (CRON_SECRET-gated, pg_dump --format=custom → gzip → B2, SHA-256 recorded in new db_dumps tracking table with 30-day expires_at retention); wired as the SIXTH cron in vercel.json (45 2 * * *) and scheduled-jobs.yml (job `db-dump`, dispatchable individually or via `both`). uploadToB2() now takes an explicit bucket parameter (b2.ts + backup.ts callers updated). Restore drill: the db_dumps table carries the B2 filename + sha256 per run; `pg_restore --list` + row-count assertions are the quarterly manual step documented in the cron route doc comment (no live DB in this environment to rehearse against — the drill script's acceptance is infra-gated, not code-gated).
- Legacy Blogger redirects: `content_items.legacy_path` column + `legacy_redirects` table (migration 20261015000000) with an idempotent backfill from moderation_log.notes (source=<original Blogger /YYYY/MM/slug.html>); proxy.ts now loads the redirect map from the database with a 5-minute TTL cache and applies it BEFORE the locale redirect (A14). The blogger import (actions-import.ts) populates legacy_path at import time so every future import auto-registers its old URL. Public read RLS on the redirect table; anon-key client (safe for the proxy hot path).
- Sentry SDK + web-vitals beacon + SLOs: DONE. `@sentry/nextjs` (v10.75.1) is a production dependency, `withSentryConfig` wraps `next.config.ts`, and `sentry.client/server/edge.config.ts` forward warn/error events (with correlation-id plumbing from `lib/observability/logger.ts`) when `SENTRY_DSN` is set. Sampling tuned to 0.1 in production via `tracesSampler` (D6 fix) — error fidelity unaffected (errors inherit the parent transaction's sampling decision). Acceptance criterion ("an error appears in Sentry with the correlation id already emitted by logger") requires a live DSN to verify — see R3.
- Admin moderation shortcuts / saved filters / correction diff / assignment: NOT DONE this pass (Phase 3 leftovers per the audit summary).
- Gates after this pass: tsc --noEmit clean, 231/231 tests green (npm test), verify-crons OK (6 endpoints · 7 jobs), verify-migrations OK (58 migrations), verify-server-actions OK (18 files), verify-sitemap OK, verify-client-dictionary OK, find-bare-hrefs OK, find-bg-images OK, find-tiny-text OK, verify-anon-bundle OK, verify-security-posture OK (EEAD-002 gates), test:rls OK (54 migrations + 10 structural gates + 18 behavioral invariants).
Phase 6: Launch discipline (ongoing) Two-locale manual sign-off per release using the checklist in architecture-checklist.md §12, WhatsApp handset preview check, Lighthouse CI budget in the pipeline, quarterly dependency and security review, and a public changelog so contributors see the platform improving.

Summary of priorities
Phases 3 + 4 shipped 2026-09-21 (see DONE notes — the full vitest suite is green again including search.test.ts), and Phase 5 landed its code-side items the same day (db-dump → B2 cron + legacy Blogger redirect table; Sentry SDK installed this pass with production sampling tuned to 0.1). Moderation shortcuts (saved filters, correction diff, assignment) remain the only Phase 5 product gap. The remaining leverage is: Phase 2 search hardening (discovery is the growth loop), axe e2e once A8 lands infra, and U5/U8/U10 product work (typography, resumable uploads, moderation shortcuts). A1 is resolved — GitHub is control. Everything else compounds on top of a codebase that is already unusually disciplined.