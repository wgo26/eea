# Hostinger Business Node.js Deployment

This project is being deployed through Hostinger Business hosting using the
"Push your code, we host it" Node.js option. It is not a VPS deployment.

## Before configuring hPanel

- [ ] Confirm the Business plan explicitly supports persistent Node.js applications.
- [ ] Confirm Next.js SSR, API routes, and `next start` are supported.
- [ ] Confirm Node.js 22 LTS is available. If it is not, record the supported LTS version.
- [ ] Confirm the plan provides secure server-side environment variables.
- [ ] Confirm the plan provides enough memory and storage for `npm run build`.
- [ ] Revoke the Supabase service-role key previously exposed in the local `.env`.
- [ ] Create a replacement service-role key in Supabase.

## Create the application

In Hostinger hPanel:

1. Choose **Push your code, we host it**.
2. Select **Node.js**, not Static app.
3. Connect the Git repository or upload the project according to Hostinger's workflow.
4. Set the application root to the repository root containing `package.json`.
5. Select Node.js 22 LTS, if available.
6. Use this build command:

```text
npm ci && npm run build
```

1. Use this start command:

```text
npm run start
```

1. Set the application port using Hostinger's provided port mechanism. Do not hardcode a
   public port unless hPanel specifically requires it.
1. Add the production environment variables from `.env.example` in hPanel. Never commit
   the production values to Git.
1. Deploy once using the Hostinger interface.

## Required production values

```text
NEXT_PUBLIC_SITE_URL=https://eagleeyeafrica.org
NEXT_PUBLIC_SUPABASE_URL=<production Supabase URL>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<production publishable/anon key>
SUPABASE_SERVICE_ROLE_KEY=<new server-only key>
TURNSTILE_SECRET_KEY=<production Turnstile secret — bot protection is fail-closed without it>
NEXT_PUBLIC_TURNSTILE_SITE_KEY=<production Turnstile site key>
R2_ACCOUNT_ID=<production value>
R2_ACCESS_KEY_ID=<production value>
R2_SECRET_ACCESS_KEY=<production value>
R2_BUCKET=<production value>
R2_PUBLIC_BASE_URL=<production public media URL>
B2_ENDPOINT=<production value>
B2_KEY_ID=<production value>
B2_APPLICATION_KEY=<production value>
B2_BACKUP_BUCKET=<production value>
SUPABASE_ADMIN_ASSET_BUCKET=admin-asset
CRON_SECRET=<long random value — guards /api/cron/*, fail-closed>
READY_PROBE_SECRET=<long random value — unlocks detailed /api/ready; never reuse CRON_SECRET>
ALLOW_UNAUTH_CRON=<unset in production; =1 only for explicit local drills>
NODE_ENV=production
TRUSTED_PROXY_COUNT=1
APP_VERSION=<git sha or release tag, surfaced on /api/health>
```

Production secrets checklist (all fail closed — see `lib/security/cron-auth.ts`
and `app/api/ready/route.ts`):

Launch blockers (public intake silently breaks or opens to bots without them):
`TURNSTILE_SECRET_KEY` + `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (bot protection is
fail-closed in production — `verifyTurnstileToken` returns false when the
secret is unset, so anonymous forms reject until both keys are set).

Optional: `DIGEST_WEBHOOK_URL`, `SMTP_*`, `WHATSAPP_*` (graceful skips with
honest worker statuses — safe to omit at launch).

## Domain and HTTPS

In Hostinger:

- [ ] Attach `eagleeyeafrica.org` to the Node.js application.
- [ ] Attach `www.eagleeyeafrica.org`.
- [ ] Point the domain's DNS records to the targets Hostinger provides.
- [ ] Enable Hostinger SSL for both names.
- [ ] Redirect `www.eagleeyeafrica.org` to `https://eagleeyeafrica.org`.
- [ ] Set `NEXT_PUBLIC_SITE_URL` to the non-`www` HTTPS URL.

Do not use the old VPS instructions for DNS or TLS. Hostinger manages those layers for
this hosting plan.

## Supabase production configuration

In Supabase Authentication settings:

- [ ] Set the Site URL to `https://eagleeyeafrica.org`.
- [ ] Allow `https://eagleeyeafrica.org/auth/callback`.
- [ ] Allow `https://eagleeyeafrica.org/en/auth/callback`.
- [ ] Allow `https://eagleeyeafrica.org/fr/auth/callback`.
- [ ] Configure password reset and email confirmation URLs.
- [ ] Configure production SMTP.
- [ ] Verify the `admin-asset` Storage bucket and policies.

The repository migration [20260907000000_admin_asset_storage.sql](../supabase/migrations/20260907000000_admin_asset_storage.sql)
creates the `admin-asset` bucket with a 5 MiB limit, the application MIME allowlist,
public reads, and staff-only writes/updates/deletes. Apply it with the approved
Supabase migration process before testing uploads. Do not create a second bucket with
a different name.

In Supabase Storage, verify after migration:

- [ ] Bucket name is exactly `admin-asset`.
- [ ] Public bucket access is enabled because the app uses public asset URLs.
- [ ] Maximum file size is 5 MiB.
- [ ] Allowed MIME types are JPEG, PNG, WebP, MP4, MOV, MP3, M4A, WAV, and PDF.
- [ ] Anonymous users can read an existing public asset URL.
- [ ] Staff users can upload under the `admin_asset/` path.
- [ ] Non-staff authenticated users cannot upload, update, or delete admin assets.
- [ ] Anonymous users cannot upload, update, or delete admin assets.

## Supabase project checklist

These settings require the Supabase dashboard and cannot be confirmed from this
repository alone:

- [ ] Production project reference and region recorded.
- [ ] Production plan supports expected database, Auth, Storage, and bandwidth usage.
- [ ] Automated database backups enabled.
- [ ] Point-in-Time Recovery decision recorded; enable it if the recovery objective requires it.
- [ ] Network restrictions reviewed and enabled where the plan supports them.
- [ ] Auth Site URL is `https://eagleeyeafrica.org`.
- [ ] Allowed redirect URLs include `https://eagleeyeafrica.org/auth/callback` (plus `www.` variant). Note: the callback is a root route (`app/auth/callback/route.ts`, exempt from locale redirect) — there are no `/en|fr/auth/callback` routes; locale is carried in `?next=`.
- [ ] Password reset redirect uses the production HTTPS domain.
- [ ] Email confirmation redirect uses the production HTTPS domain.
- [ ] Production SMTP is configured and a test email was delivered.
- [ ] Sender name and sender email are correct.
- [ ] SPF, DKIM, and DMARC pass for the sender domain.
- [ ] Public signup decision is recorded; do not leave it enabled accidentally.
- [ ] Auth rate limits are configured.
- [ ] CAPTCHA decision is recorded for signup, login, reset, and anonymous submissions.
- [ ] R2 public URL returns a real HTTPS URL.
- [ ] R2 production credentials work for an upload.
- [ ] B2 endpoint includes the correct `https://` scheme and backup credentials work.
- [ ] `media_assets.backed_up_at` exists after migrations.

## Scheduled jobs (cron)

`vercel.json` declares **six** jobs, but Vercel crons only fire on Vercel —
**not** on Hostinger Business Node.js hosting. All six must be scheduled
externally:

| Endpoint | Schedule (UTC) | Purpose |
|---|---|---|
| `POST/GET https://eagleeyeafrica.org/api/cron/storage-backup?batch=100` | 02:00 daily | R2 + Supabase Storage → Backblaze B2 delta backup |
| `POST/GET https://eagleeyeafrica.org/api/cron/db-maintenance` | 02:30 daily | Rate-limit purge, DB telemetry, schema integrity verification (500 = alert) |
| `POST/GET https://eagleeyeafrica.org/api/cron/db-dump` | 02:45 daily | `pg_dump` → B2 compressed dump + `db_dumps` row (needs `SUPABASE_DB_URL`) |
| `POST/GET https://eagleeyeafrica.org/api/cron/ops-digest` | 06:00 daily | Post a queue summary (moderation/legal-inbox/ads/storage) to `DIGEST_WEBHOOK_URL`; 200 `{skipped:true}` when unset |
| `POST/GET https://eagleeyeafrica.org/api/cron/notify` | `*/15 * * * *` | Drain the notification outbox → in-app / email / WhatsApp |
| `POST/GET https://eagleeyeafrica.org/api/cron/reminders` | `0 * * * *` hourly | Deliver due event "remind me" rows via the outbox |

Authentication: send `Authorization: Bearer <CRON_SECRET>` (the value from
hPanel's env vars). Missing/wrong secret → 401; the endpoints fail closed in
production (500 when `CRON_SECRET` is unset in production).

Options, in order of preference:

1. **GitHub Actions scheduled workflow — already in this repo:**
    `.github/workflows/scheduled-jobs.yml` fires **all six** endpoints on the
   schedules above once the `CRON_SECRET` repo secret is set, and supports
   manual runs from the Actions tab (`workflow_dispatch`). Zero extra
   infrastructure, auditable runs, and it works even when no one is pushing.
   It also runs an hourly **watchdog** (10 min past the hour) that fails the
   run — raising a GitHub failure email — when no *scheduled* run of the
   workflow has succeeded in the last 3 hours. Because `notify` runs every 15
   minutes, that 3-hour gap means the outbox has stalled.
2. **External cron service** (e.g. cron-job.org) hitting all six URLs with the
   bearer header. Simple, but the secret lives with a third party.
3. **Upgrade to a VPS** — real crontab/systemd timers, plus full control of
   the runtime. Choose this if the Business plan pre-flight below fails.

### Ownership and known scheduler limits

- **Owner:** the release engineer on call owns the schedule. A failed run in
  the Actions tab is a production incident for `notify` and `reminders`
  (users stop receiving mail/WhatsApp) and a data-safety incident for
  `storage-backup`.
- GitHub Actions schedules can be delayed ~15–30+ minutes under load, and
  **GitHub auto-disables scheduled workflows after 60 days without repository
  activity** — which also silences the watchdog. To close that hole, pair the
  watchdog with an external uptime monitor pointed at `/api/ready` (see
  `docs/observability.md`) and keep at least one commit per quarter.
- `ops-digest` is the moderation-loop watchdog: if it stops, unmoderated queue
  depth grows unnoticed. Keep `DIGEST_WEBHOOK_URL` set in production so the
  digest is never a silent no-op.

## Supabase migrations

Apply all migrations from `supabase/migrations/` in filename order
(`scripts/verify-migrations.mjs`, wired into `npm run check`, reports the
count — currently 57 — and gates the build on filename format, duplicate
timestamps, and empty files):

- Preferred: Supabase CLI — `supabase link --project-ref <ref>`, then
  `supabase db push` (records applied versions in `supabase_migrations`).
- Fallback: Supabase dashboard → SQL Editor, pasting each file in order.
  Every migration is idempotent (create-if-not-exists / drop-policy-if-exists),
  so a half-finished run can be resumed safely.
- Do **not** use `scripts/apply-migrations.mjs` for production — it is a local
  convenience script, not the controlled migration path.
- **Never reuse a migration version prefix.** `supabase_migrations` PK is
  `(version)`, so two files sharing a timestamp can never both be recorded —
  `db push` fails with a duplicate-key violation after running the second
  migration's statements (which then roll back). The original
  `20260921000000_production_phase1_3_fixes.sql` hit this (same version as
  `20260921000000_db_maintenance.sql`) and was renumbered to
  `20260921120000_production_phase1_3_fixes.sql`.
- Verify afterwards: all tables/indexes/RLS present, the `pg_cron`
  scheduled-publishing + listing-expiry jobs exist, and the `admin-asset`
  Storage bucket was created by `20260907000000_admin_asset_storage.sql`.

Troubleshooting `supabase db push` timing out locally with
`failed to write startup message (i/o timeout)`: the TCP handshake succeeds
but the Postgres startup exchange stalls — a VPN/proxy/AV intercepting
outbound traffic or ISP-level filtering, not a credentials problem. Try in
order: disable VPN/proxy/antivirus and retry; test from a different network
(mobile hotspot); skip the CLI login-role machinery entirely with
`supabase db push --db-url "postgresql://postgres.<project-ref>:<password>@aws-1-eu-west-1.pooler.supabase.com:5432/postgres"`;
or run **Actions → Database migrations (db push)** from this repository —
GitHub's runners have unfiltered egress, so the local network never enters
the path (requires the `SUPABASE_DB_URL` secret; defaults to a dry run).

`db push` also refuses, by default, to apply local migrations whose timestamp
is older than the remote's newest applied migration ("Found local migration
files to be inserted before the last migration on remote database") — an
out-of-order guard against stale branches. When a back-dated repair migration
is intentional (e.g. `20260920000001_remote_drift_repair.sql`), rerun with
`supabase db push --include-all` after confirming the pending list is exactly
what you expect.

## Smoke test after deployment

- [ ] `https://eagleeyeafrica.org` loads.
- [ ] `/en` and `/fr` load.
- [ ] `/robots.txt` loads.
- [ ] `/sitemap.xml` loads.
- [ ] Unprefixed routes redirect to a locale route.
- [ ] Signup/login works.
- [ ] Password reset works.
- [ ] Supabase Auth callback works.
- [ ] Anonymous submission works.
- [ ] Authenticated upload works.
- [ ] Admin authorization blocks non-staff users.
- [ ] Public media loads from R2.
- [ ] No server-only key appears in browser source or responses.

## Important limitation

If hPanel does not expose a persistent Node.js server, custom environment variables, or
the `npm run start` command, this plan cannot host the current application. Choose a
Hostinger VPS or another Node.js SSR host before proceeding; do not convert this app to a
static export without redesigning authentication, API routes, and server-side queries.

## Runtime contract (Phase 5 — single vs multi instance)

The Business plan runs **one Node.js instance**. The app is coded to survive a
second instance, but three things degrade until shared state exists — so treat
any scale-out as a project, not a toggle:

- **Chunked-upload sessions** live on local disk (`os.tmpdir()/eea-uploads`,
  swept nightly by the db-maintenance cron). A resumed upload landing on the
  other instance restarts from zero. Fix before scaling: R2/Supabase-multipart
  or DB-backed sessions.
- **In-memory edge throttles** (`/api/uploads`, `/api/uploads/chunk`,
  `/api/ads/event`) are per-process fast paths; the durable Postgres limiter
  underneath holds across instances, so abuse is still bounded — just noisier.
- **Ready-probe cache** (`PROBE_TTL_MS`) is per instance; monitors should
  expect one probe burst per instance per TTL, not one globally.

Verify on every deploy (hPanel → app logs or a shell):

- [ ] `NODE_ENV=production` (crons fail closed; dev-only bypasses off).
- [ ] `TRUSTED_PROXY_COUNT` equals the real proxy depth in front of the app
  (default 1: Hostinger terminates TLS in front of Node). Wrong value either
  trusts forged `X-Forwarded-For` hops (too high) or buckets all traffic as one
  IP (0 with forwarded headers). See `lib/security/rate-limit.ts`.
- [ ] `ALLOW_UNAUTH_CRON` is unset (local-drill opt-in only).
- [ ] `CSP_REPORT_URI` set if violation reports are wanted (wired in
  `lib/security/csp.ts`; blank = no reporting, still enforced).

## Go-live demo-content decision

`node scripts/teardown-demo.mjs` + `npm run verify:clean` removes seed demo
rows (About/Legal pages are kept). Record the decision in
`docs/disaster-recovery.md` §5 — REMOVED or KEPT, with date + operator. Never
run teardown after real user data exists.

## Disaster recovery

Backups, retention, restore procedures and the quarterly drill log live in
[`docs/disaster-recovery.md`](../docs/disaster-recovery.md). Read it before
you need it: dump freshness (`verify-backup --mode=db`), media verify/drill,
and the staging-first restore steps are all there.
