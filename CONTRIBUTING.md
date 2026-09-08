# Contributing to Eagle Eye Africa

Thanks for helping build the community board. This repo has a few
non-negotiable conventions — they're enforced by CI, and reviewing them here
saves everyone a round trip.

## Getting set up

1. Install **Node.js 22** (`>=22 <23`) and **npm 10+**.
2. `npm ci`
3. Copy `.env.example` → `.env.local` and fill in the Supabase keys (local dev
   works without them — pages render safe empty states).
4. `npm run dev` → open `http://localhost:3000/en`.
5. Optional demo data: `node scripts/seed-demo.mjs`.

## Workflow

- Feature branches off `main`; PRs target `main`. CI runs on every PR.
- Keep PRs focused; one concern per PR.
- Before opening a PR, run the full gate locally:

  ```bash
  npm run check   # typecheck + lint + bare-href audit + sitemap verify + migration manifest
  npm test
  npm run build
  ```

## The non-negotiables

### Locale-first routing

- Every user-facing page lives under `app/[locale]/…` — there are no root
  pages. `proxy.ts` is the single unprefixed-URL redirect.
- **Never hardcode `/en` or `/fr`.** Build links with
  `localePath(locale, path)` (`lib/i18n/urls.ts`). The bare-href audit
  (`scripts/find-bare-hrefs.mjs`) fails the build on locale-less internal
  links — keep it clean.

### i18n

- `lib/i18n/en.ts` is the source of truth; `fr.ts` is typed `Dictionary`, so a
  missing key is a compile error. `lib/i18n/parity.test.ts` additionally
  verifies runtime key parity and rejects empty strings in either locale —
  **every new user-visible string ships in both EN and FR**.
- No hardcoded user-visible strings in `app/[locale]`.

### Auth & authorization

- Defense in depth is mandatory: page/layout guard (`lib/auth/guards.ts`) →
  Server Function check (`lib/admin/auth.ts`, gate on the **capability**, not
  the role) → Supabase RLS in the migration.
- New admin surfaces need: a capability in `lib/auth/capabilities.ts`, a
  nav spec in `components/admin/nav-items.tsx`, dictionary labels in **both**
  locales, and a guarded page.

### Database changes

- Every schema change is a numbered, **idempotent** SQL migration in
  `supabase/migrations/` (create-if-not-exists, `drop policy if exists`, …).
  `scripts/verify-migrations.mjs` checks names, order, and empty files.
- New tables get RLS enabled with explicit policies and grants — public read
  only where intended, staff write via `public.is_staff()`.
- Anything a mutation writes must be invalidated: call the appropriate
  `revalidateLocalized` / `revalidateTag(CACHE_TAGS.x, 'max')` in the Server
  Function (`lib/admin/actions.ts`).

### Caching

- Hot public reads use `unstable_cache` with a tag from `lib/cache/tags.ts`
  and the shared 300 s revalidate window. Guard every cached read with
  `hasDatabase()` and a try/catch fallback so a DB hiccup degrades to an
  empty state, never a crashed page.

### Queries & safety

- Never render user PII server-side that a viewer hasn't earned (the
  buy-sell contact-reveal flow is the pattern to follow).
- Validate at the boundary and again at render where values become hrefs
  (absolute http(s) only — see `saveSiteSetting` in `lib/admin/actions.ts`).

## Docs to update in the same PR

- [`architecture-checklist.md`](architecture-checklist.md) — when a structural
  decision changes or a phase ships, add a changelog entry **in the same PR**.
  This is a project standard, not a suggestion.
- [`features.md`](features.md) / [`sitemap.md`](sitemap.md) — when you add or
  change routes. `scripts/verify-sitemap.mjs` verifies static paths and
  dynamic segments stay in sync with the file tree.

## Commit style

Short imperative subject (`Add scheduled publishing sweep`), body explaining
the *why* when it isn't obvious. Reference checklist items (`P0-4`,
`Phase 5.2`) when relevant.

## Questions

Architecture decisions live in `architecture-checklist.md` — read the relevant
section before proposing a change; most "why is it like this?" answers are
written down there.
