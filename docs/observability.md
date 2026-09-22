# Observability runbook

How errors, logs, uptime, and the nightly ops digest work — and what an operator
must configure for production.

## 1. Structured logging

Every server module logs through `lib/observability/logger.ts` (the cron routes,
uploads pipeline, storage, security guards, and all public query layers). Each
line is a single JSON object:

```json
{ "ts": "2026-09-09T06:00:00.000Z", "level": "error", "scope": "cron/ops-digest",
  "message": "webhook POST failed", "correlationId": "…", "durationMs": 42 }
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

## 4. Nightly ops digest (webhook)

`/api/cron/ops-digest` (06:00 UTC on Vercel via `vercel.json`, or via the
GitHub Actions schedule — see README → Scheduled jobs) posts a queue summary to
a Discord/Slack-compatible webhook when **`DIGEST_WEBHOOK_URL`** is set:

- moderation queue (pending / in_review / needs_clarification submissions)
- legal inbox (open `reports`: takedowns + data requests)
- ad inquiries (`ad_campaigns` pending)
- storage (assets pending backup / pending verification)
- staff account count

The endpoint is a **watchdog**: it posts even when every queue is zero, so a
failed nightly run (workflow failure or webhook 5xx) is itself the alert.
Skipped cleanly when the webhook URL is unset (endpoint returns
`200 {"skipped":true}`).

## 5. What to check when something looks wrong

| Symptom | Where to look |
|---|---|
| Public pages error | `npm start` logs (Hostinger), or Sentry (§2) |
| Backup pipeline | `scripts/verify-backup.mjs --mode=verify` (+ the 02:00 GitHub run) |
| DB maintenance | `/api/cron/db-maintenance` response (purged rows, missing objects) |
| Upload failing | `logger` `uploads` scope: ownership/rate-limit/validation errors |
| Nothing delivered | Confirm `CRON_SECRET` + `DIGEST_WEBHOOK_URL` are set on the host |

Maintain this document when adding metrics or channels.