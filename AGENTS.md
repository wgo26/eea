<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Project standards (architecture-checklist.md)

These rules are enforced project-wide. When they change, update `architecture-checklist.md` in the same PR.

## Locale-first routing (checklist item 1)

- **Every user-facing page lives under `app/[locale]/…`.** Root segments may exist only as `proxy.ts` redirects — they must never render content (there are no root `page.tsx` files).
- **Locale resolution order (project standard, mirrored in `proxy.ts` and `lib/i18n/server.ts`):** URL prefix → `eea-locale` cookie → `Accept-Language` → `en`.
- **Unprefixed URLs are 307-redirected** to `/{locale}{path}` (query preserved) by `proxy.ts` — the single redirect mechanism. Exempt: `/api/*`, `/auth/callback` (the handler redirects into the cookie's locale), `sitemap.xml`, `robots.txt`, asset files.
- **Never hardcode `/en` or `/fr`** in code or hrefs. Build links with `localePath(locale, path)` (`lib/i18n/urls.ts`). Never link to a bare `/section` path from a page — the bare-href audit (`scripts/find-bare-hrefs.mjs`) must stay clean.
- Route groups: `(public)` = browsing chrome, `(app)` = admin/account shells, `(focused)` = minimal auth/form screens. A page's shell is decided by its route group, never by runtime header sniffing.

## Auth & roles (checklist items 4 + 5)

- Roles: `admin`, `editor`, `contributor`, `advertiser`; **member = an authenticated user with no `user_roles` rows** (implicit, documented model).
- **Defense in depth:** page/layout guards (`lib/auth/guards.ts`) → server-action checks (`lib/admin/auth.ts`) → RLS (data layer). The proxy only refreshes sessions — it never blocks routes, so every protected page must call a guard.
- Guards redirect to the **localized** login / `not-authorized` screens (never a silent `/`).
- Menu visibility is capability-driven (`lib/auth/capabilities.ts`), not hardcoded per page.
- `next`/redirect targets pass through `safeNextPath` (same-origin only, locale-re-prefixed).

## i18n (checklist item 6)

- `en.ts` is the single source of truth; `fr.ts` is typed `Dictionary` so a missing key is a compile error. App-area strings live in `en-app.ts`/`fr-app.ts` and are spread into the dictionaries.
- No hardcoded user-visible strings in `app/[locale]` beyond literal fallbacks that already hit the dictionary.
- Public pages own their canonical/hreflang via `buildAlternates(locale, path)` in `generateMetadata`; auth/app pages are `noindex` via their layouts.
