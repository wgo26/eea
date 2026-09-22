# Live-environment validation checklist

Companion to `docs/audit.md`. Every item below is a **risk that needs
validation** (R1–R13) — each has a concrete, read-only check the operator
can run against the live deployment or environment. Document evidence
(screenshot, curl output, dig result) after each.

> These cannot be validated in a code-only environment. They require
> access to the production domain, Hostinger hPanel, Supabase dashboard,
> and/or a live handset. Run `scripts/probe-live.mjs` as a starting point —
> it covers R1, R3, and parts of R2.

## R1 — Legacy Blogger redirects resolve (308 → canonical)

**Why:** D1 was fixed in `proxy.ts` (lookup before asset-exemption, 308 not 307),
but the live `legacy_redirects` table may be empty or the 5-min TTL cache may
serve stale entries.

**Check:**
1. `node scripts/probe-live.mjs` — look for `legacy … → 308 → <localized canonical>`
2. Or manually: `curl -sI "https://<domain>/2024/05/<known-old-post>.html"`
3. Confirm `location` header starts with `/<locale>/news/<slug>` (or the correct new path).

**Acceptance:** 308 + correct localized Location header. 404 = D1 regression
live; re-run the backfill migration (`20261015000000`).

---

## R2 — Canonical domain / hreflang truth

**Why:** `docs/hosting-architecture.md` says `eagleeyeafrica.org`; CI uses
`preview.eagleeyeafrica.com`; if the live domain or canonical tags don't
match, SEO equity splits across domains.

**Check:**
1. `<live-url>/sitemap.xml` — every URL must start with the production domain.
2. Pick 3 page types (article, listing, homepage). `view-source` each:
   - `<link rel="canonical" href="https://eagleeyeafrica.org/…">` (no `www`)
   - `<link rel="alternate" hreflang="en"` and `hreflang="fr"` versions
3. DNS: `dig +short eagleeyeafrica.org` — A record points to Hostinger.

**Acceptance:** Canonical + hreflang + sitemap all use the same production
domain; `www` 301-redirects to non-`www`.

---

## R3 — Uptime monitoring configured + Sentry DSN

**Why:** `docs/observability.md` §3 says "something must call /api/ready."
If it doesn't, the operator has no outage alert. Additionally, the Sentry SDK
is installed but only fires if `SENTRY_DSN` is set on the host.

**Check:**
1. Confirm two external monitors exist (UptimeRobot/BetterStack/etc):
   - `GET https://<domain>/api/ready` at 60s, alert on non-200
   - `GET https://<domain>/api/ready?fresh=1` with `Authorization: Bearer <READY_PROBE_SECRET>` at 5min
2. Verify `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN` env vars are set in Hostinger hPanel.
3. Trigger a test error (deploy a temporary throw in a `/api/` route) and confirm
   it appears in Sentry with the correlation id emitted by `lib/observability/logger.ts`.

**Acceptance:** Monitors exist + fire test alert; Sentry receives an error with
correlation id; `tracesSampler` at 0.1 in production.---

## R4 — Production crons actually firing on Hostinger

**Why:** GitHub Actions cron is the real scheduler on Hostinger (Vercel crons in
ercel.json do not fire there). Actions cron skews 10–30+ min. If the
scheduled-jobs.yml workflow has not run, notify/digest/db-dump/backup are
silent.

**Check:**
1. GitHub Actions → scheduled-jobs.yml → check last successful run.
2. Confirm the ops-digest watchdog is green (6 endpoints, 7 jobs).
3. Check outbox lag: query 
otification_outbox for pending rows older than 15 min.

**Acceptance:** All 6 scheduled jobs fired within expected windows in the
last 24h; outbox lag < 15 min p95; db-maintenance returned 200.

---

## R5 — SMTP + SPF/DKIM/DMARC

**Why:** Every transactional email (guest receipts, contributor publish
notifications, admin moderation asks) depends on SMTP. Known-issues flags
this as pre-launch ops.

**Check:**
1. dig TXT eagleeyeafrica.org — expect SPF record including the sending host.
2. dig TXT default._domainkey.eagleeyeafrica.org — expect DKIM public key.
3. dig TXT _dmarc.eagleeyeafrica.org — expect p=quarantine or p=reject.
4. Send a real signup → confirm receipt lands in inbox (not spam).
5. Submit a guest story → confirm the receipt email arrives.

**Acceptance:** SPF + DKIM + DMARC records present and pass; transactional
emails land in inbox; channels.email = true in admin notifications page.
---

## R6 — WhatsApp template + link preview

**Why:** Known-issue #1. The WhatsApp Cloud API must be production-approved with
an approved utility template; OG cards must render when links are shared.

**Check:**
1. Confirm WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_TEMPLATE
   are set on the host (or via 
pm run notify:env).
2. Submit a real story → receive the WhatsApp notification on a handset.
3. Share a story link in WhatsApp → screenshot the OG card render.
4. Confirm the app/WhatsApp template is in "Approved" status in Meta Business
   Manager (not "Pending" or "Disabled").

**Acceptance:** Real WhatsApp notification delivered; OG card renders with
title/description/image; template in Approved status.

---

## R7 — Restore drill

**Why:** The nightly pg_dump → B2 pipeline is live, but the restore path has
never been rehearsed. A backup without a tested restore is not a backup.

**Check:**
1. In Supabase SQL editor: select filename, sha256, size_bytes, created_at
   from db_dumps order by created_at desc limit 1; — note the latest.
2. Download the latest .dump from the B2 bucket.
3. pg_restore --list <dump-file> | head -50 — confirm schema + data appear.
4. Provision an ephemeral Postgres, restore into it:
   pg_restore --dbname=postgresql://localhost/eea-restore-test <dump-file>
5. Row-count assertions: content_items, profiles, 
otification_outbox
   counts in the restored DB match the source.

**Acceptance:** Full restore completes; row counts match within ±1%. Document
time-to-restore. Schedule quarterly.

---

## R8 — CSP script-src 'unsafe-inline' (accepted risk)

**Why:** CSP uses script-src 'unsafe-inline' 'unsafe-eval' (documented
tradeoff for ISR). Mitigated by script-src-attr 'none', but a sanitizer bypass
would still allow inline <script> elements.

**Check:**
1. curl -sI https://<domain>/ or 
ode scripts/probe-live.mjs
2. Inspect the Content-Security-Policy header — note script-src 'unsafe-inline'.
3. Track as an accepted risk with a milestone: "strict-nonce CSP by Q2 2027."
4. Verify script-src-attr 'none' and object-src 'none' are present.

**Acceptance:** Risk documented + accepted with a milestone date; mitigations
(script-src-attr 'none', sanitizer, no user-reachable inline scripts) confirmed in place.
---

## R9 — Ad impression fraud

**Why:** Beacons dedupe by client-generated session_hash, which is trivially
rotated by a script. Advertisers paying on impressions will notice discrepancies
if bot traffic inflates counts.

**Check:**
1. Query: select session_hash, count(*) from ad_events where event_type =
   'impression' group by session_hash having count(*) > 50 order by count desc
   limit 20; — look for single-session impression floods.
2. Compare d_events per-session distribution for entropy anomalies.
3. Compare reported impressions against any third-party (Meta pixel) if available.

**Acceptance:** No single session produces >50 impressions in <1h. Flag
suspicious sessions for refund analysis. Consider IP+UA-weighted dedup as
future hardening (W15).

---

## R10 — Single-process availability

**Why:** Hostinger Business = one 
ext start process. The 50 MB upload buffer
assumes limited concurrency. A single OOM kills all sessions.

**Check:**
1. Confirm Hostinger plan memory allocation in hPanel.
2. Load-test uploads: 10 concurrent users uploading 25 MB images simultaneously.
3. Monitor the app process for restarts during the test.
4. If OOM or restarts occur, implement the VPS upgrade path:
   deploy/vps/ (Node + PM2 + nginx reverse proxy).

**Acceptance:** 10 concurrent 25 MB uploads succeed without OOM; app process
stable for 5 min after load. If unstable, trigger the VPS upgrade plan.

---

## R11 — Login throttling (per-IP only)

**Why:** lib/security/rate-limit.ts throttles per IP (10/10min via uth.login
Server Action, fail-closed + Turnstile). Distributed credential stuffing
against staff emails is not slowed by per-IP alone.

**Check:**
1. Code review: confirm lib/admin/actions.ts login() calls ateLimitHit.
2. Add a per-email counter (not just per-IP) for staff-domain attempts.
   This requires a small migration or a Redis-backed counter.
3. Test: 3 failed logins from 3 different IPs against the same staff email →
   should be rate-limited by the 4th attempt.

**Acceptance:** Per-email throttle implemented + tested; Turnstile + per-IP
+ per-email form a 3-layer defense.

---

## R12 — axe coverage holes

**Why:** 	ests/e2e/a11y.spec.ts covers 23 static routes but no dynamic detail
pages, no admin surface, and no map/carousel interactions.

**Check:**
1. Add seeded-fixture e2e pages (news detail with gallery, listing detail with
   conversation, admin content table) to the a11y suite.
2. Add an admin shell route to the axe suite.
3. Manual screen-reader pass: tab through the submit form, the place selector,
   and the reveal-contact flow.

**Acceptance:** Zero violations on all new a11y routes in CI; one manual
screen-reader pass documented.

---

## R13 — unstable_cache bootstrap dependency

**Why:** lib/queries/locations.ts uses unstable_cache (Next.js undocumented
API). A Next 17 upgrade could change its semantics, breaking the homepage
near-you rail and location facets.

**Check:**
1. Confirm the Next.js version in package.json.
2. When upgrading Next, verify unstable_cache return type + invalidation
   behavior against the existing call sites.
3. Track the upgrade as a pinned task with a test: "locations cache hit returns
   expected facets + invalidates after revalidateTaxonomy."

**Acceptance:** Next upgrade rehearsal includes a cache-behavior smoke test;
if unstable_cache is removed, migrate to the stable API with equivalent
TTL + invalidation semantics.
