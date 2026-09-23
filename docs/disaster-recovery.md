# Disaster recovery runbook

Single-operator restore guide for Eagle Eye Africa. If you are new on call,
this file plus `deploy/hostinger-business.md` (env/secrets) is everything.

## 1. Where the backups live

| What | Where | How to list |
|---|---|---|
| Nightly `pg_dump` (custom format, gzip) | B2 bucket `B2_BACKUP_BUCKET`, prefix `db-dumps/` | `SELECT filename, sha256, size_bytes, created_at, expires_at FROM db_dumps ORDER BY created_at DESC LIMIT 5;` |
| Media mirror (R2 + Supabase Storage → B2) | Same B2 bucket, original `storage_key` paths | `SELECT storage_key, backup_sha256, backed_up_at FROM media_assets WHERE backed_up_at IS NOT NULL ORDER BY backed_up_at DESC LIMIT 5;` |
| Supabase dashboard backups / PITR | Supabase dashboard → Database → Backups (plan-tier dependent, NOT managed by this repo) | Dashboard UI |

## 2. Retention matrix (enforced vs documented)

| Store | Retention | Enforced by |
|---|---|---|
| `db_dumps` rows + B2 objects | 30 days (`expires_at`) | `app/api/cron/db-dump/route.ts` prunes expired rows + objects after each successful dump (bounded 20/run, best-effort); `prunedExpired` in the cron response |
| B2 media mirror | Unbounded (mirror-only) | **Not enforced** — deleted media leaves orphaned B2 objects. Mitigation: B2 dashboard lifecycle rules (operator-side). Do not wire deletes into the app mirror without a second review — a bug there destroys the cold copy. |
| `notification_outbox` | 90 days, terminal rows only | `pruneOutbox()` inside the notify worker (`lib/notify/worker.ts`) |
| `rate_limit_hits` | 24 h sliding window | `db_maintenance_report()` nightly + in-band GC |

Freshness monitors: `node scripts/verify-backup.mjs --mode=db` exits 1 when the
latest dump is older than 48 h or lacks a sha256 (wire to the uptime monitor or
CI); `--mode=verify` hash-compares media rows; `--mode=drill` restores one
media object to disk.

## 3. Restore: database (staging first, always)

Never restore straight into production. Rehearse quarterly and log it in §6.

1. Freshness: `node scripts/verify-backup.mjs --mode=db` (must print OK).
2. Download the latest `db-dumps/<file>` from B2 (dashboard or `b2` CLI).
3. Sanity: `pg_restore --list <file> | head -50` — schema + data sections appear.
4. Provision an ephemeral Postgres (local `postgres:16` container or a spare
   Supabase project — never the prod ref).
5. `pg_restore --dbname=<ephemeral> --no-owner <file>`.
6. Row-count assertions against prod (read-only selects):
   `content_items`, `profiles`, `notification_outbox` — must match within ±1%.
7. Boot the app against the restored DB (`SUPABASE_DB_URL` → ephemeral is NOT
   used by the app; point a staging env's Supabase keys at the spare project)
   and load `/en`, one detail page, `/admin/dashboard`.

**Acceptance:** full restore + row counts match + staging boots. Record
time-to-restore in §6.

## 4. Restore: media

1. `node scripts/verify-backup.mjs --mode=drill --key=<storage_key>` restores
   one B2 object to `./.tmp/restore-drill` and hash-checks it.
2. Full-bucket restore: B2 dashboard → download prefix, or `b2 sync` to a
   staging R2 bucket, then point staging `R2_*` env at it.
3. Verify: `node scripts/verify-backup.mjs --mode=verify --batch=50`.

## 5. Ownership (who/what runs this)

- Scheduler: `.github/workflows/scheduled-jobs.yml` (02:00 backup, 02:30
  maintenance, 02:45 dump) + hourly watchdog. GitHub auto-disables schedules
  after 60 days of repo inactivity — the external `/api/ready` monitor is the
  backstop (`docs/observability.md` §3).
- Secrets: `CRON_SECRET` (all crons), `SUPABASE_DB_URL` (dump only),
  `B2_*`/`R2_*` (mirror/dump). Rotation: `SECURITY.md` runbook.
- Pre-launch demo decision: `node scripts/teardown-demo.mjs` +
  `npm run verify:clean` wipes seed demo rows (About/Legal kept). Record the
  go-live choice here: seed content was REMOVED / KEPT on ________ (date,
  operator). Do not run teardown against production after real user data
  exists — it deletes by seed keys only, but verify first with
  `verify:clean`.

## 6. Drill log (fill in, quarterly)

| Date | Scope (db / media / full) | Time-to-restore | Operator | Notes |
|---|---|---|---|---|
| _unrehearsed_ | — | — | — | First drill due before scale-up; see `docs/validation-checklist.md` R7 |
