# Due-Diligence Audit — Eagle Eye Africa (live production)

**Mode:** read-only audit. I did not modify code, run migrations, or touch the live service. Evidence below is from the codebase at `7fc0085` (`main`), verified by reading the actual files (not the internal docs' claims about them), plus running the test suite (`206 passed / 5 skipped`, `tsc` clean).

---

## 0. Scope, method, and confidence labels

| Label | Meaning |
|---|---|
| **D# (verified defect)** | Reproducible from code reading or execution. File:line cited. |
| **R# (risk to validate)** | Plausible, code/config suggests exposure, but requires a live/staging check I did not perform. Each has a validation step. |
| **H# (product hypothesis)** | A falsifiable bet about personas/psychology/business — needs instrumented evidence, not belief. |

What I verified: routing/i18n machinery, auth chain (guards → actions → RLS intent), public intake & rate limiting, upload pipeline, CSP/headers, cron & backup topology, CI, test coverage (ran it), search, messaging, reveal-contact, ads beacon, notifications channels, admin capability model, JSON-LD injection sites, in-memory limiters, proxy logic, key UX components (place prompt, onboarding, share row, shells).

What I deliberately did **not** do: probe the live domain, inspect Hostinger/Supabase dashboards, check env vars on the host, or verify DNS/SSL/SMTP/WhatsApp settings. Those appear as R-items with exact validation steps.

**Overall verdict (senior-engineer grade):** This is an unusually disciplined codebase — real defense-in-depth (page guards → capability-gated actions → RLS intent), sanitized render boundaries, magic-byte upload validation + re-encode, durable Postgres-backed rate limits with a trusted-proxy contract, HSTS/CSP/COOP/CORP headers, audit logging, reauth for destructive admin actions, backup chains (R2→B2, nightly `pg_dump`→B2), EN/FR parity gates, and a CI with 10+ custom verification scripts. It is far past prototype. The weaknesses are not "is this built well" — they are: **(a)** a handful of concrete defects in the newest seams (legacy redirects are dead code; in-memory limiters leak; unthrottled public APIs), **(b)** an assurance gap where the most important layer (RLS) is the only layer with zero automated tests, **(c)** the paying persona (advertiser) is structurally dead, **(d)** the operator is flying blind (no product analytics anywhere), and **(e)** several live-environment claims that are documented but unproven.

---

## 1. Verified defects

### D1 — Legacy Blogger redirects are unreachable (SEO + migration story broken)
`proxy.ts:84` gates the legacy-redirect lookup behind `!isExemptFromLocaleRedirect(pathname)`, and `proxy.ts:69` exempts **any path ending in a dot-extension** (`/\.[a-zA-Z0-9]+$/`). Every Blogger-era URL is `/YYYY/MM/slug.html` → always exempt → **never looked up in `legacy_redirects`** → falls through to the router → 404. The Phase 5 feature (table, import-time `legacy_path` backfill, 5-min TTL cache) is dead code for its primary use case.
Secondary bug: the legacy redirect issues **307** (`proxy.ts:90`). A permanent migration should be **301/308** so search engines retire the old URLs.
*Fix (small):* check the legacy map before the asset-exemption (or exempt only known asset extensions, not `.html`), and use 308 for legacy matches. Add a proxy unit test with a `.html` fixture. *(I did not observe the live 404 — the code path is unambiguous, but add a live curl to the acceptance list.)*

### D2 — Unbounded in-memory rate-limit `Map`s (memory-exhaustion DoS)
`app/api/uploads/route.ts:15-27` and `app/api/ads/event/route.ts:10-21` keep module-level `Map`s keyed by IP with **no pruning**. An entry is only replaced when the *same IP returns after expiry*; attacker-controlled IP rotation (botnet, IPv6) grows the map without bound on a memory-capped Hostinger instance. The durable Postgres limiter layered after it is good, but the in-memory layer sits *first* and can OOM the process.
*Fix:* bounded map (LRU or "prune expired when size > N") or drop the in-memory layer entirely on these two routes and rely on the durable fail-closed limiter.

### D3 — RLS — the third layer of the security model — has zero tests
`tests/integration/rls.test.ts` and `tests/integration/rls-phase2.test.ts` are permanent `it.skip` placeholders (confirmed in the test run: "5 skipped"). The architecture checklist sells "RLS as the data layer backstop," and the migration history shows RLS churn (`content_delete_rls_fix`, `user_roles_grant`, `poll_fundraiser_delete_policies`, `remote_drift_repair`) — exactly the drift class that silently re-opens a table. Every other layer (guards, action asserts, audit log) has tests; the layer that actually contains a future bug does not.
*Fix:* an integration harness that applies all 58 migrations to an ephemeral Postgres (Supabase local / CI branch DB) and asserts ~12 invariants (editor cannot hard-delete content; member cannot read others' conversations; anon cannot read `submissions`/`data_requests`; contributor can only touch own rows; staff RLS on polls/fundraisers…). CI-blocking.

### D4 — Unthrottled public GET endpoints hit the database per request
`app/api/search/suggest/route.ts` (`force-dynamic`, unauthenticated, runs the full two-step FTS+fetch pipeline per keystroke) and `app/[locale]/(public)/api/places/route.ts` (returns the full locations list plus optional content query) have **no rate limit**. Scripted abuse → DB saturation on a small plan. `/api/ads/event` at least has the 120/min in-memory + 300/min durable beacons throttle.
*Fix:* durable per-IP limiter (fail-open, e.g. 30/min) + 30–60 s server-side cache on suggest/places; confirm client-side debounce exists.

### D5 — Advertiser role is structurally dead
`lib/auth/capabilities.ts:44-45`: `contributor: []`, `advertiser: []`. An advertiser who signs in sees **nothing** — no campaign status, no impression/click reporting, no inquiry tracking, no invoice. The entire revenue loop is: inquiry form → admin inbox → admin creates campaign manually. `docs/known-issues.md` and `features.md §5` acknowledge "no payments," but the deeper gap is that the *paying persona has no surface at all*. Ad impressions/clicks are being measured server-side (`increment_ad_event`) but never shown to the customer who pays for them. *(Classify as defect at the business-model layer; full plan in §5.)*

### D6 — Sentry client sampling at 100% of transactions
`sentry.client.config.ts:7` sets `tracesSampleRate: 1` in production: full tracing of every session — cost + main-thread overhead on exactly the low-end Android devices this product targets, and Sentry bill shock at traffic spikes. Server-side traces sample rate should also be reviewed.
*Fix:* 0.05–0.2 client traces; 1.0 error capture (unchanged); document SLOs around it.

### D7 — Minor verified UX/correctness nits
- `components/account/onboarding-card.tsx:61`: the "save" onboarding step links to `/` (homepage) instead of `/account/saved` — teaches the wrong behavior.
- `lib/messages/actions.ts:117`: inbox rows hardcode `otherName: null`, so the buyer↔seller inbox never shows who the thread is with (thread view resolves it correctly).
- `docs/hosting-architecture.md:19` declares production branch `master`; repo/CI use `main` (`.github/workflows/ci.yml:5`). Doc drift on a deploy-critical fact.
- A stale untracked **git worktree copy** of the whole repo exists at `.kilo/worktrees/petal-serpent` (older commit, includes obsolete vulnerable code and scratch scripts). Not shipped, but it pollutes searches, can leak into zips/backups/tooling, and confuses agents. Remove it (`git worktree remove`) and ignore `.kilo/`.

*(Cleared during audit, worth stating so nobody chases them: JSON-LD injection on notices/photo-stories is safe — both go through `renderJsonLd()` → `escapeJsonForLd` (`lib/seo/jsonld.ts:190`, confirmed at `notices/[id]/page.tsx:113`, `photo-stories/[slug]/page.tsx:97`); `safeNextPath` open-redirect protection is solid; sanitizer is a parser-based allowlist with mXSS nonTextTags; upload validation is magic-byte + re-encode.)*

---

## 2. Risks that need validation (with the exact check)

| # | Risk | Why it matters | Validation step (read-only) |
|---|---|---|---|
| **R1** | **Legacy URL behavior live** | D1 predicts 404s on old Blogger links | `curl -I https://<domain>/2024/05/<known-old-post>.html` — expect 404 today; after fix expect 308 → localized canonical |
| **R2** | **`SITE.url` / canonical domain truth** | hosting docs say `eagleeyeafrica.org`; CI uses `preview.eagleeyeafrica.com`; nginx file is `.org` | Check live canonical tags + hreflang (`view-source`), and the host env; sitemap URLs must match. A mismatch silently splits SEO across domains |
| **R3** | **Uptime monitoring actually configured** | docs/observability.md says "something must call /api/ready" — nothing in repo proves it | Confirm two external checks exist (60s `/api/ready`, 5m `?fresh=1` with `READY_PROBE_SECRET`) and alert channel receives a test |
| **R4** | **Crons actually firing on Hostinger** | GitHub Actions cron is the real scheduler there; Actions cron skews 10–30+ min routinely | Check `scheduled-jobs.yml` run history; watchdog green; outbox lag < 15 min p95 |
| **R5** | **SMTP + SPF/DKIM/DMARC + Supabase custom SMTP** | Every transactional email (confirmation, receipts, moderation asks) depends on it; known-issues flags it as pre-launch op | `dig TXT` the domain; send one real signup + one guest submission receipt to a controlled inbox |
| **R6** | **WhatsApp production reality** | Known-issue #1: template approved? link-preview renders? Cloud API live? | Handset test per `docs/notifications.md` §production checklist; share one story link in WhatsApp and screenshot the card |
| **R7** | **Restore drill never rehearsed** | Backup exists (db-dump→B2 + media mirror), restore is manual/undrilled | Restore latest `db_dumps` artifact into an ephemeral DB; `pg_restore --list` + row-count assertions; record the time-to-restore |
| **R8** | **CSP `script-src 'unsafe-inline'`** | Documented tradeoff (ISR vs nonce). Mitigated hard by `script-src-attr 'none'`, but a sanitizer bypass would still allow inline `<script>` elements | Track as accepted risk with a milestone; verify report-uri configured to watch for violations |
| **R9** | **Ad impression fraud** | Beacons dedupe by client-generated `sessionHash` — trivially rotated by a script; advertisers paying on impressions will notice discrepancies | Compare `ad_events` per-session distribution for entropy anomalies; consider IP+UA-weighted dedup or sampled verification |
| **R10** | **Single-process availability** | Hostinger Business = one `next start` process, no supervision layer you control; in-memory limiters (D2) and upload buffering (50 MB into RAM per request) assume small concurrency | Load-test uploads on staging-like env; check plan memory; decide the upgrade trigger (VPS path exists in `deploy/vps/`) |
| **R11** | **Login throttling is per-IP only** (`auth:login` 10/10min, fail-closed + Turnstile — good) | Distributed credential stuffing against staff mailboxes isn't slowed by per-IP limits alone | Add per-email counter for staff domains; check Supabase-side limits |
| **R12** | **axe coverage holes** | a11y e2e covers 23 static routes but **no article/listing detail pages** (dynamic), **no admin surface**, and map/carousel interactions | Add seeded-fixture e2e pages + admin shell to the axe suite; one manual screen-reader pass on the submit flow |
| **R13** | **`unstable_cache` bootstrap dependency** | Documented Next-16 choice; a Next 17 change would break homepage/locations caching behavior | Pinned re-audit task when upgrading |

---

## 3. Product hypotheses (falsifiable, per persona)

The stated north star is the loop **Discover → Read → Participate → Submit → Verify → Publish → Share → Return**. Here is whether each persona can *actually get something valuable done today*, and the hypothesis that would make it a must-have.

| Persona | Can they get value today? | The one thing that would make it a must-have | Hypothesis to test |
|---|---|---|---|
| **Reader (Bamenda/ Douala, mobile, low data)** | Yes — strong: place-anchored "Near you", verified badges, live/developing timelines, offline reading, TTS, reading progress, digest | A reliable daily WhatsApp brief at a fixed hour, per-place | **H1:** retention is driven by notification utility, not page UX. Measure: D7 return rate of digest/WhatsApp subscribers vs non-subscribers (needs W13 analytics) |
| **Contributor (citizen with a photo/story)** | Yes — guest submission with receipt, drafts, status trail, withdraw, byline credit | **Impact feedback**: "your story reached N readers" + publish notification | **H2:** visible impact (not byline alone) drives repeat submissions. Measure: 2nd-submission rate before/after impact loop (W9) |
| **Seller / Buyer** | Mostly — PII-safe reveal (rate-limited, not in HTML/crawlers), in-app threads, price watches, mark-sold | Safety trust: scam warning at reveal, report/block in thread, seller reputation | **H3:** classifieds churn is dominated by scam anxiety, not features. Measure: report rate per 100 reveals; thread completion rate |
| **Advertiser (local business)** | **No** (D5) — inquiry disappears into an admin inbox; no status, no numbers, no invoice | Self-serve visibility: campaign status + impressions/clicks + booked slots | **H4:** advertisers renew when they can *see* delivery, not when the ad runs. Measure: renewal rate after self-serve reporting (W8) |
| **Staff/Editor (small team)** | Yes — genuinely good command center: moderation drawer, approve-with-content, homepage slots, timeline editor, audit log, ops digest | Moderation speed tools (shortcuts, saved filters, assignment) — already flagged as Phase 5 leftovers | **H5:** time-to-publish is the constraint on the whole content loop. Measure: median pending→published hours (needs analytics) |
| **Diaspora reader** | Partially — digest exists, but nothing is framed for them | Timezone-aware digest + a diaspora entry framing ("home, today") | **H6:** a diaspora-framed digest variant lifts subscribe rate measurably (A/B via existing experiment framework — but only after W13 gives it metrics) |

**Psychological observations worth acting on (not bugs — design):**
- **Trust architecture is a real differentiator** (verified badges, visible verification instead of uniform certainty, corrections flow, signed policy acceptance, takedown + data-request flows). Protect it: the moment a scam survives in Buy & Sell or an uncorrected error persists, the whole trust stack devalues. The reveal-contact flow is the highest-risk trust moment and currently says nothing about safety (H3).
- **The place-prompt is the single highest-leverage personalization moment**, but "Not now" (`place-prompt.tsx:92-99`) permanently dismisses via localStorage — the label promises *later* and delivers *never*. Relabel ("Don't ask") or re-ask after ~30 days.
- **Identity anchor:** place cookie + near-you rail + "one community board for every place" is strong self-reference psychology. It's currently under-used: place exists on the homepage rail only; section pages ignore it.
- **Notification hygiene is already thoughtful** (quiet hours exist in the schema, channel skip-honesty, opt-in WhatsApp). The risk is the opposite of spam: **silence**. An outbox that silently skips (`delivered:false, skipped:'SMTP not configured'`) with no operator alert when the misconfiguration persists is how a "notify every 15 min" system becomes decorative. Ops-digest covers queue depth, not channel failure streaks.
- **Friction budget:** guest submission without account is the right call for this market; email-confirmation-on-signup makes SMTP a single point of failure for the *participation* loop, not just notifications (R5).

---

## 4. Architecture & reliability notes (what the code says about the next 12 months)

- **Everything writes through the service-role client in many public paths** (`price_watches`, `search`, ads beacons, notify workers). App-level checks are correct today, but this normalizes bypassing RLS in user-facing code; the D3 test harness is the antidote. Prefer session-scoped clients wherever a policy can express the rule.
- **DB is a single point of failure by design** — the rate limiter itself is a Postgres RPC, and credential surfaces fail **closed**. That's the right trade for abuse, but it means a Supabase outage takes logins *and* submissions *and* beacons down together. `/api/health` vs `/api/ready` separation is exactly the right instrumentation; the missing piece is an external monitor (R3).
- **GitHub Actions as the production scheduler** works with the watchdog, but Actions cron skew makes the 15-minute notify cadence soft. If WhatsApp briefs become the habit loop (H1), move notify to the host (systemd timer) or a dedicated worker — the code path (`lib/notify/worker.ts`) is already idempotent outbox draining.
- **The monoliths are real but contained:** `lib/admin/actions.ts` / `queries.ts` ~2,000+ lines each (known-issues P2). With tests on them, this is a P2, not a P1.
- **Zero product analytics** by design (privacy-first, device-local reading history, anonymous session hash beacons). This is a *feature* — but the operator currently cannot answer: how many visitors, where do they drop in the submit funnel, does search find things, do notifications get opened? W13 below proposes a privacy-preserving aggregate counter approach (no PII, no cookies, Supabase only) that keeps the privacy story intact.

---

## 5. Prioritized implementation plan (with acceptance criteria)

Sequenced by: live-service safety → assurance → persona value → growth. Nothing here requires touching the live DB destructively; migrations are additive.

### P0 — this week (protect the live product)
| # | Workstream | Acceptance criteria |
|---|---|---|
| **W1** | Fix legacy redirect gate (D1): look up `legacy_redirects` *before* the asset-dot exemption (or narrow the exemption to real asset extensions); emit **308** for legacy matches | • `curl -I /2024/05/<old>.html` → 308 → localized canonical (R1 evidence) • proxy unit test with `.html` fixture in CI • `verify-sitemap` still green |
| **W2** | Bound the in-memory limiters (D2): prune-on-insert with size cap on `/api/uploads` + `/api/ads/event` maps (or delete the in-memory layer where the durable limiter already covers) | • Unit test: 100k synthetic IPs → map size bounded (≤ cap) • 429 behavior unchanged • no new allocations on hot path |
| **W3** | RLS integration harness (D3): ephemeral Postgres + all migrations + top-12 policy invariants, CI-blocking | • CI fails when a SELECT policy is widened (proven by a negative test) • the 5 skipped tests replaced by ≥12 real assertions • runbook in `docs/` |
| **W4** | Live-state validation sweep (R2–R7): one checklist run with evidence recorded in `docs/` (canonical domain, ready-monitor, cron watchdog, SMTP/DMARC, WhatsApp handset, restore drill) | • Each item has date + evidence (screenshot/log) • restore drill produces time-to-restore • any red item becomes its own ticket |
| **W5** | Hygiene: remove `.kilo` worktree; correct `docs/hosting-architecture.md` branch/main drift (D7); confirm branch protection on `main` | • `git worktree list` shows only root • docs match repo • direct pushes to `main` blocked |

### P1 — next 2–4 weeks (assurance + persona value)
| # | Workstream | Acceptance criteria |
|---|---|---|
| **W6** | Core-loop e2e (currently zero): seeded staging DB → Playwright: submit (guest) → receipt → admin approve-with-content → article live → notification outbox row → correction flow | • One green nightly run in CI (non-blocking initially, blocking after 2 stable weeks) • runtime < 10 min |
| **W7** | Auth hardening: per-email throttle for staff-domain logins; **enforce MFA** for admin/editor (MFA exists — make it required); audit-log every reauth | • Policy test: admin login without enrolled MFA blocked post-grace-period • per-email limiter unit-tested (fail-closed) |
| **W8** | Advertiser self-serve v0 (D5): `/account` surface for the advertiser role — inquiry status, campaign list, impressions/clicks (read-only from `ad_events`), booked slot & dates. No payments yet — manual invoice note | • Advertiser role logs in and sees live campaign delivery numbers • inquiry status emails on approve/reject • axe-clean page |
| **W9** | Contributor impact loop: publish event → outbox notification with link ("your story is live"); profile stat "stories published / readers reached" (aggregate, from existing view counters) | • First publish → contributor email/in-app within 15 min • stat visible on `/account` • no PII in aggregates |
| **W10** | Ops alerting for silent skips: ops-digest gains "channel failure streak" (SMTP/WhatsApp consecutive `delivered:false` ≥ N) | • Digest includes per-channel 7-day delivered/skip/error counts • test with SMTP env unset |
| **W11** | Sentry tuning (D6): client traces 0.1, server traces 0.2, keep error capture 1.0; add release health (crash-free sessions) | • Config reviewed in PR • bill/SLO note in `docs/observability.md` |
| **W12** | A11y phase 2 (R12): axe admin shell + 3 seeded detail fixtures; manual screen-reader pass on submit flow; publish an accessibility statement page | • Zero violations on new routes in CI • statement page linked from footer |

### P2 — 1–2 months (growth + business model)
| # | Workstream | Acceptance criteria |
|---|---|---|
| **W13** | Privacy-preserving product analytics: aggregate counters only (no cookies/PII): daily visits per locale/place, submit-funnel counters (form views → submits → published), search success (result→click via suggest/detail beacon), notification delivery→click (redirect beacon on outbox links) | • Admin dashboard shows funnel + ops-digest includes weekly deltas • privacy policy updated (aggregate-only, documented) • can compute H1–H5 metrics — **DONE 2026-09-23** (migration `20261022000000_analytics_daily.sql`, beacon + rate-limited `/api/analytics/event`, Insights admin page with SVG charts, ops-digest 7d-vs-prior-7d SUM delta; beacon aggregates only — no path/referrer/UA per the parked-WIP privacy contract) |
| **W14** | Community safety pack (H3): safety tip inline at reveal-contact moment; report + block inside message threads; first-response-time expectation set in thread UI | • Report/block actions write audited rows visible in trust-safety • tip shown on every reveal — **DONE 2026-09-23** (migration `20261024000000_user_blocks.sql`: private two-row block table, no admin surface, insert-enforced before every message; report button in thread header reusing the trust-safety queue; block writes a `moderation_log` audit row; `ShieldAlert` tip renders on every RevealContact; expectation line in thread header) |
| **W15** | Ads business loop v1: rate card (staff-editable, exists), quote → invoice PDF artifact → "mark paid" workflow; make-good policy note; fraud damping for beacons (per-IP+UA dedup window) | • An ad sale completes entirely through product surfaces + manual invoice • impressions discrepancy vs third-party check < 15% — **DONE 2026-09-23** (quote = slot rate card; `setAdCampaignInvoice` stamps the reference + amount, `markAdCampaignPaid` refuses to skip the invoice, `voidAdCampaignInvoice` returns the booking to unpaid — every transition writes a `moderation_log` row; new `BillingActions` row UI shows the payment badge, reference and the void path; make-good policy note + third-party reconciliation ceiling (15%) published above the campaign table; beacon fraud damping via `lib/security/ad-dedup.ts` — session-first, IP+UA fallback, 30 min impressions / 10 s clicks, bounded at 20k keys, unit-tested) |
| **W16** | Place-based identity expansion: section pages honor the place cookie (filtered rails), "continue reading" from device-local recent views on homepage | • Near-you pattern on ≥3 surfaces • measurable via W13 — **DONE 2026-09-23** (new client-island `components/place/place-rail.tsx` reads the `eea-place` cookie and fetches `/api/places?place=…&kind=…`, mounted on **/news, /notices, /photo-stories, /buy-sell** = 4 surfaces, each with a one-tap “see all in {place}” escape into `?location=<slug>`; homepage “continue reading” rail (`components/home/continue-reading-rail.tsx`) surfaces the device-local `eea-recent` history via `useSyncExternalStore` — hydration-safe and lint-clean, locale re-prefixed, nothing leaves the device. **ISR preserved**: both rails are client islands on purpose, because a server-side cookie read would opt these routes out of static rendering — the exact regression Phase 1 fixed on the homepage. Rail *renders* are not yet a beacon event (surface visits are, via W13); FR strings for `nearYou`/`nearYouTitle`/`noPlacesFound` were unaccented and are fixed) |
| **W17** | Code health: split `lib/admin/actions.ts`/`queries.ts` per domain; `supabase db lint` enforced when secret present; Next-upgrade rehearsal (unstable_cache R13) | • No file > 800 lines in admin lib • lint green in CI — **PARTIALLY DONE 2026-09-23** (`lib/admin/queries.ts` split from 2,692 lines into `lib/admin/queries/{content-ops,people,safety,catalog,programs,settings}.ts` + `shared.ts` + a `server-only` barrel — largest file now 569 lines, every existing import site unchanged, tsc/tests/eslint green. Two durable gates wired into `npm run check`: `scripts/verify-unstable-cache.mjs` (R13 upgrade rehearsal: every `revalidateTag()` two-argument, every `unstable_cache()` declares keys + an expiry/invalidation path — proven by negative test) and `scripts/verify-admin-lib-size.mjs` (cap 800 with `lib/admin/actions.ts` allowlisted at 4,086 lines as a **ratchet — it may only shrink**). `scripts/verify-db-lint.mjs` + a CI step run `supabase db lint` whenever `SUPABASE_DB_URL` exists, with an explicit skip line otherwise. **Remaining:** the `lib/admin/actions.ts` split (4,086 lines). Recipe is fixed and must not be shortcut: extract each domain's bodies into `lib/admin/actions/<domain>.ts` (plain server-only modules) and keep `actions.ts` as the *only* `'use server'` boundary with thin async wrappers aliased to the domain implementations — a directive-free barrel is **not** an option for actions (the client proxy contract depends on the defining module carrying the directive), and wrappers keep the project's `verify-server-actions` gate satisfied) |

### P3 — quarterly bets
- **W18** Diaspora digest variant (H6) via the existing experiment framework — only meaningful after W13.
- **W19** SMS/USSD submission path pilot (features.md gap) — or an explicit decision that WhatsApp *is* the low-barrier channel; document it.
- **W20** Comments/reactions with the existing moderation pipeline (spec §16) — gated on W13 proving demand.
- **W21** Web push as WhatsApp complement; business directory; Pidgin/Camfranglais share-voice measurement.
- **W22** Public changelog + contributor badges (reciprocity loop, per features.md "contributors see the platform improving").

---

## 6. What I'd tell the owner in one paragraph

The engineering is genuinely production-grade and the trust architecture is the moat — don't let growth spend it down. The three things I'd fix before anything else: **(1)** the legacy-redirect gate is dead code (D1) and it's quietly burning the SEO value of the Blogger migration you already built; **(2)** the security model's third pillar (RLS) is the only one with no tests (D3) — one drifted migration is all it takes; **(3)** the advertiser — the only persona who pays you — cannot see anything (D5), while ad beacons are already counting impressions they never see. Everything else compounds from there, and every item above has a test or a checklist artifact as its definition of done.

---