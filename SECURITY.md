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

## Supported versions

Only the latest revision on `main` is supported. Deployments should track
`main` closely; older checkouts receive no security fixes.
