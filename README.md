# Eagle Eye Africa

[![CI](https://github.com/wgo26/eea/actions/workflows/ci.yml/badge.svg)](https://github.com/wgo26/eea/actions/workflows/ci.yml)
![Node](https://img.shields.io/badge/node-%E2%89%A522%20%3C23-green)

Community-first African media platform: local news, photo stories, community notices, buy & sell, culture and events — one community board for every place, fully bilingual (English / French).

Next.js 16 App Router · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage, RLS) · Cloudflare R2 · Backblaze B2 · Vitest.

## What's inside

**Public site** (`/{locale}/…`, EN + FR): homepage with admin-curated slots, news (featured / live & developing / most viewed), photo stories, community notices, buy & sell marketplace with a PII-safe contact-reveal flow, culture & events, locations, contributor profiles, full-text search, advertise page, and legal pages with a signed acceptance trail.

**Participation loop:** guest or authenticated submissions → moderation queue → verification → publish (immediately or scheduled, with expiry sweeps) → article corrections, polls and fundraisers on the reader side.

**Admin command center** (`/{locale}/admin/…`, capability-driven menu): dashboard, moderation queue with approve-with-content drawer, trust & safety queues, content manager with homepage slots, listings lifecycle, taxonomy (categories + locations), polls, fundraisers, legal pages + About/Advertise copy overrides + legal inbox, **site content** (advertise copy + footer social links), users & roles, ads, storage backup, and an audit log.

Every page in the admin is staff-maintainable without a code deploy: editorial content, curated slots, page copy overrides, social links, legal text, taxonomy and roles all live in the database behind RLS.

## Local development

Prerequisites: **Node.js 22** (`>=22 <23`), **npm 10+**.

```bash
npm ci
cp .env.example .env.local   # fill in Supabase + R2 keys
npm run dev
```

Open <http://localhost:3000/en> — the locale prefix is required; unprefixed URLs 307-redirect via `proxy.ts` (cookie → `Accept-Language` → `en`).

Without database credentials every query falls back to a safe empty state — the app renders, never crashes, so `npm run dev` and `npm run build` work before Supabase is configured.

Optional demo content:

```bash
node scripts/seed-demo.mjs         # demo locations, categories, content items
node scripts/seed-fundraisers.mjs  # sample fundraiser campaigns
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (flat config, whole repo) |
| `npm test` | Vitest suite (incl. the EN/FR parity matrix) |
| `npm run check` | typecheck + lint + bare-href audit + sitemap verify + migration manifest |

## Project structure

```
app/
  [locale]/(public)/    # public pages (browsing chrome)  ← all user-facing pages live here
  [locale]/(app)/       # admin + account (AppShell, guarded)
  [locale]/(focused)/   # auth / submit flows (minimal chrome)
  api/                  # health, ready, uploads, cron (storage-backup, db-maintenance)
  auth/callback/        # Supabase auth callback (redirects into the cookie's locale)
components/             # UI kit (shadcn), site chrome, admin widgets, shells
lib/
  i18n/                 # en/fr dictionaries, locale helpers, URL builders (+ tests)
  auth/                 # guards, roles, capability map
  admin/                # back-office queries + Server Functions (audit-logged)
  queries/              # public read layer (cached, safe fallbacks)
  security/             # rate limiting, Turnstile, honeypot
  storage/              # R2 / B2 / Supabase Storage providers
supabase/
  migrations/           # numbered, idempotent SQL migrations (applied in filename order)
  templates/            # bilingual auth email templates
scripts/                # seeders + audit scripts (bare-hrefs, sitemap, migrations, backup)
deploy/                 # Hostinger + VPS deployment guides and configs
docs/                   # hosting architecture, auth email setup
```

## Architecture conventions (enforced — see `architecture-checklist.md`)

- **Locale-first routing:** every user-facing page lives under `app/[locale]/…`. Never hardcode `/en` or `/fr` — build links with `localePath(locale, path)` (`lib/i18n/urls.ts`). `proxy.ts` is the single unprefixed-URL redirect. The bare-href audit (`scripts/find-bare-hrefs.mjs`) must stay clean.
- **Shells are static:** route groups decide the shell — never runtime header sniffing.
- **Defense in depth:** page/layout guards (`lib/auth/guards.ts`) → Server Function checks (`lib/admin/auth.ts`, capability-gated) → Supabase RLS. The proxy only refreshes sessions.
- **Roles & capabilities:** `admin`, `editor`, `contributor`, `advertiser`; *member* = authenticated user with no `user_roles` rows. Menus are capability-driven (`lib/auth/capabilities.ts`), never hardcoded per page.
- **i18n:** `lib/i18n/en.ts` is the single source of truth; `fr.ts` is typed `Dictionary` so a missing key is a compile error, and `lib/i18n/parity.test.ts` verifies runtime parity in CI. No hardcoded user-visible strings in `app/[locale]`.
- **Caching:** hot public reads are wrapped in `unstable_cache` with tags (`lib/cache/tags.ts`: `news`, `home`, `listings`, `notices`, `stories`, `culture`, `site`); every content mutation invalidates via `revalidateTag(tag, 'max')`.
- **Safe fallbacks everywhere:** a DB hiccup resolves to an empty state, never a crashed page.

## Quality gates & CI

`.github/workflows/ci.yml` runs on every push/PR to `main`: typecheck → lint → bare-href audit → sitemap route verification → migration manifest verification → unit tests + EN/FR matrix → dry-run `next build` with dummy Supabase envs (no real backend touched). Two optional live checks run only when their repo secrets are configured: `supabase db lint` (`SUPABASE_DB_URL`) and the backup integrity verify (`R2_*`/`B2_*`/Supabase secrets).

Run the same gates locally before every PR:

```bash
npm run check
npm test
npm run build
```

## Environment variables

Copy `.env.example` → `.env.local` and fill in the values. Never commit real secrets.

| Variable | Required | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | ✅ | Canonical site URL (metadata, sitemap, share links) |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Browser/publishable anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | **Server-only.** Service-role client for reads/writes; its presence also switches queries from fallbacks to live data |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | uploads | Cloudflare R2 — public media storage |
| `R2_PUBLIC_BASE_URL` | media | Public media base URL (wired into `next/image` remote patterns) |
| `B2_ENDPOINT` / `B2_KEY_ID` / `B2_APPLICATION_KEY` / `B2_BACKUP_BUCKET` | backups | Backblaze B2 — nightly backup mirror |
| `SUPABASE_ADMIN_ASSET_BUCKET` | — | Admin-asset bucket name (defaults to `admin-asset`) |
| `CRON_SECRET` | production | Bearer secret guarding `/api/cron/*` (fail-closed) |
| `TURNSTILE_SECRET_KEY` | — | Enables Cloudflare Turnstile verification when set (feature switch) |
| `SENTRY_DSN` | — | Error tracking (see [`docs/observability.md`](docs/observability.md); inert until the SDK is installed) |
| `DIGEST_WEBHOOK_URL` | — | Discord/Slack-compatible webhook for the nightly `/api/cron/ops-digest` summary |
| `CLOUDINARY_CLOUD_NAME` | — | Optional image transform layer (adds a remote pattern) |
| `SUPABASE_DB_URL` | CI secret | Enables the optional `supabase db lint` CI step (not an app env) |

## Scheduled jobs

Three `CRON_SECRET`-guarded endpoints are declared in `vercel.json` (the third
is also triggered from GitHub Actions on Hostinger — see §Hosting note):

| Endpoint | Schedule (UTC) | Purpose |
|---|---|---|
| `/api/cron/storage-backup?batch=100` | 02:00 daily | Delta-sync R2 + Supabase Storage → Backblaze B2, checksum-verified |
| `/api/cron/db-maintenance` | 02:30 daily | Purge stale rate-limit buckets, report DB telemetry, verify schema integrity (500 = alert) |
| `/api/cron/ops-digest` | 06:00 daily | Post a queue summary (moderation/legal-inbox/ads/storage) to the configured webhook — the moderation-loop watchdog |

**Hosting note:** `vercel.json` crons only fire on Vercel. On the Hostinger/VPS
deployment, schedule the endpoints with a systemd timer or crontab, and the
storage-backup + db-maintenance endpoints are also invoked nightly by
[`.github/workflows/scheduled-jobs.yml`](.github/workflows/scheduled-jobs.yml)
(needs the `CRON_SECRET` repo secret). See `deploy/hostinger-business.md`.

## Deployment

Target: Hostinger Business Node.js hosting (`next start`) + hosted Supabase. The full go-live checklist — env vars, DNS/TLS, Supabase auth redirect URLs, SMTP, storage-bucket verification, migrations, and the post-deploy smoke-test list — lives in [`deploy/hostinger-business.md`](deploy/hostinger-business.md). Apply every migration in `supabase/migrations/` in filename order.

## Security

Shipped hardening: PII-free public listings with a rate-limited contact-reveal action, per-IP upload rate limiting + magic-byte validation, capability-gated Server Functions, RLS on every table, audit logging, optional Turnstile, honeypots, and security headers. See [`SECURITY.md`](SECURITY.md) for reporting vulnerabilities.

## Documentation

| Document | Contents |
|---|---|
| [`architecture-checklist.md`](architecture-checklist.md) | Structural decisions, QA checklist, changelog — **update in the same PR as code changes** |
| [`features.md`](features.md) | Master feature set (product spec) |
| [`sitemap.md`](sitemap.md) | Every route, mapped to the feature set |
| [`audit.md`](audit.md) | Production-readiness audit + phased remediation plan (all phases shipped) |
| [`docs/known-issues.md`](docs/known-issues.md) | **Current** debt list (regenerated against the code; the old `m.md`/`implementation_plan.md`/`scaffold_plan.md` live under `docs/history/`) |
| [`docs/admin-manual.md`](docs/admin-manual.md) | Client-facing admin guide (per-section workflows) |
| [`docs/observability.md`](docs/observability.md) | Logging, Sentry, uptime monitor, nightly ops-digest setup |
| [`docs/hosting-architecture.md`](docs/hosting-architecture.md) | Hosting baseline |
| [`docs/auth-emails.md`](docs/auth-emails.md) | Auth email templates + Supabase dashboard setup |
| [`deploy/`](deploy/) | Hostinger + VPS deployment guides, nginx/systemd configs |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Workflow and PR checklist |

## License

Proprietary — all rights reserved. See [LICENSE](LICENSE).


