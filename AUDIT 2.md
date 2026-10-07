EAGLE EYE AFRICA — RUTHLESS AUDIT
Evidence from: app/[locale]/, components/ (282 files), lib/ (343 files), supabase/migrations/ (93 files, 109 tables), package.json, proxy.ts, features.md, sitemap.md, architecture-checklist.md, SECURITY.md.
1. Executive summary
Current state: A well-engineered CMS masquerading as a community tool. Locale-first routing (proxy.ts), guard→capability→RLS defense-in-depth (lib/auth/guards.ts, lib/auth/capabilities.ts, 239 RLS policies), bilingual dictionaries (lib/i18n/en.ts 1498 lines / en-app.ts 3603 lines), correction register (/about/corrections), WhatsApp OG images — all genuinely good.
Core diagnosis: You built 5 jobs into ~25 products. The 5 north-star jobs (stories, lost/found, notices, buy/sell, places) are buried under: Professionals directory + claims + reviews + MoMo subscriptions, live broadcasts + chat + RSVP, polls + fundraisers + reactions, digest + daily-brief + 13 crons, ads manager + paid boosts, branding engine + theme versions, AI pro-editor + 4 translate engines + embeddings, 30-section admin, 109 tables. A 70-year-old cannot post a lost goat in this. A trader on 2G cannot load Leaflet + Sentry + dual UI libs to sell tomatoes.
Worse: Job #2 (lost/found) has no home. It's a notice_type enum value inside /notices (features.md:154-155), not a first-class 3-tap flow. The thing villagers need most is a filter chip.
Top 10 changes that matter:
 1. Make Lost & Found first-class. Promote from notices.notice_type to top-level tab + dedicated /submit/lost-found 3-tap flow. This is your killer feature. Everything else is secondary.
 2. Collapse navigation to 5 destinations. Today: news, photo-stories, street, culture, events, professionals, locations, map, contributors, digest, search, advertise + 9 about pages. Target: Home, Stories, Notices, Market, Places. See §5.
 3. Kill Professionals as separate product. MERGE businesses, business_claims, business_reviews, /professionals/* into /locations/[place] + Market seller rows. You have two directories and zero staff to moderate both.
 4. Delete live broadcasts, polls, fundraisers, reactions from v1. Tables event_broadcasts, event_broadcast_chats, polls, poll_votes, fundraisers, content_reactions + lib/live/, components/live/, components/events/ live-chat. YouTube/FB Live links in a text field replace all of it.
 5. Freeze admin at 5 screens. 30 sections in app/[locale]/(app)/admin/ → Moderation, Content, Notices/Market, Users, Settings. Hide ads, branding, automations, insights, states, emergency, secrets UI, translations, templates, branding behind APP_FLAGS or delete. Small team cannot operate a newsroom OS.
 6. Replace ProEditor with textarea + 1 photo button. components/admin/pro-editor.tsx + aiSelectionAssist + lib/ai/ + lib/translate/{deepl,llm,tm,localize}.ts is hostile to low-end Android and low literacy. ContentEditable + 8-card AI rail is the opposite of "elder can post."
 7. Cut storage to 2 backends, cut UI to 1 lib. Delete lib/storage/providers/{b2,cloudinary}.ts, lib/storage/cloudinary.ts, @shadcn/react, embla-carousel-react, react-day-picker, react-resizable-panels, cmdk, leaflet-defaulticon-compatibility, 45 unused components/ui/* files. Keep R2 + Supabase, @base-ui/react only.
 8. Rotate the leaked service-role key NOW. SECURITY.md:70-74 admits the leak. Everything else is theater until SUPABASE_SERVICE_ROLE_KEY + CREDENTIAL_ENCRYPTION_KEY are rotated.
 9. Ship offline-first reading + SMS/WhatsApp ingest stub. public/sw.js caches but no queued-submit, no USSD/SMS fallback (features.md:731 promised, never built). Lost/found must work on failed network.
10. Delete 13-cron sprawl → 4 crons. app/api/cron/ has 13 routes (audit-archive, db-dump, embeddings, publish-plans, state-*, weekly-digest, etc.) vs 5 documented. Keep publish, notify, db-maintenance, storage-backup. Park embeddings, audit-archive, weekly-digest.
2. Feature inventory table
Core jobs: J1 stories/news, J2 lost/found, J3 notices/alerts, J4 buy/sell, J5 places/businesses. — = serves none.
Feature	Core job	Verdict	Reason	Effort
News index/detail app/[locale]/(public)/news/	J1	AMPLIFY	Core. Keep, simplify filters to place+search only.	S
Photo-stories photo-stories/	J1	MERGE	Same job as news. Merge into single Stories feed; keep photo template as display variant.	M
Eye-on-Street /street/page.tsx	J1	MERGE	50-word micro-story (features.md:623) is the RIGHT format for low literacy — make it the default submit, not a separate page.	S
Culture + Events + live broadcast/chat/RSVP culture/, events/, lib/live/, event_broadcasts, event_broadcast_chats	J1	CUT (live) / SIMPLIFY (culture)	Events list = J3 notice. Live chat/RSVP/broadcast = bloat for small team; YouTube link suffices.	M
Notices + expiry + verified notices/, notices table	J3	AMPLIFY	Core. Promote Lost&Found and Missing Person out of filter into hero actions.	S
Lost & Found (today: notice_type enum)	J2	AMPLIFY	Missing as first-class. Build dedicated flow; highest trust/retention value.	M
Buy-sell index/detail/post (focused)/buy-sell/post/	J4	AMPLIFY	Core. Simplify: 1 photo, price, phone, place. Cut price-watches, promotions, ratings for v1.	S
Contact-reveal + listing_conversations + messages account/messages/	J4	SIMPLIFY	Keep PII-gated reveal (SECURITY.md:47 good). CUT in-app chat — WhatsApp deep-link replaces listing_conversation_messages table.	M
Places/locations locations/[place], locations table	J5	AMPLIFY	Differentiator #3 place-first. Make it the town square, not a stub.	M
Map /map, components/locations/location-map.tsx, leaflet+markercluster	J5	DEFER	150KB JS on 2G for a directory with 10 places. Static place list first; map behind flag.	S
Professionals directory /professionals/, businesses, business_claims, business_reviews, professional_subscriptions	J5	MERGE	Duplicates J5 + J4 seller profiles. Fold into place pages. Claim flow keep, storefronts cut.	L
Search + suggest /search, app/api/search/suggest	all	SIMPLIFY	Keep one box, no filters except type. Cut FTS unaccent configs complexity (20261009000001).	S
Submit pipeline (focused)/submit/* (5 types) + moderation queue	all	SIMPLIFY	5 forms → 1 form: What? Photo? Where? Contact? Type auto-detected. Guest submit keep.	M
Contributors /contributors/[id]	J1	SIMPLIFY	Keep credit line only. Cut stats/portfolio/follows (contributor_follows table).	S
Digest/daily-brief digest/, digest_issues, digest_slots, daily_briefs + weekly-digest cron	—	DEFER	Habit product with no users yet. WhatsApp forward of 3 links beats digest_personalization tables.	S (hide)
Polls/votes/reactions polls, poll_votes, content_reactions + news/poll-actions.ts	—	CUT	Engagement theater. Zero value before 10k readers; moderation cost.	S
Fundraisers fundraisers table + /admin/fundraisers	—	CUT	Payments + fraud + regulation you cannot handle. Park until MoMo trust proven.	S
Live events/broadcasts	—	CUT	See above.	M
Ads manager ad_slots, ad_campaigns, ad_events + /admin/ads + /advertise + paid boosts listing_promotions, price_watches	—	DEFER	No traffic = no advertisers. Keep static /advertise contact page, delete manager + increment_ad_event() + atomic guard migration.	M
MoMo billing lib/billing/, app/api/billing/campay, professional_subscriptions	—	DEFER	Built before demand (docs/billing-momo.md). Keep code flagged off, do not staff it.	S (flag)
Branding engine lib/branding/, /admin/branding/*, brand_themes, brand_assets, 19 tokens	—	CUT	Inert tokens (shadows.card, typography.* have no consumer per checklist item 13). Hardcode 1 theme.	M
AI ProEditor + lib/ai/, lib/translate/* (4 engines), embeddings 20261115000000 + match_content_embeddings	—	CUT	content-form.tsx 1773 lines. LLM budget + llm_calls table + vector ext = cost + complexity anti-sustainability.	M
States/emergency/system_states/contextual_states + automations + insights + taxonomy + templates + translations admin	—	CUT/DEFER	system_states, state_schedules, emergency_publish_events, translation_jobs, translation_memory, content_templates — ops theater for 2-person team.	M
Secrets/credentials UI /admin/secrets/*, api_credentials, credential_events, two-person control	—	SIMPLIFY	Keep key rotation in dashboard/CLI, not 3-screen UI + two_person_approvals table for a 2-person team.	S
Account: saves/follows/notifications/recent saved_content, content_follows, notifications, notification_outbox, price_watches	—	CUT (most)	Keep submissions-status + listings only. Cut follows/saves/personalized feed — no retention data to justify.	S
Messages/chat	—	CUT	features.md:490 explicitly WON'T HAVE full messaging. You built it anyway. Delete listing_conversation_messages.	S
PWA/offline public/sw.js, app/manifest.ts	all	AMPLIFY	Only perf bet that matters. Fix gaps (queued submit, LCP priority).	S
Corrections register /about/corrections, published_corrections view	J1	AMPLIFY	Best trust feature shipped. Keep, promote badge on every story.	S (keep)
About/legal 9 pages about/*	—	SIMPLIFY	Keep terms/privacy/guidelines/contact. Merge verification/corrections/guide/copyright into 1 trust page.	S
3. Findings per audit area
Product (Critical)
- Lost/found invisible. Evidence: only mention features.md:154 as enum; no /lost-found route; /notices mixes road closures + missing persons. Impact: core job unfindable by elder/trader. Fix: top-level Notices tab with two big cards: Lost / Found + Missing Person.
- Two directories. Evidence: /locations/[place] + /professionals/[slug] + businesses table + 20261118000001_professional_directory.sql. Impact: double moderation, double empty states. Fix: professionals → section inside place page.
- WON'T-HAVE violations. Evidence: features.md:489-499 forbids full messaging, sophisticated ad marketplace, over-engineered analytics. Reality: listing_conversation_messages, /admin/ads, /admin/insights, /admin/automations, analytics_daily, llm_calls. Fix: delete per Cut List.
UX (Critical)
- Submit too hard. Evidence: (public)/submit/page.tsx + 5 (focused)/submit/* + (focused)/buy-sell/post/page.tsx = 7 entry points; ContentForm 1773 lines. Persona walk: 70yo must choose among photo/news/culture/notice/buy-sell (jargon), then ProEditor contentEditable, bilingual bodies, tags, SEO, share line. Fix: 1 screen, 4 fields, voice-note optional (§6).
- No low-literacy path. Evidence: en.ts/fr.ts only; Pidgin overlay promised (features.md:709-717) only as share-text; no audio, no font-scale control shipped, find-tiny-text.mjs gate exists but tap-target audit open (architecture-checklist.md:341 🟡). Fix: Pidgin voice for Street + Lost/Found first; 48px targets; numbered steps with icons.
- Navigation sprawl. Evidence: sitemap.md:10-24 lists 13 top-level; header must fit news/photo/notices/market/culture/places/map/contributors + advertise. Impact: trader on 320px (tests/e2e/viewport-320.spec.ts exists but thin) cannot find Market. Fix: §5 IA.
- Empty/error states inconsistent. Evidence: page-skeletons.tsx exists (good) but per-page empty states vary; degraded home (en.ts:83 degradedTitle) good pattern — extend everywhere with next-action CTA.
Architecture (High)
- God form + lib sprawl. Evidence: app/[locale]/(app)/admin/content/content-form.tsx:1773 allowlisted in verify-admin-lib-size.mjs; lib/ 52 top entries; duplicate formatters lib/i18n/index.ts:formatDate vs lib/admin/format.ts vs lib/format.ts. Fix: split form by job (story/notice/listing), unify format utils.
- 109 tables for 5 jobs. Evidence: migration scan (§1 task output). content_items + submissions + notices + listings + events + businesses + 15 notify/digest + 10 ads/billing + 8 intelligence/embedding + 12 ops/audit. Small team cannot migrate safely (93 files). Fix: freeze new migrations; delete per Cut List with compensating migration.
- 13 crons, 5 documented. Evidence: vercel.json + app/api/cron/* vs README.md "five". Dual scheduler: Vercel crons dead on Hostinger, real is .github/workflows/scheduled-jobs.yml. Fix: 4 crons + delete workflow mirrors + verify-crons.mjs update.
- Offline half-built. Evidence: public/sw.js:1-161 hand-rolled, no Workbox; caches articles but no background-sync submit queue; SAVE/SAVED messaging present but registration unverified. Fix: add queued-submit + "we'll send when network returns" receipt.
Code quality (High)
- Dead/duplicated deps. Evidence: package.json:38,46 — leaflet-defaulticon-compatibility zero imports, @types/leaflet.markercluster in deps not dev; @shadcn/react for 2 files (questionnaire.tsx, message-scroller.tsx) while @base-ui/react covers ~40; embla/command/day-picker/resizable/input-otp single-use each. components/ui/ 60-61 files for a news/marketplace. Fix: cut list + bundle-analyzer budget.
- Duplicate OG images. Evidence: 5× opengraph-image.tsx + twitter-image.tsx under news/photo/buy-sell/notices/culture. Fix: single lib/seo/og-image.tsx.
- Dual submit trees, dual date formatters. Fix above.
- Tests lib-heavy, flow-empty. Evidence: ~81 lib/**/*.test.ts, zero component tests, 3 e2e files, no submit→approve→publish path. Fix: add 2 e2e (guest lost-found post; trader listing post on throttled 3G).
Performance (High)
- Good: AVIF-first (next.config.ts:69-82), SmartImage + CARD_SIZES/THUMB_SIZES + Save-Data quality~35 (adaptive-image.tsx:57-112), self-hosted Inter/Newsreader, font ban gate (verify-anon-bundle.mjs), 1.5MB/3MB LHCI bytes (lighthouserc.cjs).
- Bad: Leaflet (~150KB) loaded for /map + place pages; Sentry 10.x on client; dual UI libs; admin raw <img> bypasses optimizer (media-picker.tsx:154, storage-backup/page.tsx:201); no priority on hero LCP (hero-slide.tsx:40); no bundle budget, only structural gates. Impact: fails 2G/expensive-data constraint. Fix: defer map, lazy qrcode, hero priority, next/image everywhere, add bundle-analyzer limit 250KB first-load public.
- Behavior on 2G: network-first SW helps reading, but submit with 3 photos + ProEditor JS will time out. Fix: compress client-side (already sharp server-side — add client resize to 1280px/70KB), 1-photo default, progress + resume.
Security/privacy (Critical)
- Leaked service key. Evidence: SECURITY.md:70-74 + .env.example SUPABASE_SERVICE_ROLE_KEY. Fix: rotate in Supabase dashboard + R2/B2/SMTP/Campay, record date in SECURITY.md, redeploy. Owner: you. Effort: 1h. Metric: old key 401s.
- Anon intake permissive by design. Evidence: submissions, reports, corrections, poll_votes WITH CHECK (true) + Turnstile optional (TURNSTILE_SECRET_KEY unset = open). lib/security/turnstile.ts fail-closed only in prod if configured; TURNSTILE_REQUIRE=1 flagged launch blocker. Fix: require Turnstile + check_rate_limit() + honeypot on all public POST before launch.
- PII good but recent. Evidence: public_listings_safe view, contact-reveal rate-limited action, 20261120000001_business_pii_revokes.sql. Keep. Extend: strip EXIF GPS on upload (sharp already — verify), never render phone in HTML (audit buy-sell/[id]/page.tsx).
- Cron/auth hardening good. Evidence: CRON_SECRET fail-closed, READY_PROBE_SECRET separate, assertReauth + assertTwoFactor on destructive (lib/admin/auth.ts 306 call sites), proxy.ts never blocks (correct — guards do). Keep.
- Uploads: file-type + magic-byte + sharp + per-IP limit per SECURITY.md — verify size caps ≤2MB public, 10/min/IP.
Content/community health (High)
- Strengths to keep: pre-publish moderation, moderation_log, reports, corrections + public register, verified/official/developing badges (en.ts:18-29), contributor credit line.
- Gaps: no scam playbook for Market (no "meet in public, no advance MoMo" interstitial), no duplicate detection without AI (keep simple trigram pg_trgm — already installed — not embeddings), no champion toolkit (printable poster + WhatsApp group template). Spam: Postgres rate_limit_hits + blocked_ips exists but no admin UX surfaced in 5-screen cut — keep minimal block button.
- Incentives: contributor profiles overbuilt; replace with simple "Your posts: 3 published" SMS/WhatsApp receipt + name-in-print. Cut contributor_follows, price_watches, content_follows.
DevOps/reliability (Medium)
- Dual deploy (Vercel crons + Hostinger VPS deploy/vps/) = drift. Evidence: deploy/hostinger-business.md, eea.service, scripts/build.mjs Turbopack→webpack fallback. Fix: declare Hostinger canonical, Vercel reference-only; document in architecture-checklist.md.
- Monitoring: Sentry traces 0.1 prod (good, no replay for data-plan), lib/observability/metrics.ts, /api/ready + /api/health. Missing: external uptime (recommended in scheduled-jobs.yml:20-23 but not wired), backup restore drill (restore-drill.yml exists — run it quarterly).
- Env: .env.example 161 lines — too many. Cut Cloudinary/B2/LLM/DeepL vars with code deletion.
Growth (High)
- WhatsApp-first is real (share buttons, OG images, qr-share-button.tsx) — AMPLIFY. Missing: SMS/USSD fallback (promised features.md:731, absent), local-champion onboarding (no poster, no training script), voice-note submit (critical for low literacy), Pidgin share text (spec'd, not shipped). Digest email exists but premature — replace with "forward to WhatsApp group" CTA + copy-paste Daily Brief text.
4. Cut List — exactly what to delete
Rule: each deletion ships as: flag-off → hide nav → migration (drop table/view) → delete code → npm run check + build.
A. Features/routes to delete (hide first):
1. /map (app/[locale]/(public)/map/) + /culture/events/* live pages + /digest/* + /brand-preview/* + /buy-sell/post duplicate (keep /submit/buy-sell) + /street standalone (fold into Stories filter).
2. /admin/{ads,branding/*,automations,insights,states,emergency,incidents/*,translations,templates,secrets/*,storage-backup,security,audit-log,polls,fundraisers,taxonomy,policies,media,notifications} — keep dashboard,moderation,content,approvals(→moderation),listings/claims,trust-safety,inbox,users,digest(→hide),site-content(→settings). Target 5.
3. /account/{follows,saved,recent,notifications,messages/*,security} — keep dashboard,listings,notices,submissions,profile.
B. Code/libs:
- components/live/, components/events/*chat*, lib/live/, docs/live-broadcasts.md, docs/billing-momo.md (archive).
- components/admin/{pro-editor.tsx,theme-editor.tsx,command-center.tsx,viz.tsx} + lib/branding/, lib/ai/, lib/translate/, lib/automation/, lib/digest/ (or flag).
- components/ui/{carousel,calendar,resizable,menubar,navigation-menu,drawer,chart*,questionnaire,message-scroller,bubble,marker} + @shadcn/react, embla-carousel-react, react-day-picker, react-resizable-panels, cmdk, input-otp (verify one-use then delete), leaflet, leaflet.markercluster, leaflet-defaulticon-compatibility, @types/leaflet* (after map defer), qrcode → lazy or delete (use text link).
- lib/storage/providers/{b2,cloudinary}.ts, lib/storage/cloudinary.ts, lib/storage/backup.ts (keep R2+Supabase), sharp keep (server only).
- Per-detail opengraph-image.tsx/twitter-image.tsx ×5 → one shared.
C. Packages (package.json): remove leaflet*×3, @shadcn/react, embla-carousel-react, react-day-picker, react-resizable-panels, cmdk, input-otp (if unused in flows), qrcode (or lazy). Move @types/leaflet.markercluster → dev then delete. Move js-yaml → dev (only scripts/verify-crons.mjs).
D. Tables/migrations (new compensating migration 20261201000000_lean_cut.sql): drop event_broadcasts, event_broadcast_chats, event_rsvps, event_reminders, polls, poll_options, poll_votes, fundraisers, content_reactions, content_follows, contributor_follows, price_watches, listing_conversation_messages (keep listing_conversations header or drop both — decide: drop both, use WhatsApp), listing_promotions, listing_ratings, ad_slots, ad_campaigns, ad_events, ad_inquiry_events, professional_subscriptions, business_reviews (or keep if merged — else drop), digest_slots, digest_issues, daily_briefs, daily_brief_items, publish_plans, translation_jobs, translation_memory, content_templates, two_person_approvals (replace with single-admin + audit), api_credentials/credential_events (if secrets UI cut — else keep), emergency_publish_events, emergency_publishing_presets, contextual_states, state_schedules, system_state_themes, system_states (keep one site_settings row), brand_themes, brand_theme_versions, brand_assets, branding_assets, llm_calls, embeddings (vector col), timeline_entries (fold into content_items body), photo_pairs (fold into media). Keep: content_items, content_translations, media_assets, notices, listings, locations, categories, tags, submissions+reviews, reports, corrections, businesses (merged), business_claims, profiles, user_roles, moderation_log, audit_events (one, not two), notifications (minimal), legacy_redirects.
Safe steps: pg_dump first (supabase/migrations/20261015000001_db_dumps.sql infra exists), deploy off-peak, DROP ... CASCADE guarded, regenerate DB types (npm run types:db), run test:rls.
E. Crons: keep publish-plans→publish, notify, db-maintenance, storage-backup. Delete audit-archive, credential-hygiene, db-dump (→ manual), embeddings, ops-digest, reminders, state-schedules, state-watchdog, weekly-digest. Update vercel.json, scheduled-jobs.yml, scripts/verify-crons.mjs.
F. Env vars to remove: CLOUDINARY_*, B2_*, LLM_*, DEEPL_*, DIGEST_WEBHOOK_URL (if digest deferred).
Effort totals: deps/UI S (1 day), admin hide S (2 days), tables L (1 week with backup + RLS re-test).
5. Target architecture + simplified IA
Architecture (lean):
Next.js 16 App Router, app/[locale]/{(public),(focused),(app)} — unchanged (good)
proxy.ts — sole redirect (unchanged)
Supabase: Auth + Postgres (40 tables, not 109) + Storage (R2 public, Supabase private)
lib/: queries/ (5 per job), submit/, moderation/, i18n/ (en/fr + pidgin share strings), media/smart-image, security/turnstile+rate-limit
No: lib/ai, lib/translate×4, lib/live, lib/branding, lib/automation, embeddings/vector
Client JS budget: <250KB first load; Leaflet/Sentry-verbose/admin editors never on public
Offline: SW article cache + submit queue (IndexedDB outbox) + SMS/WhatsApp fallback number on every form
Admin: 5 pages, capability-gated, single ContentForm split by job
IA — max 5 primary destinations (+2 actions):
[Header: ☰  Eagle Eye  🔍  + Post (big button)  FR|EN]
Home (/) — Today: 3 notices + 3 stories + 3 market, place selector at top
Stories (/stories) — merges /news + /photo-stories + /street + /culture; filter: Latest / Photos / Near me
Notices (/notices) — hero cards: 🔍 Lost | 📢 Found | 🚨 Alert; list below with VERIFIED badge
Market (/buy-sell) — keep name (known); filters: category chips + place + max price only
Places (/locations) — place pages with News/Notices/Market/Businesses tabs; businesses inline, no /professionals
Actions (not tabs): Search (overlay), Post (/submit — 1 screen, 4 steps)
Footer: About(1 page) + Terms + Privacy + Guidelines + Contact + Advertise(contact only)
Redirects: /news, /photo-stories, /street, /culture, /professionals, /map, /digest, /contributors → new homes via legacy_redirects table (already in proxy.ts).
6. Redesigned core flows (step by step)
A. Post lost item in 3 taps (guest, 2G, Pidgin-friendly):
1. Tap big green + Post (48px, header + home CTA submitCtaButton in en.ts:61) → 4 picture cards: 📸 Seen | 🔍 Lost | 📢 Notice | 🛍 Sell. Tap Lost.
2. One screen: Photo + (optional, auto-compress to <100KB, EXIF GPS stripped) + What? ________ (voice-note button → transcription optional) + Where? (recent places dropdown, default last place) + Reach me: phone/WhatsApp ________. No account, no title, no tags, no category. Turnstile invisible + honeypot.
3. Tap Send → offline-tolerant receipt: "Received ✓ We'll SMS you. Ref #A12." + queued-submit if offline ("Will send when network returns"). Staff moderates in 1 queue (/admin/moderation). Finder taps I found this → WhatsApp seller (no in-app chat).
B. Sell tomatoes (busy trader, slow connection):
1. - Post → Sell → same 1 screen, + Price ___ XAF (numeric pad) prefilled. 1 photo default, 3 max.
2. Send → receipt + auto-expiry 30 days + SMS renew link (renewOwnNotice pattern in checklist P6 — extend to listings). Buyer taps listing → Call / WhatsApp buttons only; contact reveal logged, rate-limited.
C. Read verified notice (70yo, FR, screen reader):
Home → Notices → big 🔍/📢 cards with icons+labels (never icon-only), VERIFIED NOTICE badge (en.ts:56) with hintVerified tooltip, text ≥16px, high-contrast preserved over brand (checklist item 13 specificity rule), back button always (FocusedShell BackButton).
D. Report correction (trust loop): inline form on story (CorrectionsNotice exists — keep) → 1 field "What is wrong?" + contact optional → receipt. Published corrections appear on story + /about/corrections (keep).
Each flow ≤3 screens, ≤1 photo required, works at 320px, FR+EN+Pidgin share text, no login wall.
7. Prioritized roadmap
NOW (this week) — owner: you + 1 dev, effort S unless noted:
1. Rotate leaked keys (SECURITY.md:70) + enable Turnstile prod + verify rate limits. Owner: founder. Effort: 2h. Metric: old key 401, abuse POSTs blocked.
2. Hide nav/routes: map, digest, events-live, professionals, polls, fundraisers (flag + remove links + legacy_redirects). Effort: 1d. Metric: header 5 items, LHCI bytes −30%.
3. Ship Lost/Found hero in /notices + single /submit/lost-found 3-field form. Effort: 3d. Metric: time-to-first-post <90s on 3G.
4. Delete dead deps (leaflet-defaulticon-compat, @shadcn/react if 2-file, embla/day-picker/resizable/cmdk) + admin raw-<img> → SmartImage + hero priority. Metric: first-load JS <250KB, LCP <2.5s.
5. Scam interstitial on Market ("Never send MoMo advance") + EXIF strip verify + phone-never-in-HTML audit. Metric: 0 PII in HTML scan.
NEXT (30 days):
6. Merge photo+news+street+culture → /stories + redirect table. Effort: M. Metric: 1 feed, related-click +20%.
7. Fold professionals into places; delete storefronts, keep claim intake at /admin/listings/claims. Effort: M. Metric: places with businesses >50%.
8. Replace ProEditor with textarea+photo for public submit (keep rich editor admin-only). Delete lib/ai, lib/translate×4, embeddings cron. Effort: M. Metric: submit completion +30%, LLM spend $0.
9. Cut storage to R2+Supabase; delete B2/Cloudinary code+env. Effort: S. Metric: storage paths 2, backup green.
10. Add submit-queue offline + SMS fallback number + Pidgin share strings. Effort: M. Metric: queued submits succeed, WhatsApp shares +40%.
11. Collapse admin to 5 screens; park rest behind flag. Effort: M. Metric: moderator triage <2min/item.
12. Add 2 e2e (guest lost-found, trader listing on throttled 3G) + bundle budget gate. Metric: e2e green, budget enforced.
LATER (90 days):
13. Drop 60 tables (migration + types regen + RLS re-test). Effort: L. Metric: tables ≤45, migrations green.
14. 4-cron 것만; delete workflow mirrors; external uptime monitor; quarterly restore drill. Metric: cron success 99%, RTO proven.
15. Local-champion kit (poster PDF, WhatsApp group template, training script) + voice-note submit. Metric: weekly active communities +5, first-time completion >60%.
16. Revisit deferred only on signal: digest if WA forwards >500/wk; MoMo boosts if 100+ listings/wk; map if places >200.
8. Success metrics
- Time-to-first-post (guest, 3G): <90s; completion >60%.
- Weekly active communities (places with ≥1 publish): +5/wk.
- Moderation latency: median approve <4h; queue zero overnight.
- Trust: corrections published/story, reports resolved <48h, scam reports/market listing <1%.
- Perf: LCP <2.5s 4G, <5s 3G; first-load JS <250KB; SW offline read works airplane-mode.
- Retention: % posters returning in 30d >25%; WhatsApp shares/post >3.
- Cost: hosting + Supabase + R2 < $50/mo at 10k MAU; LLM $0.
9. Risks + open questions YOU must decide
1. Pidgin: full language or share-voice only? (features.md:709 open). Recommendation: share-voice only for 6 months. Full CMS trilingual triples moderation cost. Decide: yes/no.
2. Anonymous submit vs phone-verify? Spec says no mandatory account (good for growth) but abuse risk. Recommendation: guest allowed for Lost/Found + Stories, phone required for Market. Decide threshold.
3. Who moderates at 10× volume? 1 queue + 2 editors breaks at 100 posts/day. Decide: champion-moderators per town (with moderate capability scoped by location — needs RLS by location_id, not built) vs central.
4. Money: ads vs MoMo boosts vs diaspora donations? All three half-built, none validated. Recommendation: kill all 90 days, run on <$50/mo, validate Market density first. Decide revenue bet.
5. French parity vs new languages (Pidgin, Fulfulde)? fr.ts typed parity is expensive (every key ×2). Decide: freeze FR at current, ship Pidgin share-strings only.
6. Hostinger vs Vercel canonical? Dual cron/deploy will cause an outage. Decide: Hostinger canonical this week.
7. Keep chief_admin two-person control? Overkill for 2-person team but protects secrets. Recommendation: keep for secrets/destructive only, drop elsewhere.
Definition of Done — lean, clear, ready
- 5 primary destinations only; every old URL 307/308s via proxy.ts + legacy_redirects; bare-href audit clean (scripts/find-bare-hrefs.mjs).
- Lost/Found posts in ≤3 taps, guest, <90s on throttled 3G, receipt with ref#, offline queue works.
- Market post = photo + price + place + phone; buyer path = Call/WhatsApp only, scam interstitial shown, no phone in HTML.
- Tables ≤45; crons =4; storage backends =2; client first-load <250KB; LCP <2.5s; npm run check + test:rls + build green.
- Service key rotated, date recorded in SECURITY.md; Turnstile enforced prod; upload caps + rate limits verified; EXIF GPS stripped.
- Admin =5 screens, capability-gated, triage <2min; deleted sections unreachable by URL + hidden from nav (nav-integrity.test.ts green).
- EN+FR complete on 5 destinations + submit; Pidgin share text on Stories/Lost/Found; 48px targets, screen-reader labels, 320px walkthrough passes.
- SW offline read + queued submit verified airplane-mode; SMS/WhatsApp fallback number on every form.
- Corrections register live on every story; verified badges with explainer; contributor credit line.
- Champion kit shipped (poster + WA template); 3 pilot towns posting weekly; metrics dashboard (time-to-post, active places, completion) reviewed weekly.
Cut until posting feels trivial. Amplify Lost/Found, Notices, Market, Stories, Places. Everything else is a distraction until a grandmother in Bamenda can report a missing child in 3 taps on a cracked Tecno with 1 bar of signal.