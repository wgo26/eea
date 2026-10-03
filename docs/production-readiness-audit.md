# Production-readiness audit

**Audit date:** 2026-10-03  
**Overall status:** **NOT READY for a production release**  
**Scope:** Eagle Eye Africa Next.js/Supabase application, current local working tree, public production site, and publicly visible GitHub Actions runs.

## Executive assessment

The project has broad product coverage and a meaningful set of engineering controls: locale-aware canonical URLs, HSTS and other browser headers, role/capability checks, service-role bundle checks, database-backed rate limiting, search indexes, migration-manifest validation, and an RLS test harness. The public site and readiness endpoint were reachable during this review.

That is not sufficient evidence of release readiness. The current working tree cannot pass its TypeScript/build gate; a voice-note round-trip failure was observed, and its current in-progress test edit now throws before testing that behavior; the live scheduled reminders job received HTTP 401; and the live CSP response contained only `upgrade-insecure-requests`, not the restrictive directives configured in source. A new expiry-aware RLS migration exists only as an untracked local file, and the documented database restore drill is explicitly unrehearsed. A production browser session also emitted React hydration error #418 and HTTP 400 resource failures. An untracked deployment workflow draft targets Vercel even though the live site responds from Hostinger.

**Recommendation:** no-go for further production releases until the Critical and High findings below are resolved and verified. Treat the existing service as live but operationally under-verified; do not infer that a 200 from `/api/ready` means scheduled work, submission verification, email, backups, or release controls are healthy.

## Audit snapshot and limits

- Local `HEAD`: `cc30b02`; local `origin/main`: `76eb4fb`. The working tree contains changes not present in that local `HEAD`, including cron-handler and CI edits, untracked deployment/RLS workflows, a 320px viewport test, RLS test changes, and the untracked `supabase/migrations/20261117000000_content_expiry_rls.sql`. These drafts were reviewed, but are not evidence of what is deployed.
- The latest reviewed public production scheduled-jobs run used SHA `76eb4fbf6ec8f982e30388d563206773c37698f0`, not the local working tree.
- No authenticated access was available to Hostinger, Supabase, Sentry, SMTP, WhatsApp, R2/B2 dashboards, or production admin pages. Their settings, restore artifacts, alert delivery, and user flows therefore remain unverified.
- Live-page inspection was a spot check, not a controlled Lighthouse/Web Vitals run. Browser timing values below are diagnostic signals only; they are not a valid LCP/CLS/INP result.
- No code fixes were made as part of this audit. The requested report is the only file added.

## Readiness scorecard

| Area | Status | Evidence-based assessment |
|---|---|---|
| Release/build integrity | **RED** | `npm run check` and `npm run build` fail on TypeScript errors; `npm test` has one failing test. |
| Production operations | **RED** | Latest observed hourly reminders workflow run failed because the production endpoint returned 401. |
| Security headers | **RED** | Live CSP contains only `upgrade-insecure-requests`; source config defines a substantially stricter policy. |
| Access control / data protection | **AMBER/RED** | Strong layered controls and static posture checks exist; the expiry-aware RLS hardening is untracked and not shown applied to production. |
| Backup / recovery | **RED** | The restore-drill log says “unrehearsed”; backup checks are conditional/advisory in CI. |
| UI and accessibility | **AMBER** | The live page renders and a 390px viewport had no horizontal overflow, but a hydration error was observed and dynamic/admin interaction coverage is missing. |
| Performance / scalability | **AMBER** | Image/font/cache/search work is substantial; the stated JS/LCP budgets are not measured in CI, and resumable uploads use local temporary storage. |
| Localization / SEO | **GREEN for observed routes** | Production homepage returned canonical and EN/FR/x-default alternates on the canonical `.org` host. This is not a complete route audit. |
| Maintainability / documentation | **AMBER** | Static gates are useful, but 38 lint warnings remain and several operational/audit documents contradict current code or current verification. |

## Findings

### PR-01 — Build and unit-test gates fail in the audited working tree

**Severity: Critical — release blocker**

**Evidence**

- `npm run check` stopped at `tsc --noEmit` with errors in:
  - `app/[locale]/(app)/admin/content/content-preview.tsx`: `copy.common` is not part of the typed dictionary object.
  - `lib/admin/actions/_shared.ts`: `poster_url` is rejected as `never` by the generated `media_assets` type. The column is added by `20261116000000_media_poster_url.sql`, but `lib/supabase/database.types.ts` does not include it.
- A later TypeScript rerun also found that the in-progress edit to `lib/content/blocks.test.ts` calls non-exported `splitTopLevelNodes` and has an implicit-`any` callback parameter. These are additional errors in the current working tree.
- The earlier `npm run build` compiled the application, then failed its TypeScript phase; it was not rerun after the later in-progress edits. The current TypeScript errors already make that build non-releasable.
- `npm test`: **843 passed, 1 failed, 21 skipped** across 78 files. The original round-trip assertion showed only two parsed blocks for a YouTube embed, uploaded clip, and voice note. In the later working-tree rerun, the edited test instead failed first with `TypeError: splitTopLevelNodes is not a function`; the source round-trip behavior therefore remains unresolved.
- `npm run lint` exits successfully but reports **38 warnings** on the later working-tree snapshot.

**Action**

Fix the dictionary access and synchronize generated Supabase types with the actual migrations/schema; avoid casts that conceal missing columns. Repair the story-block audio round trip (or correct its contract and tests only if the product requirement changed). Require `npm run check`, `npm test`, `npm run build`, and browser smoke tests to pass on the exact release commit.

### PR-02 — Production cron authentication is failing

**Severity: High — background operations are not dependable**

**Evidence**

- GitHub Actions run [Scheduled jobs #474](https://github.com/wgo26/eea/actions/runs/37101592510), started 2026-10-03 05:59 UTC, failed in **Event reminders**.
- Its job log records `HTTP 401` and `{"error":"Unauthorized"}` from `https://eagleeyeafrica.org/api/cron/reminders`, despite the workflow sending its `CRON_SECRET` authorization header.
- Recent scheduled runs #470–#474 also show failures. Other jobs are skipped when their schedule does not match; this finding does **not** assume every endpoint failed in the sampled run.
- The repository’s cron manifest gate passes, which verifies static workflow/endpoint wiring but cannot verify that the live host and GitHub secret values agree.

**Action**

Reconcile the secret configuration without printing secret values, test the production endpoint through a controlled workflow dispatch, then verify each scheduled job separately. Add a successful-run heartbeat/alert that detects endpoint-level failures, not only missing workflow executions. Verify backup, maintenance, notification, and reminder lag after the fix.

### PR-03 — Deployed Content Security Policy does not match source policy

**Severity: High — security control absent on the public response**

**Evidence**

- A raw response-header check of `https://eagleeyeafrica.org/en` returned `Content-Security-Policy: upgrade-insecure-requests` only.
- It did **not** include the source-configured `default-src`, `script-src`, `script-src-attr`, `object-src`, `frame-ancestors`, `connect-src`, or other directives built by `lib/security/csp.ts` and set by `next.config.ts`.
- The same live response did include HSTS (`max-age=63072000; includeSubDomains; preload`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, Referrer-Policy, COOP/CORP, and Permissions-Policy. This isolates the observation to CSP rather than a wholly absent security-header set.

**Action**

Determine whether the deployed build omitted the application header or an upstream host/CDN overwrote it. Restore the complete intended policy at the effective response layer, then assert the full directive set in a production smoke test for HTML and API responses. Do not treat the presence of the CSP header name as proof that the policy is effective.

### PR-04 — Expired-content RLS hardening is not part of the deployed baseline

**Severity: High — conditional public data exposure**

**Evidence**

- The current worktree has an **untracked** `supabase/migrations/20261117000000_content_expiry_rls.sql` and a corresponding edit to `tests/integration/rls.test.ts`.
- The migration documents and fixes the gap: existing anonymous policies for published, non-archived `content_items` and related translations/media/extensions do not consistently exclude rows whose `expires_at` is in the past.
- The local static migration and security-posture checks pass with 87 migration files, but that only checks file shape and selected policy patterns. It does not prove this migration is committed, applied to the production database, or exercised against the live schema.

**Action**

Review and commit the migration with the expiry behavior test; apply it through the approved database change path; verify the production migration ledger; then run anonymous-role queries against expired parent and child records. Keep this release blocked until the deployed database—not just the worktree—enforces the expiry predicate.

### PR-05 — Production homepage emits a hydration error and failed resource responses

**Severity: High — visible runtime instability; root cause unconfirmed**

**Evidence**

- A production browser session on `/en` emitted minified React error **#418**, the React hydration-mismatch error, followed by client-side recovery.
- The same inspection observed two HTTP 400 resource failures. A first image scan found one incomplete image; a later scan found no failed images, so a persistently broken image is not established.
- In one unthrottled browser session, raw Navigation Timing reported approximately **7.6 s DOMContentLoaded** and **85.8 s load-event duration**. This is not a controlled performance result and may include delayed resources; it is a signal to investigate, not a claimed Core Web Vital.

**Action**

Reproduce with production builds in desktop and mobile browsers, capture the failing request URLs/status bodies and hydration component stack, and fix the server/client markup divergence. Add client-side error reporting and a regression test for the affected route(s). Confirm that the 400s and hydration error no longer occur before closing this finding.

### PR-06 — Database recovery has not been rehearsed

**Severity: High — recovery time and backup usability unknown**

**Evidence**

- `docs/disaster-recovery.md` §6 records the database/media drill as **“unrehearsed”** and says the first drill is due before scale-up.
- CI’s backup-integrity step only runs when selected storage secrets exist and uses `continue-on-error: true`; it verifies a sample of media copies, not a full database restore.
- The runbook’s `--mode=db` freshness check is documented, but there is no evidence here that it is monitored or that a database restore has succeeded.
- The observed cron 401 increases uncertainty around scheduled operations; it does not by itself prove the backup endpoint failed.

**Action**

Restore the latest database dump to an isolated temporary PostgreSQL/Supabase target, verify schema and critical row counts, boot a staging app against it, record RTO/RPO, and schedule quarterly drills. Make dump freshness/checksum alerts mandatory and distinguish media-object verification from database recoverability.

### PR-07 — “Ready” does not mean all essential operations are ready

**Severity: Medium — health signal can be green while workflows are broken**

**Evidence**

- The public `/api/ready` endpoint returned `200 {"status":"ready"}` during this audit.
- `app/api/ready/route.ts` checks configured Supabase/R2 environment, a database read, Supabase Storage listing, and an R2 listing. It does not check cron authentication/last-success heartbeats, Turnstile credentials, SMTP delivery, or the freshness/restore status of database backups.
- The live `/api/health` endpoint returned HTTP 200 but reported `version: "dev"`, so the response does not identify the deployed release.
- The live reminders workflow independently failed with 401 (PR-02), demonstrating that readiness can be green while scheduled work is not.

**Action**

Keep liveness, dependency readiness, and business-critical operational health separate. Add release SHA/build metadata to health responses. Alert on required cron heartbeats, Turnstile configuration, and backup freshness; expose only sanitized public status and keep detailed checks behind the dedicated probe secret.

### PR-08 — Resumable upload storage and per-IP limiter do not scale safely

**Severity: Medium — capacity and horizontal-scaling risk**

**Evidence**

- `lib/uploads/server.ts` stores resumable chunks under `os.tmpdir()/eea-uploads`, so sessions are tied to one process/filesystem and are not shared across instances.
- The server applies per-user/per-fragment request limits, but the chunk route’s module-level `chunkHits` map has no explicit size cap or expiry sweep. The single-shot upload route has a bounded/pruned map, but the chunk endpoint does not use that same bound.
- Stale sessions are purged best-effort after 12 hours; there is no visible aggregate temporary-disk quota or maximum active session bytes per user.
- `docs/validation-checklist.md` R10 explicitly leaves the 10-concurrent, 25 MB upload/load test unverified.

**Action**

Before increasing traffic or adding instances, move resumable state to shared object storage or another durable shared store; enforce per-user active-session and total-byte quotas; bound/expire all in-memory limiter state; and test concurrent uploads, interrupted resumes, disk exhaustion, and worker restarts at the actual hosting memory/disk limits.

### PR-09 — Accessibility and advanced interaction coverage is incomplete

**Severity: Medium — WCAG conformance not established**

**Evidence**

- The working tree expands `tests/e2e/a11y.spec.ts` to 30 fixed routes and adds an untracked 320px smoke test for public/focused routes and guard redirects. These are positive draft changes, but they do not include dynamic article/listing detail pages or authenticated admin workflows; `docs/validation-checklist.md` R12 independently lists those as open coverage items.
- Playwright is configured for desktop Chrome and Pixel 5, but E2E/axe tests were not run in this audit because the build gate fails.
- In the live browser spot check, a 390×844 viewport had no horizontal overflow (document width 375px); sampled images had `alt` attributes. These positive observations are not a substitute for axe or screen-reader testing.
- The first desktop screenshot showed the “Where is home?” place-selection dialog obscuring and blurring the homepage until dismissed. Its intent may be valid, but focus trapping, escape behavior, focus return, small-height viewports, and the interruption cost were not verified here.

**Action**

Add seeded dynamic article/listing pages and authenticated admin screens to axe coverage. Test keyboard-only completion of submission, place selection, and contact reveal; run a screen-reader pass; verify every dialog has a programmatic name, contained focus, escape/dismiss behavior, and focus restoration. Test the first-visit place prompt at short viewport heights and ensure it does not block the primary reading/submission path.

### PR-10 — Performance targets are not measured or gated

**Severity: Medium — low-bandwidth claims lack end-to-end evidence**

**Evidence**

- **Resolved PR-10:** `.github/workflows/lighthouse.yml` (weekly) + `.lighthouserc.cjs` now enforce mobile LCP/CLS/TBT + category scores + byte weight on `/en`, `/fr`, and a live article resolved from `sitemap.xml`. `npm run perf:lighthouse` runs the same budgets locally. Budgets: LCP < 2.5 s (warn) / 5 s (red); CLS < 0.1; TBT < 300 ms (warn) / 600 ms (red); performance ≥ 0.8 (warn) / 0.6 (red); byte weight ≤ 1.5 MB (warn) / 3 MB (red). The structural check (`verify-anon-bundle.mjs`) remains as a complementary safeguard; the ≤120 KB gzip JS target is a structural floor, not a replacement for lab measurement.
- `scripts/verify-anon-bundle.mjs` is a structural gate for fonts, dictionary leakage, and service-role references. It does not calculate compressed anonymous JavaScript size, despite the documented ≤120 KB gzip target.
- No controlled 4G/Moto-class LCP, INP, CLS, or TTFB measurement was performed or supplied in the project evidence. The raw live navigation timing noted in PR-05 is not equivalent.
- Positive implementation evidence includes self-hosted fonts, `SmartImage`/AVIF support, cached public reads, and full-text search with trigram/unaccent migrations. The old `docs/audit.md` statement that full-text search is missing is stale: the current search query and migrations implement it.

**Action**

Add repeatable mobile performance CI or a scheduled lab job for homepage and article routes, with a controlled device/network profile and actual JS/LCP/CLS/INP/TTFB budgets. Preserve the existing structural checks as complementary safeguards, not as substitutes for measurements. Collect real-user Web Vitals where consent/privacy requirements permit.

### PR-11 — Release and production change controls are not demonstrably enforced

**Severity: Medium — process and supply-chain risk**

**Evidence**

- `.github/workflows/ci.yml` makes `npm audit` advisory with `continue-on-error: true`. Generated DB-type checks and database lint are conditional on secrets; backup verification is also conditional and advisory.
- The tracked workflow set on `origin/main` has no application deployment workflow; the documented deployment path is Hostinger hPanel/Git integration. A newly surfaced **untracked** `.github/workflows/deploy.yml` draft does exist, but its production and preview steps deploy to Vercel, not Hostinger.
- The live response identifies `Server: hcdn`, consistent with the Hostinger deployment docs and inconsistent with the draft workflow's Vercel target. Do not run the draft's production path until the actual target/project and domain ownership are explicitly reconciled.
- The draft declares a GitHub `environment`, but required reviewer/branch protection settings are external and were not verifiable. It also removes the explicit `permissions: contents: read` from the edited CI workflow and drops its prior advisory npm audit step; its exact branch-protection/token behavior has not been validated.
- The untracked RLS workflow runs the RLS harness directly and then invokes `npm run test:rls`, whose package script invokes the harness again. Simplify to one harness invocation and validate the draft workflow before adoption.
- `.github/workflows/db-push.yml` is manually dispatched and defaults to dry-run, which is a useful safeguard, but its YAML does not declare a protected GitHub `production` environment/reviewer gate for the apply job.
- `docs/hosting-architecture.md` and `deploy/hostinger-business.md` still contain unchecked production setup/approval/configuration confirmations.

**Action**

Define a release pipeline that builds one immutable artifact, deploys to staging, runs smoke/accessibility checks, and promotes only the same artifact after approval. Put production migrations behind a protected environment and verified backup/preflight checks. Make critical/high dependency findings block or require documented, expiring exceptions; do not let optional checks silently become release evidence.

### PR-12 — Operational documentation has materially drifted from the code and evidence

**Severity: Medium — operators cannot safely rely on a single source of truth**

**Evidence**

- `docs/observability.md` still instructs operators to install `@sentry/nextjs` and wrap the Next config, and says Sentry is inert until that step. The package, `next.config.ts` integration, and server/edge/client Sentry initialization files already exist.
- `docs/ui-ux-audit.md` claims a 260-test clean baseline from 2026-09-23; the current local run is 843 passed, 1 failed, 21 skipped.
- `docs/audit.md` still states that full-text search is absent, contradicted by `lib/queries/search.ts` and the 20261009 FTS/trigram/unaccent migrations.
- `docs/known-issues.md` says it was regenerated on 2026-10-21, a future date relative to this audit date of 2026-10-03. Migration filenames also extend to 2026-11; ensure these are deliberately future-dated rather than mistaken deployment/readiness evidence.
- ESLint reports 35 warnings; Sentry config also emits deprecation warnings for `disableLogger` and `automaticVercelMonitors` during production build.

**Action**

Choose a canonical current operational-status document and refresh stale audit/UI/observability statements from verified code and live checks. Keep future-dated migrations explicitly labeled as staged work if intentional. Triage the warning set and update deprecated Sentry config using the installed SDK’s supported options.

## Claims versus verified operational reality

| Project claim or implication | What was verified | Conclusion |
|---|---|---|
| `/api/ready` means the production stack is healthy | It returned `ready`, while the scheduled reminders call returned 401 | Readiness scope is narrower than operational health. |
| Strict CSP is configured in `next.config.ts` | Live HTML response had only `upgrade-insecure-requests` | Source configuration is not reflected in the sampled production response. |
| Cron jobs are wired and verified | Static manifest passes; live reminder job failed authorization | Wiring is not execution success. |
| Backup pipeline is operational | Backup scripts exist; restore log is unrehearsed and CI check is optional/advisory | Backup recoverability is unproven. |
| Production build and tests are green | Build/typecheck fail; one test fails (the current edited test throws before exercising the audio assertion) | Release gate is red in the audited worktree. |
| A release deployment path is being added | An untracked deploy workflow targets Vercel, while production responds from Hostinger (`Server: hcdn`) | The deployment draft is not aligned with the current documented/live provider and is not active on `origin/main`. |
| 120 KB gzip/LCP performance budgets are enforced | Weekly Lighthouse CI lab job (`.github/workflows/lighthouse.yml`) enforces mobile LCP/CLS/TBT + scores + byte weight on homepage + live article | Resolved — budgets are now measured and gated. |
| Sentry needs to be installed and wired | SDK/config/init files are present | Observability runbook is stale; actual DSN/event delivery still unverified. |
| All operational changes are represented by current branch | Local `HEAD`, `origin/main`, current worktree, and the production workflow SHA differ | Do not assume local changes are deployed. |

## Recommended release sequence

### P0 — before another production release

1. Resolve PR-01; require `npm run check`, `npm test`, and `npm run build` to pass on the release SHA.
2. Resolve PR-03 and verify the complete CSP on the actual production response.
3. Resolve PR-02; manually dispatch and verify each protected production cron, then observe at least one full schedule cycle.
4. Review, commit, apply, and behaviorally verify PR-04’s expiry-aware RLS migration.
5. Reproduce and close the live hydration error and HTTP 400s in PR-05.

### P1 — before increasing traffic or relying on the platform for critical publishing

6. Complete and log a full database restore drill (PR-06); make freshness and integrity alerts actionable.
7. Close PR-07 by making health/readiness semantics, build version, and required operational dependencies explicit.
8. Close PR-08 with shared upload state, quotas, bounded limiter memory, and load tests against the real hosting tier.
9. Complete missing axe, keyboard, and screen-reader paths in PR-09.
10. **Resolved PR-10:** Weekly mobile Lighthouse CI lab job enforces LCP/CLS/TBT/scores/byte-weight budgets; run locally via `npm run perf:lighthouse`. Protected release/migration gates in PR-11.

### P2 — improve ongoing reliability

11. Refresh documentation and remove misleading stale statuses (PR-12).
12. Establish an owner and review cadence for dependency updates, Sentry event delivery, alert tests, restore drills, and production readiness evidence.

## Verification record

| Check | Result |
|---|---|
| `npm run check` | **Failed** at TypeScript stage (PR-01); later chained checks did not run in that command. |
| `npm run build` with CI dummy Supabase environment | **Failed** during TypeScript validation after compilation (PR-01). |
| `npm test` (later working-tree rerun) | **Failed:** 843 passed, 1 failed, 21 skipped; the edited failing test throws `splitTopLevelNodes is not a function`. An earlier run exposed the audio round-trip loss. |
| `npm run lint` (later working-tree rerun) | **Passed with 38 warnings**, zero errors. |
| `npm run verify:posture` | **Passed** static posture checks. |
| Migration manifest | **Passed** for 87 files in the current worktree; does not assert production application. |
| Cron manifest | **Passed** static endpoint/schedule mapping; does not test live credentials or endpoint success. |
| Production `/api/health` | HTTP 200; `version: "dev"`. |
| Production `/api/ready` | HTTP 200; public response says `ready`. |
| Production homepage | HTTP 200; canonical and EN/FR/x-default alternates use `https://eagleeyeafrica.org`. |
| Production security headers | HSTS, nosniff, frame denial, Referrer Policy, COOP/CORP, and Permissions Policy present; CSP incomplete as described in PR-03. |
| Production browser review | React #418 and HTTP 400 resource failures observed; not a controlled performance or full accessibility audit. |
| GitHub Scheduled jobs #474 | **Failed**: reminders endpoint returned HTTP 401. |
| Playwright / axe | Not run; production build gate failed before a trustworthy current build was available. The newly added 320px test and expanded axe route list remain unverified drafts. |
