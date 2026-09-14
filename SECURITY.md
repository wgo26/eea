# Security Policy

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Report vulnerabilities privately through GitHub's **Private vulnerability
reporting** (Security tab → Report a vulnerability) on this repository. If
you are a staff member, you can also reach the maintainers directly through
the internal contact channel.

Please include:

- A description of the issue and its impact
- Step-by-step reproduction (URL, account role, request/payload if relevant)
- Any proof-of-concept code
- Your contact info and whether you want credit

You will receive an acknowledgement within 5 business days, followed by a
fix timeline and coordinated disclosure plan. Please allow a reasonable
window before any public disclosure.

## Scope

In scope:

- Authentication and session handling (Supabase Auth flows, callbacks)
- Authorization: role/capability bypasses, RLS policy gaps, privilege escalation
- The upload pipeline (`/api/uploads`) — MIME/magic-byte bypasses, path handling
- PII exposure in server-rendered HTML or API responses
- Injection via Server Functions, submissions intake, or stored content
- The cron endpoints (`/api/cron/*`) and their `CRON_SECRET` guarding
- Rate-limit and anti-abuse controls (`lib/security/`)

Out of scope:

- Volumetric/DoS attacks without an identified logic flaw
- Social engineering of staff or hosting providers
- Issues in third-party services' own dashboards (Supabase, Cloudflare,
  Backblaze, Hostinger) — report those upstream
- Automated scanner output without a demonstrated impact

## What's already in place

- **Defense in depth:** page/layout guards → capability-checked Server
  Functions → row-level security on every table; audit logging on admin writes.
- **PII protection:** seller contact details are never server-rendered into
  public HTML; contact reveal is a rate-limited authenticated action.
- **Upload hardening:** per-IP rate limiting, size caps, MIME allowlist +
  magic-byte checks via `sharp`.
- **Abuse controls:** Postgres-backed rate limiting, optional Cloudflare
  Turnstile (enabled by setting `TURNSTILE_SECRET_KEY`), honeypots.
- **Transport & headers:** `X-Content-Type-Options`, `X-Frame-Options: DENY`,
  `Referrer-Policy`, `Permissions-Policy` set in `next.config.ts`.
- **Fail-closed cron:** `/api/cron/*` reject unauthenticated calls when
  `CRON_SECRET` is configured, and fail loudly (500) when integrity checks
  find problems so uptime monitors alert.

## Deployment responsibilities

Security is a shared stack — repository + Supabase dashboard + hosting. The
operator checklist in [`deploy/hostinger-business.md`](deploy/hostinger-business.md)
covers the parts that cannot be verified from code: auth redirect URLs, SMTP,
storage-bucket policies, automated backups, and secret rotation. If a secret
may have leaked, rotate it immediately and record the rotation in the deploy
checklist.

## Secret rotation runbook

`deploy/hostinger-business.md` records that the **service-role key leaked at some
point during setup**. Rotation cannot be verified from source — it is a dashboard
action — so treat this runbook as the completing step and record the date here
when it is done. If you cannot prove a rotation happened, the secret is assumed
compromised and must be rotated.

Rotate every credential below, then redeploy. Anything that only lives in a
dashboard (auth policies, bucket rules) must be re-checked against these new
values at the same time.

| Secret (env var) | Where it is issued | Where it is consumed | Rotation blast radius |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API | server-only admin client (`lib/supabase/admin.ts`), backup/maintenance crons, readiness probe | Full DB bypass of RLS. Highest priority. |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | Cloudflare dashboard → R2 → API tokens | upload pipeline, media proxy, storage backup | Object read/write on the public media bucket. |
| `B2_KEY_ID` / `B2_APPLICATION_KEY` | Backblaze B2 → Application Keys | `storage-backup` cron (off-site copies) | Read/write on the backup bucket. |
| `SMTP_USER` / `SMTP_PASS` | Mail provider (same host as Supabase custom SMTP) | notification emails (`lib/notify/`) | Send-as-the-domain abuse, deliverability damage. |
| `DIGEST_WEBHOOK_URL` | Discord/Slack incoming webhook | `ops-digest` cron | Anyone with the URL can post into the ops channel. |
| `CRON_SECRET` | Self-generated (`openssl rand -hex 32`) | all five `/api/cron/*` handlers + GitHub Actions secret | Unauthenticated cron triggers (backups, maintenance, mail blasts). |
| `TURNSTILE_SECRET_KEY` | Cloudflare Turnstile | signup/login/submission challenge verification | Captcha bypass on the abuse-sensitive forms. |

**Procedure**

1. Issue the new credential in the provider dashboard (do not revoke yet).
2. Update the value in the Hostinger environment for the app **and** in GitHub
   Actions repository secrets (`Settings → Secrets and variables → Actions`) for
   anything the scheduled workflows use — currently `CRON_SECRET`,
   `SUPABASE_SERVICE_ROLE_KEY`, and the storage/backup keys.
3. Redeploy, then confirm health: `GET /api/ready` (authenticated/detailed view)
   and a manual `workflow_dispatch` run of each job in
   `.github/workflows/scheduled-jobs.yml`.
4. Revoke the old credential in the provider dashboard. Revocation is the step
   that actually closes the exposure — updating without revoking leaves the leak
   live.
5. Record the rotation (secret, date, operator) in the table below.
6. If a secret was ever committed to git, rotate it **even after** removing the
   file: history retains it. Check with
   `git log --all --full-history -- <path>` before assuming it is gone.

**Rotation log** — fill in as rotations complete.

| Secret | Rotated on | Rotated by | Notes |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | | | Referenced as exposed in `deploy/hostinger-business.md` — must be completed. |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | | | |
| `B2_KEY_ID` / `B2_APPLICATION_KEY` | | | |
| `SMTP_USER` / `SMTP_PASS` | | | |
| `DIGEST_WEBHOOK_URL` | | | |
| `CRON_SECRET` | | | |
| `TURNSTILE_SECRET_KEY` | | | |

## Supported versions

Only the latest revision on `main` is supported. Deployments should track
`main` closely; older checkouts receive no security fixes.
