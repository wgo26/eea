# Observability runbook

How errors, logs, uptime, and critical incident paging work — and what an
operator must configure for production.

## 1. Structured logging

Every server module logs through `lib/observability/logger.ts` (the cron routes,
uploads pipeline, storage, security guards, and all public query layers). Each
line is a single JSON object:

```json
{ "ts": "2026-09-09T06:00:00.000Z", "level": "error", "scope": "cron/daily-digest",
  "message": "Digest delivery failed", "correlationId": "…", "durationMs": 42 }
```

Fields: `ts` (ISO), `level` (info/warn/error), `scope`, `message`, plus
`correlationId` (generated per request/action) and optional `userId`,
`clientIp`, `durationMs`, `counts`, `error`.

**Convention:** assume a log aggregator (Datadog, CloudWatch, Axiom, …) parses
the JSON. Do **not** add new `console.log/error` calls in server code — route
them through `logger` so fields stay consistent.

## 2. Error tracking (Sentry)

`logger` best-effort forwards `warn`/`error` events to Sentry **when a Sentry
SDK is installed and a DSN is set** — the import is dynamic so the app never
breaks when Sentry is absent.

Setup:

1. Create a project at <https://sentry.io> (or self-hosted).
2. `npm i @sentry/nextjs`
3. Add to `next.config.ts`:

   ```ts
   import { withSentryConfig } from "@sentry/nextjs";
   const nextConfig = withSentryConfig({ /* existing config */ }, { /* sentry options */ });
   ```

4. Set `SENTRY_DSN` (server) / `NEXT_PUBLIC_SENTRY_DSN` (browser) in production
   env. `.env.example` documents `SENTRY_DSN=`.

Until step 3 is done, Sentry is inert; errors go to stdout (see §5).

## 3. Uptime monitoring

`/api/health` (liveness: process is up, dependency-free — stays green during a
DB outage by design) and `/api/ready` (readiness: pings Supabase and R2,
returns 200 only when both answer) exist. **Something must call them** —
recommended: a free-tier monitor (UptimeRobot, BetterStack) with TWO checks:

1. Anonymous readiness: `https://<domain>/api/ready` at 60 s interval, alert
   on any non-200. Public body is `{status, timestamp, correlationId}` only.
2. Authenticated freshness: `https://<domain>/api/ready?fresh=1` with header
   `Authorization: Bearer <READY_PROBE_SECRET>` at 5 min interval, alert on
   non-200 or `status: degraded`. `READY_PROBE_SECRET` is DEDICATED (Phase 0:
   no fallback to `CRON_SECRET`). `?fresh=1` bypasses the 15 s probe cache and
   is authenticated-only so anonymous callers cannot force unbounded
   DB/storage load.

Pair both with the GitHub `scheduled-jobs.yml` watchdog (fails when no
scheduled run succeeded in 3 h — covers the */15 notify worker). The
`db-maintenance` cron returns 500 when schema verification finds missing
objects — wire that 500 to the same alert channel.

## 4. Critical incident paging (webhook)

`DIGEST_WEBHOOK_URL` is an optional Discord/Slack-compatible paging destination
used by critical-mode incident actions (`lib/notify/webhook.ts`). It is not a
cron endpoint or a reader-digest delivery channel. When unset or unavailable,
the incident action still completes and logs the paging failure; the in-app
`security.critical` alert remains available. Point the URL at a restricted
channel with mobile push and rotate it like any other credential.

### 5. Database restore drill

Weekly rehearsal (`scripts/restore-drill.mjs`, `.github/workflows/restore-drill.yml` Sundays 05:00 UTC):
downloads the latest `db_dumps` artifact from B2, verifies SHA-256 + size against
the ledger, runs `pg_restore --list` for a sanity check, restores into a
throwaway Postgres (`postgres:16` GitHub Actions service), and asserts:

- **Migration coverage:** every repo migration that predates the dump is
  present in `supabase_migrations.schema_migrations` on the restored database.
- **Row-count floors:** published content, profiles, user_roles, audit trail,
  and the dump ledger each have ≥1 row.
- **Restored ≤ live:** when `SUPABASE_DB_URL` is set, restored counts must not
  exceed live counts (a restore may lag, never exceed).

Exit 0 = pass; exit 1 = drill failed; exit 2 = missing environment (fail-closed).
Secrets required: `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`B2_ENDPOINT`, `B2_KEY_ID`, `B2_APPLICATION_KEY`, `B2_BACKUP_BUCKET`.

### 6. When something looks wrong

| Symptom | Where to look |
|---|---|
| Public pages error | `npm start` logs (Hostinger), or Sentry (§2) |
| Backup pipeline | `scripts/verify-backup.mjs --mode=verify` (+ the 02:00 GitHub run) |
| Restore not rehearsed | `scripts/restore-drill.mjs` (§5) / `.github/workflows/restore-drill.yml` |
| DB maintenance | `/api/cron/db-maintenance` response (purged rows, missing objects) |
| Upload failing | `logger` `uploads` scope: ownership/rate-limit/validation errors |
| No critical webhook page | Confirm `DIGEST_WEBHOOK_URL` is set and the destination accepts posts |

Maintain this document when adding metrics or channels.