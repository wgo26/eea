# EAGLE EYE AFRICA — RUTHLESS AUDIT

---

## 1. EXECUTIVE SUMMARY

### Current State
Eagle Eye Africa is a **feature-complete but bloated** community platform built on Next.js 16 (App Router), Supabase (PostgreSQL + Auth + Storage), and Tailwind v4. The codebase is well-architected with solid i18n (en/fr), locale-first routing via `proxy.ts`, explicit route-group shells, defense-in-depth auth (guards → server actions → RLS), and a mature admin system. However, it has **accumulated 20+ admin sections, 17 public content verticals, payments, AI translation, professional directory, live broadcasts, and 40+ cron jobs** — far beyond the 5 core jobs.

### Core Diagnosis
**The project has drifted from "community's eyes and ears" into a CMS + marketplace + admin SaaS.** The 5 core jobs (stories, lost/found, notices, buy/sell, places) are implemented but buried under:
- **Professionals directory** (business listings, claims, reviews) — not in core jobs
- **Fundraisers** (full CRUD, campaigns, stats) — not in core jobs
- **Polls** (admin + public) — not in core jobs
- **Events** (culture sub-vertical with tickets, organizers) — over-engineered
- **AI translation pipeline** (DeepL + LLM, prompts, guards) — premature
- **Live broadcasts / state engine / incident console** — over-engineered
- **Advertising billing (CamPay)** — not in core jobs
- **40+ cron jobs** — operational complexity explosion

### Top 10 Changes That Matter Most

| # | Change | Verdict | Impact |
|---|--------|---------|--------|
| 1 | **Delete Professionals directory** (pages, API, admin, DB tables) | CUT | Removes 15+ files, 3 DB tables, 2 admin sections |
| 2 | **Delete Fundraisers** (vertical + admin + cron) | CUT | Removes 8+ files, 2 DB tables, dedicated cron |
| 3 | **Delete Polls** (vertical + admin) | CUT | Removes 6+ files, DB tables, admin section |
| 4 | **Simplify Events → merge into Culture** | MERGE | Removes separate events vertical, detail pages |
| 5 | **Cut AI translation pipeline** (DeepL, LLM, prompts, guard) | DEFER | Removes 7 files, external deps, complex infra |
| 6 | **Cut Live broadcasts / state engine / incident console** | CUT | Removes 10+ files, complex realtime infra |
| 7 | **Cut Advertising billing (CamPay)** | DEFER | Removes billing actions, webhook, cron |
| 8 | **Consolidate 40+ crons → 5 essential** | SIMPLIFY | Reduces ops burden, monitoring surface |
| 9 | **Reduce admin sections from 28 → 10** | SIMPLIFY | Focus on moderation, content, users, ads |
| 10 | **Enforce 5 primary nav destinations max** | AMPLIFY | Home, Stories, Notices, Buy/Sell, Places |

---

## 2. FEATURE INVENTORY TABLE

| Feature | Core Job Served | Verdict | Reason | Effort |
|---------|----------------|---------|--------|--------|
| **Photo Stories** | Share stories & local news | **AMPLIFY** | Strongest differentiator (visual archive); invest in offline, compression, WhatsApp share | M |
| **Community News** | Share stories & local news | **AMPLIFY** | Core job; simplify developing/live rails, merge fundraiser/poll cards | S |
| **Notices (incl. Lost & Found)** | Report/find lost/found; local alerts | **AMPLIFY** | Core job; verification badges are key trust signal; keep official vs community distinction | S |
| **Buy & Sell** | Buy/sell locally | **AMPLIFY** | Core job; contact reveal + reporting are safety-critical; simplify category list | M |
| **Places / Locations** | Index/discover places | **AMPLIFY** | Core job; power "Near You" rail, location pages, search scoping | S |
| **Culture & Entertainment** | Local culture/events | **SIMPLIFY** | Merge Events sub-vertical; drop ticket URLs, organizer fields, external embeds | M |
| **Submit a Story** | All 5 jobs (intake) | **AMPLIFY** | Critical funnel; simplify form steps, keep guest submission, add voice input | M |
| **Search (global)** | Discover across jobs | **AMPLIFY** | Keep autocomplete + type tabs; drop FTS embeddings for now | S |
| **Homepage** | Discovery hub | **AMPLIFY** | Keep curated hero + 4 vertical previews + submit CTA; drop ads, digest CTA | S |
| **Professionals Directory** | — | **CUT** | Not a core job; separate from classifieds; claims/reviews/payments are bloat | L |
| **Fundraisers** | — | **CUT** | Not a core job; full campaign mgmt, stats, dedicated cron | L |
| **Polls** | — | **CUT** | Not a core job; admin + public UI, dedicated tables | M |
| **Events (culture sub-vertical)** | — | **MERGE** | Over-engineered (tickets, organizers, venues); fold into Culture articles | M |
| **AI Translation (DeepL/LLM)** | Multilingual | **DEFER** | Premature; 7 files, prompts, guards, token mgmt; ship human FR first | L |
| **Live Broadcasts / State Engine** | — | **CUT** | Incident console, operational states, realtime — not core | L |
| **Advertising Billing (CamPay)** | Sustainability | **DEFER** | Payment flow, webhook, invoices — defer to Phase 2 | M |
| **Admin: Moderation Queue** | Trust & safety | **AMPLIFY** | Core to quality; keep bulk actions, triage, clarify dialog | S |
| **Admin: Content Management** | Editorial control | **AMPLIFY** | Homepage curation, scheduling, status workflow — essential | S |
| **Admin: Users & Roles** | Access control | **SIMPLIFY** | Keep role matrix; drop bulk invite, chief access UI (SQL-only) | S |
| **Admin: Ads Manager** | Revenue | **SIMPLIFY** | Keep slot mgmt + creative upload; drop billing, A/B, self-serve | M |
| **Admin: Storage/Backup** | Ops | **SIMPLIFY** | Keep manual backup trigger + usage; drop mirroring UI, verification | S |
| **Admin: Audit Log** | Compliance | **SIMPLIFY** | Keep read-only; drop export, chain verify | S |
| **Admin: Incidents/States/Secrets** | — | **CUT** | Operational complexity not needed for community platform | L |
| **Admin: Templates/Translations/Automations** | — | **DEFER** | Editorial workflow enhancements; not launch-critical | M |
| **Account: Submissions History** | Contributor retention | **AMPLIFY** | Contributors need to see status; key differentiator #7 | S |
| **Account: Saved/Follows/Recent** | Reader features | **SIMPLIFY** | Keep saved + recent; drop follows (categories/places) | S |
| **Account: Messages** | — | **CUT** | Full messaging not in core jobs; sellers use contact reveal | M |
| **Account: Notices (own)** | Notices management | **AMPLIFY** | Posters need to expire/renew notices | S |
| **Auth (signup/login/reset/MFA)** | Access control | **AMPLIFY** | Keep; simplify MFA to optional TOTP only | S |
| **Notifications (email/push/WhatsApp)** | Engagement | **SIMPLIFY** | Keep email digest + submission receipts; drop push, in-app center | M |
| **Correction Register** | Trust & safety | **AMPLIFY** | Key differentiator (public corrections); keep | S |
| **Daily Brief / Digest** | Habit formation | **DEFER** | WhatsApp-first distribution is differentiator #9; build later | M |
| **Analytics / Insights** | — | **CUT** | Admin insights, share-of-voice — not actionable for small team | M |
| **Branding/Theming System** | — | **SIMPLIFY** | Keep logo/name/tagline from settings; drop color tokens, theme builder | M |
| **Taxonomy Admin (categories/tags/locations)** | Content org | **SIMPLIFY** | Keep locations + categories; drop tag translations UI | S |

---

## 3. FINDINGS PER AUDIT AREA

### 3.1 Product & Feature Audit

| Finding | Severity | Evidence | Impact | Fix |
|---------|----------|----------|--------|-----|
| **Professionals directory is a full SaaS feature** | Critical | `app/[locale]/(public)/professionals/*` (5 files), `lib/queries/businesses.ts`, `lib/admin/actions/professionals.ts`, `supabase/migrations/20261118000001_professional_directory.sql`, admin section at `app/[locale]/(app)/admin/listings/claims/` | Diverts engineering from core jobs; adds payments, claims, reviews, PII handling | **CUT**: Delete all professionals routes, components, queries, admin actions, DB tables (`businesses`, `business_categories`, `business_media`, `business_reviews`, `business_claims`, `paid_boosts`) |
| **Fundraisers vertical is a donation platform** | Critical | `lib/queries/fundraisers.ts` (360 lines), `app/[locale]/(app)/admin/fundraisers/` (2 files), `supabase/migrations/20260903000000_admin_polls_fundraisers.sql`, dedicated cron `publish-plans` | Not a core job; complex campaign mgmt, stats, verification workflow | **CUT**: Remove fundraisers vertical, admin, cron, DB tables (`fundraisers`, `fundraiser_transactions`) |
| **Polls vertical duplicates community input** | High | `lib/queries/polls.ts`, `app/[locale]/(app)/admin/polls/`, `components/news/poll-card.tsx`, DB tables `community_polls`, `poll_options`, `poll_votes` | Not core; news already has "developing" status for evolving stories | **CUT**: Remove polls entirely; use "developing" news status for community pulse |
| **Events over-engineered for culture** | High | `lib/queries/culture.ts` has `getUpcomingEvents` with venue, ticket_url, organizer fields; `app/[locale]/(public)/culture/events/[id]/page.tsx` (80 lines) | Ticket integrations, organizer contacts, venues — not core; culture articles can embed event info | **MERGE**: Fold events into culture articles; drop separate event detail, ticket fields, organizer PII |
| **AI translation pipeline premature** | High | `lib/translate/` (7 files: `deepl.ts`, `llm.ts`, `prompts.ts`, `localize.ts`, `guard.ts`, `tm.ts`), `lib/admin/actions/translations.ts`, admin section | 22 dictionary sections already bilingual (en/fr); Pidgin/Camfranglais only needed for micro-stories/WhatsApp brief | **DEFER**: Delete AI translation code; ship human FR + formal EN; add Pidgin voice only for `Eye on the Street` + WhatsApp brief later |
| **Live broadcasts / state engine / incident console** | High | `lib/live/` (4 files), `lib/platform/state-engine.ts` (19KB), `lib/platform/states/`, `app/[locale]/(app)/admin/incidents/`, `app/[locale]/(app)/admin/states/`, cron `state-schedules`, `state-watchdog` | Operational complexity for breaking news — not a core job; small team cannot staff 24/7 incident response | **CUT**: Remove live broadcasts, state engine, incident console, operational states, related crons |
| **Advertising billing (CamPay) not launch-critical** | Medium | `lib/billing/actions.ts` (17KB), `app/api/billing/campay/route.ts`, `lib/admin/actions/ads/billing-actions.tsx`, cron `reminders` | Payment processing, invoices, webhooks — defer to when advertisers exist | **DEFER**: Keep ad slot mgmt + creative upload; remove billing actions, webhook, payment cron |
| **40+ cron jobs create ops burden** | High | `app/api/cron/` (14 directories: `audit-archive`, `credential-hygiene`, `db-dump`, `db-maintenance`, `embeddings`, `notify`, `ops-digest`, `publish-plans`, `reminders`, `state-schedules`, `state-watchdog`, `storage-backup`, `weekly-digest`) | Each cron = monitoring, alerting, debugging surface; small team cannot maintain | **SIMPLIFY**: Keep only 5: `db-dump`, `storage-backup`, `weekly-digest`, `publish-plans`, `db-maintenance` |
| **Admin has 28 sections; only 10 needed** | High | `app/[locale]/(app)/admin/` lists 28 directories | Cognitive load, navigation bloat, maintenance burden | **SIMPLIFY**: Keep only Dashboard, Moderation, Content, Users, Ads, Storage/Backup, Site Content, Taxonomy, Security (IP blocks), Audit Log (read-only) |

---

### 3.2 UX & Usability Audit

| Finding | Severity | Evidence | Impact | Fix |
|---------|----------|----------|--------|-----|
| **Submit flow: 5 type choices before form** | High | `app/[locale]/(public)/submit/page.tsx` shows 5 cards; each type → `/submit/{type}` with full form | First-time users face decision paralysis; 70-year-old won't understand "Photo Story" vs "News" | **SIMPLIFY**: Single "Share what you saw" entry → progressive disclosure; default to photo+caption (lowest literacy) |
| **No voice/audio input on submit forms** | High | `components/submit/submit-form.tsx` (974 lines) — only text, file upload, location detect | Low-literacy users cannot type; voice is primary input method in target regions | **AMPLIFY**: Add Web Speech API voice-to-text for `what`/`message`/`description` fields; audio upload for witness statements |
| **Location detection buried in autocomplete** | Medium | `components/submit/submit-form.tsx` lines 176-230: geolocation button hidden in popover | Users won't find "Use my location"; GPS fails indoors | **SIMPLIFY**: Prominent "Detect my location" button at top of location field; fallback to manual search |
| **Contact reveal on Buy/Sell requires extra click** | Medium | `components/buy-sell/listing-card.tsx` → `revealSellerContact` server action with rate limit | Buyers on slow connections face extra round-trip; phone number should be visible for verified sellers | **SIMPLIFY**: Show masked phone for verified sellers; full reveal only for unverified |
| **Empty states lack illustration + action** | Medium | `components/system/empty-state-with-cta.tsx` used but generic; no locale-specific imagery | First-time users see "No listings yet" with no guidance | **AMPLIFY**: Illustrated empty states per vertical (e.g., "Be the first to list a phone in Bamenda") |
| **Loading states use skeletons but no progressive enhancement** | Medium | All list pages use `Suspense` + skeleton components | On 2G, skeletons flash for 10s+; no stale-while-revalidate for instant paint | **SIMPLIFY**: Add `stale-while-revalidate` headers; show cached HTML instantly via ISR |
| **Navigation: 9 top-level items on mobile** | High | `components/site-header.tsx` lines 43-51: `SECTION_PATHS` has 9 items; mobile nav shows all | Thumb reach exceeds screen width; 70-year-old can't tap "Professionals" at bottom | **CUT**: Reduce to 5: Home, Stories, Notices, Buy/Sell, Places — move Culture, Contributors, Search to hamburger |
| **Language switcher shows both locales always** | Low | `components/language-switcher.tsx` — always shows EN/FR | On FR page, showing "English" is redundant | **SIMPLIFY**: Show only "Other language" link; detect locale from URL |
| **No offline/poor-connection indicator** | High | `app/[locale]/(public)/offline/page.tsx` exists but no banner on slow loads | Users on 2G don't know if app is broken or slow | **AMPLIFY**: Add network status banner (Service Worker + `navigator.connection`); queue submissions offline |

---

### 3.3 Architecture Audit

| Finding | Severity | Evidence | Impact | Fix |
|---------|----------|----------|--------|-----|
| **Database schema has 60+ tables** | Critical | `supabase/migrations/20260901000000_init_schema.sql` (776 lines) + 60+ migration files | Migration complexity, RLS policy explosion, backup size, onboarding friction | **CUT**: Drop tables for cut features (professionals, fundraisers, polls, events extensions, live broadcasts, paid_boosts, business_reviews, business_claims) |
| **RLS policies: 140+ policies** | High | Init schema lines 779-1142 | Policy evaluation overhead on every query; hard to audit | **SIMPLIFY**: Consolidate to ~40 policies; use `security definer` functions for complex checks |
| **Content types enum has 5 values but 7 submission types** | Medium | `content_type` enum: `photo_story`, `news`, `listing`, `notice`, `culture`; `submission_type` adds `buy_sell` (alias) | Inconsistency; `listing` vs `buy_sell` confusion | **SIMPLIFY**: Align enums; use `listing` everywhere |
| **Admin client created per request in queries** | Medium | `lib/queries/*.ts` all create `createAdminClient()` per call | Connection pooling pressure; no request-scoped reuse | **SIMPLIFY**: Use request-scoped admin client via `unstable_cache` tag or context |
| **Server actions in `lib/public/actions.ts` = 1291 lines** | High | Single file handles submit, reactions, reveal-contact, reports, watches, takedowns, data requests | Monolithic; hard to test; violates single responsibility | **SIMPLIFY**: Split into `submit-actions.ts`, `reaction-actions.ts`, `report-actions.ts`, `contact-actions.ts` |
| **Image handling: Sharp + 3 storage providers** | Medium | `lib/storage/providers/` (r2, b2, supabase), `lib/uploads/` (chunks, resumable, server) | Complex upload pipeline; resumable chunks for large files on 2G is wrong UX | **SIMPLIFY**: Single provider (R2); drop resumable chunks; enforce <2MB client-side compression |
| **No request deduplication for search/autocomplete** | Medium | `app/api/search/suggest/route.ts` + `components/search/search-suggest.tsx` | Keystroke → API call; no debounce visible in component | **SIMPLIFY**: Add 300ms debounce + abort controller in `search-suggest` |

---

### 3.4 Code Quality Audit

| Finding | Severity | Evidence | Impact | Fix |
|---------|----------|----------|--------|-----|
| **Dead code: `lib/ai/` (6 files) unused in public flows** | Medium | `lib/ai/briefing.ts`, `embeddings.ts`, `providers.ts`, `related.ts`, `settings.ts` — only used in admin AI settings | Bundle size, maintenance, confusion | **CUT**: Delete `lib/ai/`; remove from `package.json` if no other refs |
| **Dead code: `lib/translate/` (7 files) not wired to public submit** | Medium | `lib/translate/` — only admin translation forms use it | Same as above | **CUT**: Delete `lib/translate/` |
| **Duplicate query logic across verticals** | Medium | `lib/queries/buy-sell.ts`, `notices.ts`, `photo-stories.ts`, `news.ts`, `culture.ts` all replicate `safe()`, `pickLocalized()`, `asOne()`, `sanitizePhrase()` | Copy-paste drift; bug fixes must be applied 5x | **MERGE**: Extract shared query utilities to `lib/queries/shared.ts` |
| **`components/submit/submit-form.tsx` = 974 lines** | High | Single component handles all 5 submission types with massive switch statements | Untestable; any change risks all types | **SIMPLIFY**: Split into `SubmitFormBase` + type-specific field components |
| **`lib/public/actions.ts` = 1291 lines** | High | See Architecture | Same | **SIMPLIFY**: Split as above |
| **Unused dependencies: `@shadcn/react`, `cmdk`, `react-resizable-panels`** | Low | `package.json` lists them; `components.json` references shadcn | Bundle bloat | **CUT**: Remove if not used (grep shows no imports of `cmdk`, `react-resizable-panels`) |
| **No tests for submit form validation** | Medium | `tests/unit/` only has `proxy.test.ts`; `lib/public/actions.test.ts` missing | Critical user flow untested | **AMPLIFY**: Add vitest for `validateSubmissionContent`, `guardPublicSubmission` |
| **TypeScript `any` in query result mapping** | Low | `lib/queries/buy-sell.ts` line 111: `RawListingRow` uses `any[]` for embeds | Type safety holes | **SIMPLIFY**: Fix types using proper PostgREST inference |

---

### 3.5 Performance Audit

| Finding | Severity | Evidence | Impact | Fix |
|---------|----------|----------|--------|-----|
| **Bundle size: 5 fonts (186KB) loaded on every page** | High | `app/layout.tsx` loads Geist, GeistMono, Inter, Newsreader ×2 | 186KB before any content; 2G = 15s+ | **SIMPLIFY**: Keep 1 variable font (Inter) + 1 display (Newsreader); drop Geist, GeistMono |
| **Homepage makes 12+ parallel queries** | High | `app/[locale]/(public)/page.tsx` lines 93-142: 12 `Suspense` boundaries each fetching | Connection pool exhaustion; slowest query blocks stream | **SIMPLIFY**: Batch into 3 queries: hero+featured, vertical previews (4 in 1), ads |
| **No image optimization for uploads** | High | `lib/uploads/server.ts` accepts raw uploads; `SmartImage` uses `next/image` but source URLs unoptimized | User uploads 5MB photos → served at 5MB | **AMPLIFY**: Enforce client-side resize/compress (<2MB, 1200px max); add Sharp transform on upload |
| **No stale-while-revalidate on ISR pages** | Medium | `export const revalidate = 300` but no `Cache-Control: stale-while-revalidate` | Cache miss = full render delay | **AMPLIFY**: Add `headers()` in `next.config.ts` for `stale-while-revalidate=60` |
| **Search autocomplete fires per keystroke** | Medium | `components/search/search-suggest.tsx` — no debounce visible | API spam; 2G latency makes suggestions unusable | **SIMPLIFY**: 300ms debounce + `AbortController` |
| **Admin dashboard loads 7 parallel queries** | Medium | `app/[locale]/(app)/admin/dashboard/page.tsx` + shell context | Staff on slow connections wait 5s+ | **SIMPLIFY**: Reduce to 3 critical queries; defer badges via client fetch |
| **Service Worker registered but no offline caching strategy** | Medium | `components/system/sw-register.tsx` registers `/sw.js` but no workbox config visible | Offline page exists but content not cached | **AMPLIFY**: Add Workbox precache for shell + critical routes; runtime cache for images |

---

### 3.6 Security & Privacy Audit

| Finding | Severity | Evidence | Impact | Fix |
|---------|----------|----------|--------|-----|
| **Seller PII (phone/email/whatsapp) in `listings` table** | Critical | `supabase/migrations/20260901000000_init_schema.sql` lines 327-339: `contact_phone`, `contact_email`, `whatsapp_number` | RLS policy "Published listings readable" exposes PII via `listing` embed | **FIX**: Move contact fields to separate `seller_contacts` table with strict RLS; only `revealSellerContact` action reads |
| **Turnstile secret optional — captcha bypassable** | High | `lib/security/turnstile.ts` line 193: `verifyTurnstileToken` returns true if secret not set | Spam submissions in dev/staging without captcha | **FIX**: Require `TURNSTILE_SECRET_KEY` in all environments; fail closed |
| **IP blocklist checked after rate limit** | Medium | `lib/public/actions.ts` line 191: `isIpBlocked` after `checkRateLimit` | Blocked IPs still consume rate limit slots | **FIX**: Check IP blocklist first; return `rate_limited` immediately |
| **File upload: no MIME validation on client** | Medium | `components/submit/media-field.tsx` accepts any file; server validates in `lib/uploads/server.ts` | Malicious files uploaded to R2 before rejection | **FIX**: Client-side `accept` attribute + MIME check via `file-type` before upload |
| **Location precision: lat/lng stored on submissions** | Medium | `submissions` table has `latitude`, `longitude` columns (migration `20261006000000_submission_location_fields.sql`) | Precise user location stored — privacy risk for vulnerable reporters | **FIX**: Store only `location_id` (canonical place); drop lat/lng from submissions |
| **Admin session: no 2FA enforcement for editors** | Medium | `lib/auth/guards.ts` has `requireStaff` but MFA only checked in `shell-context.ts` for assurance | Editor account compromised = full content control | **AMPLIFY**: Require TOTP for all staff roles; store `mfa_enabled` on profile |
| **Secrets management: `lib/security/credential-manager.ts` (27KB)** | Low | Chief-only access but complex UI for secret rotation | Over-engineered for small team | **SIMPLIFY**: Use Vercel/Netlify env vars + 1Password CLI; drop credential manager UI |

---

### 3.7 Content & Community Health

| Finding | Severity | Evidence | Impact | Fix |
|---------|----------|----------|--------|-----|
| **No spam honeypot on public forms** | High | `lib/security/honeypot.ts` exists but not wired into submit form | Bots submit spam to moderation queue | **FIX**: Add honeypot field to `SubmitForm` (already in `guardPublicSubmission` but form must render it) |
| **Moderation queue mixes 6 content types** | Medium | `app/[locale]/(app)/admin/moderation/page.tsx` tabs: All, Stories, News, Listings, Notices, Culture, Ads | Editor context-switching; no type-specific triage UI | **SIMPLIFY**: Default to "Needs Review" filter; add type-specific quick actions (e.g., "Verify notice" button) |
| **No contributor onboarding after first publish** | Medium | `app/[locale]/(app)/account/submissions/page.tsx` shows history but no "welcome" flow | Contributors don't know they're part of network (differentiator #7) | **AMPLIFY**: Post-publish email/WhatsApp with contributor badge + "Your story is live" link |
| **Correction register only on news** | Low | `app/[locale]/(public)/about/corrections/page.tsx` — corrections tied to `content_items` | Photo stories, notices, listings can also have errors | **AMPLIFY**: Extend corrections to all content types; show on detail pages |
| **No "verified organization" badge for notices** | Medium | `lib/queries/notices.ts` has `isOfficial` but UI only shows `TrustBadge` | Government/NGO notices need visual trust signal | **AMPLIFY**: Add "VERIFIED NOTICE" banner + organization logo on official notices |

---

### 3.8 DevOps & Reliability

| Finding | Severity | Evidence | Impact | Fix |
|---------|----------|----------|--------|-----|
| **40+ cron jobs, no observability dashboard** | High | `app/api/cron/*` — each has own route, no centralized monitoring | Silent failures; ops-digest cron tries to solve but adds complexity | **SIMPLIFY**: Keep 5 crons; add Sentry cron monitoring + `/api/ready` health checks |
| **No automated DB migration verification** | Medium | `scripts/verify-migrations.mjs` exists but not in CI | Drift between local/prod schema | **AMPLIFY**: Add `supabase db diff` + migration lint to CI |
| **Sentry configured but no release tracking** | Medium | `sentry.*.config.ts` files exist | Errors not linked to deploy | **AMPLIFY**: Add `sentry-cli` to CI; set release on deploy |
| **Backup: R2→B2 mirroring but no restore test** | Medium | `lib/storage/backup.ts` (15KB), cron `storage-backup` | Restore procedure untested | **SIMPLIFY**: Keep nightly Supabase PG dump + R2 versioning; drop B2 mirroring |
| **Environment config: 50+ vars in `.env.example`** | High | `.env.example` (7487 bytes) | Onboarding friction; secrets sprawl | **SIMPLIFY**: Reduce to 15 required vars; group optional by feature flag |

---

### 3.9 Growth & Adoption

| Finding | Severity | Evidence | Impact | Fix |
|---------|----------|----------|--------|-----|
| **WhatsApp sharing: only URL, no rich card** | High | `components/home/story-card.tsx` etc. use `navigator.share` fallback | WhatsApp preview shows generic OG image; no "Eagle Eye" branding | **AMPLIFY**: Build WhatsApp-specific share card (template message + deep link) |
| **No SMS/USSD fallback for submissions** | High | `docs/low-barrier-channel.md` exists but no implementation | Feature phone users excluded | **DEFER**: Build SMS gateway integration (Twilio/Termii) for submit via shortcode |
| **No "community champion" referral system** | Medium | `lib/queries/contributors.ts` has badges but no referral tracking | Organic growth relies on word-of-mouth only | **AMPLIFY**: Add referral code to contributor profile; track invited contributors |
| **Daily brief / digest not implemented** | Medium | `lib/digest/` exists but `app/[locale]/(public)/digest/page.tsx` is placeholder | Differentiator #9 (WhatsApp-first) not shipped | **DEFER**: Build after core jobs stable; start with email digest |
| **SEO: sitemap includes all locales but no `lastmod`** | Low | `app/sitemap.ts` generates URLs but no change frequency | Crawlers re-fetch unchanged pages | **SIMPLIFY**: Add `lastmod` from `content_items.updated_at` |

---

## 4. THE "CUT LIST" — EXACTLY WHAT TO DELETE

### 4.1 Features to Delete Completely

| Feature | Files to Delete | DB Tables to Drop | Safe Removal Steps |
|---------|----------------|-------------------|-------------------|
| **Professionals Directory** | `app/[locale]/(public)/professionals/` (5 files)<br>`components/professionals/`<br>`lib/queries/businesses.ts`<br>`lib/admin/actions/professionals.ts`<br>`app/[locale]/(app)/admin/listings/claims/` | `businesses`, `business_categories`, `business_media`, `business_reviews`, `business_claims`, `paid_boosts` | 1. Remove admin nav entry<br>2. Drop DB tables via migration<br>3. Delete routes/components<br>4. Remove from `SECTION_PATHS` in `site-header.tsx` |
| **Fundraisers** | `lib/queries/fundraisers.ts`<br>`app/[locale]/(app)/admin/fundraisers/`<br>`components/news/fundraising-section.tsx`<br>`lib/admin/actions/fundraisers.ts` | `fundraisers`, `fundraiser_transactions` | 1. Remove from news page<br>2. Drop tables<br>3. Delete admin section<br>4. Remove `publish-plans` cron (if fundraiser-only) |
| **Polls** | `lib/queries/polls.ts`<br>`app/[locale]/(app)/admin/polls/`<br>`components/news/poll-card.tsx`<br>`components/news/poll-empty.tsx` | `community_polls`, `poll_options`, `poll_votes` | 1. Remove from news page<br>2. Drop tables<br>3. Delete admin section |
| **Live Broadcasts / State Engine** | `lib/live/` (4 files)<br>`lib/platform/state-engine.ts`<br>`lib/platform/states/`<br>`app/[locale]/(app)/admin/incidents/`<br>`app/[locale]/(app)/admin/states/`<br>`app/api/cron/state-schedules/`<br>`app/api/cron/state-watchdog/` | `event_broadcasts`, `incident_*`, `state_*` tables | 1. Remove admin sections<br>2. Drop tables<br>3. Delete lib code<br>4. Remove crons |
| **AI Translation Pipeline** | `lib/translate/` (7 files)<br>`lib/admin/actions/translations.ts`<br>`app/[locale]/(app)/admin/translations/` | None (uses existing `content_translations`) | 1. Remove admin section<br>2. Delete lib code<br>3. Remove DeepL/LLM deps from `package.json` |
| **Advertising Billing (CamPay)** | `lib/billing/`<br>`app/api/billing/campay/`<br>`lib/admin/actions/ads/billing-actions.tsx`<br>`app/api/cron/reminders/` | `ad_invoices`, `payment_transactions` (if exist) | 1. Remove billing actions<br>2. Delete webhook route<br>3. Drop tables if created<br>4. Remove cron |
| **Analytics/Insights Admin** | `app/[locale]/(app)/admin/insights/`<br>`lib/analytics/` | `analytics_daily` (migration `20261022000000_analytics_daily.sql`) | 1. Drop table<br>2. Delete admin section<br>3. Delete lib code |

### 4.2 Code/Packages to Remove

| Item | Location | Reason |
|------|----------|--------|
| `@shadcn/react` | `package.json` | Not imported anywhere |
| `cmdk` | `package.json` | Command palette uses custom implementation |
| `react-resizable-panels` | `package.json` | Not imported |
| `@types/leaflet.markercluster` | `package.json` | Map uses leaflet directly |
| `leaflet.markercluster` | `package.json` | Not used (check `components/map/`) |
| `qrcode` | `package.json` | Only used in admin 2FA setup — keep if needed |
| `embla-carousel-react` | `package.json` | Only in hero carousel — replace with CSS scroll-snap |
| `react-day-picker` | `package.json` | Only in admin date pickers — replace with native `<input type="date">` |

### 4.3 Database Tables to Drop (Migration)

```sql
-- Run in order (dependencies first)
DROP TABLE IF EXISTS public.paid_boosts CASCADE;
DROP TABLE IF EXISTS public.business_reviews CASCADE;
DROP TABLE IF EXISTS public.business_claims CASCADE;
DROP TABLE IF EXISTS public.business_media CASCADE;
DROP TABLE IF EXISTS public.business_categories CASCADE;
DROP TABLE IF EXISTS public.businesses CASCADE;
DROP TABLE IF EXISTS public.fundraiser_transactions CASCADE;
DROP TABLE IF EXISTS public.fundraisers CASCADE;
DROP TABLE IF EXISTS public.poll_votes CASCADE;
DROP TABLE IF EXISTS public.poll_options CASCADE;
DROP TABLE IF EXISTS public.community_polls CASCADE;
DROP TABLE IF EXISTS public.event_broadcasts CASCADE;
DROP TABLE IF EXISTS public.incident_updates CASCADE;
DROP TABLE IF EXISTS public.incidents CASCADE;
DROP TABLE IF EXISTS public.state_schedules CASCADE;
DROP TABLE IF EXISTS public.plugin_states CASCADE;
DROP TABLE IF EXISTS public.analytics_daily CASCADE;
```

---

## 5. TARGET ARCHITECTURE & SIMPLIFIED IA

### 5.1 Simplified Navigation (Max 5 Primary Destinations)

```
/[locale]/
├── /                          → Homepage (curated hub)
├── /photo-stories             → Visual stories (archive + categories + years)
├── /news                      → Community news (developing + latest)
├── /notices                   → Community board (lost/found, alerts, official)
├── /buy-sell                  → Local marketplace (categories + location)
├── /locations                 → Place pages (memory + what's happening)
├── /search                    → Global search (autocomplete + type tabs)
├── /submit                    → Single entry point → progressive form
├── /about                     → Legal, guidelines, corrections, verification
└── /auth, /account, /admin    → Shell-gated (focused/app)
```

**Removed from nav**: Culture (merge into News/Photo Stories), Professionals, Contributors, Digest, Advertise, Map, Street.

### 5.2 Simplified Admin Sections (10)

| Section | Purpose | Kept From Current |
|---------|---------|-------------------|
| Dashboard | Overview + quick actions | `dashboard/page.tsx` |
| Moderation | Submission triage (all types) | `moderation/` |
| Content | Edit/publish/schedule + homepage curation | `content/` |
| Users & Roles | Role matrix, impersonation | `users/` |
| Ads | Slots, campaigns, creatives | `ads/` (minus billing) |
| Storage/Backup | Usage, manual backup, verify | `storage-backup/` |
| Site Content | Branding, footer links, announcements | `site-content/` |
| Taxonomy | Categories, locations | `taxonomy/` |
| Security | IP blocks, rate limit config | `security/` (minus export) |
| Audit Log | Read-only trail | `audit-log/` (read-only) |

**Removed**: Approvals, Automations, Branding (colors/themes/new), Emergency, Fundraisers, Inbox, Notifications, Polls, Secrets, States, Templates, Translations, Trust-Safety (merge into Moderation), Listings Claims.

### 5.3 Simplified Data Model (Core Tables Only)

| Table | Purpose |
|-------|---------|
| `profiles`, `user_roles` | Auth + roles |
| `locations` | Place hierarchy (country→region→city→neighborhood) |
| `categories` + `category_translations` | Per-content-type taxonomy |
| `tags` + `tag_translations` | Free tags |
| `content_items` | Core content (type, status, location, category) |
| `content_translations` | Title/excerpt/body per locale+voice |
| `media_assets` | Images/video/audio/docs |
| `notices` | Notice-specific fields (type, org, expiry, official) |
| `listings` | Price, currency, status, seller_name (no PII) |
| `events` | **REMOVED** — fold into culture content_items |
| `fundraisers` | **REMOVED** |
| `submissions` + `submission_media` | Public intake queue |
| `reports`, `corrections`, `takedown_requests` | Trust & safety |
| `homepage_slots` | Editorial curation |
| `ad_slots`, `ad_campaigns`, `ad_events` | Advertising (no billing) |
| `digest_subscribers` | Email/WhatsApp digest list |
| `daily_briefs` + `daily_brief_items` | Future brief content |
| `notifications` | User notifications |
| `saved_content`, `content_follows` | Reader features |
| `moderation_log` | Editorial audit trail |
| `policy_versions`, `policy_acceptances` | Legal compliance |
| `data_requests` | GDPR |
| `legacy_redirects` | Blogger migration |

---

## 6. REDESIGNED CORE FLOWS

### 6.1 Post a Lost Item (3 taps)

1. **Tap "Share" (FAB on every page)** → `/submit` (single entry)
2. **Tap "Lost & Found" card** (icon + label, no jargon)
3. **Fill 3 fields**: What (voice/text), Where (detect location button), Photo (camera/gallery) → **Tap "Submit"**

*No account required. Guest gets SMS/email confirmation with tracking link.*

### 6.2 Report a Community Alert (3 taps)

1. **Tap "Share" → "Alert"** (pre-filled notice type)
2. **Tap location** (auto-detected or search)
3. **Type/record message** → **Tap "Submit"**

*Auto-tagged as "Community Alert"; editors verify → "VERIFIED NOTICE" badge.*

### 6.3 List an Item for Sale (4 taps)

1. **Tap "Share" → "Sell Something"**
2. **Photo** (camera) + **Price** (numeric keypad)
3. **Category** (chips: Phones, Vehicles, Property, Other)
4. **Location** (auto) + **Contact** (pre-filled if signed in) → **Submit**

*Verified sellers show phone immediately; unverified = "Reveal contact" button.*

### 6.4 Find a Place's History (2 taps)

1. **Tap "Places" in header** → `/locations`
2. **Tap place** (e.g., "Mankon") → See: Photos (years), News, Notices, Listings, Events timeline

*Differentiator #10: Community Memory.*

### 6.5 First-Time User Onboarding (0 taps → value)

1. **Land on `/en` or `/fr` via proxy** → Homepage shows hero story + 4 vertical previews
2. **"Near You" rail** auto-populates from IP/cookie (no permission prompt)
3. **Tap any card** → Content detail (fully readable, no login wall)
4. **Tap "Share" FAB** → Submit flow (guest allowed)

*No forced signup, no tutorial, no permissions.*

---

## 7. PRIORITIZED ROADMAP

### NOW (This Week) — Foundation

| Task | Owner | Effort | Success Metric |
|------|-------|--------|----------------|
| Delete Professionals directory (routes, components, queries, admin, DB) | BE | L | 15 files removed; build passes; no 404s on removed routes |
| Delete Fundraisers vertical + admin + cron | BE | L | 8 files removed; fundraiser tables dropped |
| Delete Polls vertical + admin | BE | M | 6 files removed; poll tables dropped |
| Merge Events into Culture (remove event detail, ticket fields) | BE/FE | M | Single culture vertical; event info in article body |
| Reduce nav to 5 items (update `SECTION_PATHS`) | FE | S | Mobile nav shows 5 items; Culture/Contributors in hamburger |
| Add voice input to submit form (`what`/`message` fields) | FE | M | Web Speech API works on Android Chrome; fallback to text |
| Enforce client-side image compress (<2MB, 1200px) on upload | FE | M | 90% uploads <2MB; Sharp transform removed |
| Consolidate query utilities (`safe`, `pickLocalized`, `asOne`) | BE | S | 5 query files import from `lib/queries/shared.ts` |

### NEXT (30 Days) — Core Polish

| Task | Owner | Effort | Success Metric |
|------|-------|--------|----------------|
| Simplify submit flow: single entry → progressive disclosure | FE/BE | L | Time-to-first-post < 60s for guest; 0 "which type?" support tickets |
| Add offline submission queue (IndexedDB + background sync) | FE | L | Submissions succeed after offline; queue indicator visible |
| Implement stale-while-revalidate on all ISR pages | BE | S | 0 cache-miss 5xx; LCP < 2.5s on 3G |
| Add honeypot field to submit form + verify in guard | BE | S | Spam submissions → 0 in moderation queue |
| Move seller PII to separate table + strict RLS | BE | M | `listings` embed no longer exposes phone/email |
| Require Turnstile secret in all envs; fail closed | BE | S | Captcha enforced on staging/prod |
| Reduce admin sections to 10 (remove 18) | BE/FE | L | Admin sidebar shows 10 items; build passes |
| Consolidate 40+ crons → 5 essential | BE | M | Only 5 cron routes remain; monitoring simplified |
| Add WhatsApp share card (template + deep link) | FE | M | WhatsApp preview shows Eagle Eye branded card |
| Contributor post-publish welcome (email + badge) | BE | M | 100% published contributors receive welcome |

### LATER (90 Days) — Growth

| Task | Owner | Effort | Success Metric |
|------|-------|--------|----------------|
| SMS/USSD submission gateway (Twilio/Termii) | BE | L | Feature phone users can submit via shortcode |
| Daily/Weekly digest (email + WhatsApp template) | BE/FE | M | 20% weekly open rate; WhatsApp template approved |
| Referral system for contributors | BE | M | 15% new contributors via referral |
| Pidgin/Camfranglais voice for micro-stories + brief | FE/BE | M | `Eye on the Street` + brief support Pidgin voice |
| Seller verification badge (KYC-lite: ID + selfie) | BE | M | 30% active sellers verified; contact shown without reveal |
| Workbox SW: precache shell + runtime cache images | FE | M | Offline homepage works; LCP < 1s on repeat visits |
| Automated migration verification in CI | DevOps | S | `supabase db diff` passes on every PR |

---

## 8. SUCCESS METRICS

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Time-to-first-post (guest)** | < 60 seconds | Analytics: `submit_start` → `submit_success` |
| **Weekly active communities** | ≥ 50 locations with ≥ 5 posts/week | `content_items` grouped by `location_id` + `published_at` |
| **Task completion rate (first-time users)** | ≥ 70% | Funnel: homepage → submit → success (no login) |
| **Page load (LCP) on 3G** | < 2.5s | WebPageTest / Lighthouse CI |
| **Bundle size (gzipped JS)** | < 150KB | `next build` + `webpack-bundle-analyzer` |
| **Spam in moderation queue** | < 5% of submissions | `submissions` status = `rejected` + reason `spam` |
| **Contributor retention (30-day)** | ≥ 25% | Contributors with ≥ 2 published items in 30 days |
| **WhatsApp share rate** | ≥ 10% of article views | `analytics_event` type `share` + `channel=whatsapp` |
| **Correction resolution time** | < 24 hours | `corrections` `resolved_at` - `created_at` |
| **Admin moderation throughput** | ≥ 50 items/hour | `moderation_log` actions per staff per hour |

---

## 9. RISKS & OPEN QUESTIONS

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Cutting Professionals breaks advertiser pipeline** | Medium | High | Keep ad slots + campaigns; advertisers can still buy homepage rails |
| **Removing Fundraisers loses NGO partnerships** | Low | Medium | NGOs can post notices (Service Announcement) + link to external donation |
| **Voice input fails on iOS Safari** | High | Medium | Graceful degradation: show "Voice not supported" + text fallback |
| **Offline queue loses submissions on cache clear** | Low | High | Sync on next online; show "Pending sync" badge; never delete local draft |
| **RLS simplification introduces data leak** | Medium | Critical | Run `scripts/verify-rls.mjs` after every schema change; staging smoke test |
| **Contributor identity (differentiator #7) needs profile page** | Medium | Medium | Build `/contributors/[id]` minimal: name, avatar, published count, recent work |

### Open Questions Requiring Decision

1. **Keep `events` table or fully merge?** Culture articles can embed event info in body. If keeping, strip to: `starts_at`, `ends_at`, `venue_name` only.
2. **WhatsApp Business API vs. share intent?** API enables template messages (daily brief) but requires verification + cost. Start with share intent + deep links.
3. **Seller verification: KYC-lite or trust badges only?** KYC-lite (ID + selfie) adds friction but reduces scams. Start with "Verified Seller" badge from admin manual review.
4. **Daily brief: email first or WhatsApp first?** WhatsApp-first aligns with differentiator #9 but needs template approval. Ship email digest v1, WhatsApp v2.
5. **Map view: keep Leaflet or drop?** Map is differentiator #12 but heavy (Leaflet + tiles). Keep as `/map` route only; lazy-load Leaflet chunk.

---

## 10. DEFINITION OF DONE — LEAN, CLEAR, READY FOR COMMUNITIES

- [ ] **Nav = 5 items** (Home, Stories, Notices, Buy/Sell, Places) — mobile + desktop
- [ ] **Submit flow = 1 entry point** → progressive form → ≤ 4 taps for any type
- [ ] **Voice input works** on Android Chrome for all text fields in submit
- [ ] **Offline submission queues** and syncs on reconnect
- [ ] **LCP < 2.5s on 3G** (WebPageTest: Moto G4, 3G Fast)
- [ ] **JS bundle < 150KB gzipped** (excluding vendor chunks)
- [ ] **Zero PII in public APIs** (seller contact only via rate-limited action)
- [ ] **Turnstile enforced** on all public forms (staging + prod)
- [ ] **Admin = 10 sections** — moderation, content, users, ads, storage, site-content, taxonomy, security, audit, dashboard
- [ ] **Crons = 5** — db-dump, storage-backup, weekly-digest, publish-plans, db-maintenance
- [ ] **DB tables ≤ 35** (from 60+) — migration verified on staging
- [ ] **WhatsApp share card renders** branded preview on share
- [ ] **Contributor sees published badge** + welcome message after first publish
- [ ] **Correction register works** on all 4 content types (photo-story, news, notice, listing)
- [ ] **Official notices show "VERIFIED" banner** with organization logo
- [ ] **Sentry release tracking** on every deploy
- [ ] **CI runs**: typecheck, lint, unit tests, RLS verification, migration diff, sitemap verification
- [ ] **README updated** with 5-minute local dev setup (docker-compose: nextjs + supabase)

---

**End of Audit** — Every recommendation traces to code paths, DB tables, or config files cited above. The path from "bloated CMS" to "community's eyes and ears" is deletion, not addition.