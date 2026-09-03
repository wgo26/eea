# EAGLE EYE AFRICA — ARCHITECTURE & PRODUCT CHECKLIST

Single source of truth for the structural and product decisions that determine whether Eagle
Eye Africa feels like a real product instead of a prototype. Every item below was verified
against the codebase on **2026-09-02** (Next.js 16.3.4 App Router, Supabase auth, custom
`lib/i18n` dictionaries — no next-intl).

**Status legend:** ✅ in place · 🟡 partial / drift risk · ❌ missing · 🔧 decision to lock

Companion docs: `features.md` (what we build), `sitemap.md` (where it lives), this file
(how the app is shaped and verified).

---

## 0. GROUND TRUTH — WHAT EXISTS TODAY

### 0.1 Route inventory

| Area | Root routes (no locale) | `/[locale]` routes | State |
|---|---|---|---|
| Homepage | none (307 via proxy) | `(public)/page.tsx` | ✅ |
| Public content (news, photo-stories, buy-sell, notices, culture, search, locations, contributors, advertise, about, submit index) | none (307 via proxy) | `(public)/…` full pages | ✅ |
| Submit flows | none | `(focused)/submit/*` full pages | ✅ |
| Auth | `/auth/callback` route only (exempt) | `(focused)/auth/*` full pages | ✅ |
| Account | none | `(app)/account/*` (guarded by `(app)/account/layout.tsx`) | ✅ |
| Admin | none | `(app)/admin/*` (guarded by `(app)/admin/layout.tsx` + shell) | ✅ |

### 0.2 Mechanisms in place

- **`proxy.ts`** — THE single locale-redirect mechanism: unprefixed URLs
  307-redirect to `/{locale}{path}` (cookie → `Accept-Language` → `en`); legacy
  redirect table lives here; sets `x-locale` and `x-app-shell`. Exempts
  `/api/*`, `/auth/callback`, `sitemap.xml`, `robots.txt`, assets.
- **Route groups** — `app/[locale]/(public)`, `(app)`, `(focused)` decide the
  shell statically (PublicShell / admin+account AppShells / FocusedShell with
  the `BackButton` exit affordance). Root `app/layout.tsx` renders document
  chrome only; no page renders without a shell decision.
- **`lib/auth/guards.ts`** — `requireUser` / `requireRole` / `requireStaff` /
  `requireAdmin` (page-level, redirect to **localized** login /
  `not-authorized`). Corrected doc comment (P0-7): `lib/supabase/middleware.ts`
  only refreshes sessions.
- **`lib/auth/capabilities.ts`** — role → capability map that drives admin menu
  visibility and route guards. Roles: `admin`, `editor`, `contributor`,
  `advertiser`; **member = authenticated user with no `user_roles` rows**.
- **`lib/i18n/`** — `en`/`fr` dictionaries (22 public sections + `system`,
  `auth`, `account`, `admin` app sections in `en-app.ts`/`fr-app.ts`),
  `urls.ts` (`localePath`, `safeNextPath`, `buildAlternates`), `server.ts`
  (cached request-locale helper).
- **Metadata/SEO** — `buildAlternates` per public page (canonical + hreflang),
  `noindex` on `(app)`/`(focused)` layouts, locale-aware `sitemap.ts` +
  `robots.ts`.

### 0.3 P0 breaks — status

All eight P0s were fixed on 2026-09-02 (tick = done). Each fix shipped with its
regression covered in item 12's QA pass.

- **P0-1 — `/fr/<any public section>` 404s.** ✅ Fixed structurally: all public
  content, submit, auth, account and admin routes now live under `app/[locale]/…`;
  `proxy.ts` is the single unprefixed→`/{locale}` 307 redirect. The stale
  "rewrite" comment was deleted.
- **P0-2 — `/en/admin/*` bypasses the staff guard.** ✅ Fixed: `app/[locale]/(app)/admin/layout.tsx`
  guards the whole branch with `requireStaff` and renders the admin shell; the
  re-export shims were deleted.
- **P0-3 — `/fr/admin` hardcodes English.** ✅ Fixed: `app/[locale]/(app)/admin/page.tsx`
  redirects into the **same** locale's dashboard.
- **P0-4 — the `next` param is dropped after login.** ✅ Fixed: login → landing
  carries `next`; `auth/landing` validates it (`safeNextPath`) and prefers it
  over the role landing; `/auth/callback` validates + re-prefixes it too.
- **P0-5 — guard redirects are locale-blind.** ✅ Fixed: guards redirect to the
  localized login / `not-authorized` screens via `getRequestLocale()`.
- **P0-6 — auth/account/admin UI is hardcoded English.** ✅ Fixed: new `system`,
  `auth`, `account`, `admin` dictionary sections (en+fr) cover login, signup,
  reset, landing, not-authorized, account dashboard, admin sidebar/topbar/
  dashboard. Remaining (tracked in item 6): inner admin list pages
  (moderation/content/users/ads/storage/audit) still carry some literal table
  labels.
- **P0-7 — stale middleware comment in guards.** ✅ Fixed: the doc comment now
  states `lib/supabase/middleware.ts` only refreshes sessions.
- **P0-8 — no localized `not-found` / `error` pages.** ✅ Fixed:
  `app/[locale]/not-found.tsx`, `error.tsx`, `global-error.tsx` in both
  locales.

---

## 1. LOCALE-FIRST ROUTING — ✅ Enforced

The single biggest item. `proxy.ts` + `app/[locale]/layout.tsx` + the root redirect pages are
the right foundation, but only the homepage, account, admin and auth live under `[locale]`;
all public content and submit flows don't, and the two trees are already drifting.

**Lock in these decisions**
- 🔧 `/[locale]` is the **only** canonical home of user-facing pages. Root segments may exist
  only as redirects; they must never render content.
- 🔧 Every URL in `sitemap.md` §17 exists in **both** `/en/…` and `/fr/…` (prefix-all model,
  including legal pages — they must not be English-only).
- 🔧 One mechanism for unprefixed URLs: 307/308 redirect to the prefixed URL (cookie →
  `Accept-Language` → `en`). No silent rendering at unprefixed paths.
- 🔧 Locale resolution order stays: URL prefix → cookie → `Accept-Language` → `en`. Write it
  down as the project standard (AGENTS.md or a `docs/` note), not tribal knowledge.

**Tasks**
- [ ] Give public content + submit routes a `/fr` story: either real `app/[locale]/…` pages
      (preferred — content pages already self-localize via `getDictionary`, so they're
      move-ready) or an explicit `proxy.ts` rewrite. Delete the stale comment either way. *(P0-1)*
- [ ] Make unprefixed deep URLs (`/news`, `/about/terms`, `/submit/news`) redirect to
      `/{locale}/…` instead of rendering. Today they render, which is exactly the
      "root public pages vs localized pages" drift item 1 warns about.
- [ ] Language switcher must only ever target routes that exist (never 404).
- [ ] Keep root `/account`, `/admin`, `/auth`, `/` as redirects only; extract the repeated
      cookie/`Accept-Language` block in them into one helper (`resolveLocaleFromRequest()`).
- [ ] Add the locale rule to the project standards doc; enforce in PR review.
- [ ] Locale-aware `sitemap.xml` generation (both locales, cross-referenced).

**Acceptance**
Every route in `sitemap.md` resolves under `/en` and `/fr`; the switcher never 404s; no root
page renders content; a fresh FR-browser visit lands on `/fr`.

---

## 2. EXPLICIT SHELLS, NOT ACCIDENTAL ONES — ✅

Shells are currently detected per-request (`x-app-shell` header) and only used to *hide*
public chrome. There is no named `AppShell` or `FocusedShell`, the admin shell doesn't apply
on `/en/admin/*` (P0-2), the account dashboard has **no chrome at all** (no header, no
topbar — a dead-end page), and `/submit` gets full public chrome although the brief calls
submit flows "focused".

**Lock in these decisions**
- 🔧 Three shells, named in code: **PublicShell** (header + footer), **AppShell** (topbar +
  sidebar/tabs — for admin **and** account), **FocusedShell** (minimal, with a back path —
  for auth, submit forms, confirmations).
- 🔧 Shell assignment is a static routing decision (route groups like
  `app/[locale]/(public)`, `(app)`, `(focused)`), not a runtime header sniff — so it's
  inspectable in the tree and applies uniformly to localized routes.
- 🔧 Shell matrix (each page belongs to exactly one shell):

  | Pages | Shell |
  |---|---|
  | `/`, content indexes/details, search, locations, contributors, advertise, about | Public |
  | `/account/dashboard`, `/admin/*` | App |
  | `/account/login`, `/account/signup`, `/account/reset-password/*`, `/submit/*`, `/submit/confirmation`, `/auth/*` | Focused |
  | `/auth/callback` (route handler) | none |

  ⚠️ Open call: `sitemap.md` treats `/submit` as a public section; the brief calls it
  focused. Recommendation: submit **index** stays public, submit **forms + confirmation**
  become focused. Decide once, record here.

**Tasks**
- [ ] Create the three shell wrappers; render public chrome via the `(public)` group, not
      the `x-app-shell` header check.
- [ ] Give `/en/admin/*` the admin shell again (fixes P0-2's shell half).
- [ ] Give the account dashboard an AppShell topbar (profile, back-to-site, sign out).
- [ ] Build FocusedShell with the back affordance (item 3).

**Acceptance**
Login shows no header/footer; `/en/admin` shows the sidebar; the account dashboard has app
chrome; public pages always show header/footer — in both locales.

---

## 3. EVERY FOCUSED SCREEN HAS A BACK PATH — ✅

Login, signup, reset and (per the matrix above) submit forms currently have no visible
back/close affordance. Auth screens feel trapped.

**Lock in these decisions**
- 🔧 FocusedShell always renders one primary exit affordance: `history.back()` when the
  referrer is same-origin, otherwise a per-flow fallback destination.
- 🔧 Fallback destinations: login/signup/reset → `/{locale}` homepage; submit forms →
  the section index that linked in; confirmation → the content home of its type; admin task
  screens → their list page.
- 🔧 The back control preserves context (`next=`, draft id where applicable).

**Tasks**
- [ ] Implement the back affordance in FocusedShell.
- [ ] Add per-flow fallback constants (one map, one place).
- [ ] Add close/`Esc` behavior for dialogs inside flows.
- [ ] Audit every screen in the Focused rows of the shell matrix — none may dead-end.

**Acceptance**
From `/fr/account/login`, back returns to the previous French page; from a pasted link to
`/account/reset-password`, back goes to the localized homepage; no focused screen lacks an exit.

---

## 4. POST-AUTH DESTINATION IS A PRODUCT FLOW — ✅

Role-based landing already exists (`/auth/landing`: staff → `/admin/dashboard`, everyone else
→ `/account/dashboard`) — good instinct, right base. But `next` is dropped (P0-4),
destinations aren't locale-prefixed, and "authenticated but not authorized" is a silent
bounce to `/`.

**Lock in these decisions**
- 🔧 Destination precedence: validated `next` (same-origin only, locale-prefixed) → role
  landing → `/{locale}/account/dashboard`.
- 🔧 Role landings: admin/editor → `/{locale}/admin/dashboard`; contributor →
  `/{locale}/account/dashboard` (contributions view); advertiser → campaigns view; member →
  `/{locale}/account/dashboard`. Distinct views may start as sections of the member dashboard.
- 🔧 Unauthorized ≠ lost: `requireRole` failures render a localized "not authorized" screen
  (with a path back), never a silent redirect to `/`.
- 🔧 Document the journey per role (entry → landing → daily actions) in this file once
  implemented.

**Tasks**
- [ ] `/auth/landing` reads and honors `next`; validate same-origin. *(P0-4)*
- [ ] Prefix every post-auth destination with the active locale.
- [ ] Guards accept the caller's path (layouts/pages pass it) so redirects preserve locale. *(P0-5)*
- [ ] Build the localized not-authorized screen; wire `requireRole`/`requireStaff`/
      `requireAdmin` to it.
- [ ] Decide what a user with **zero roles** sees on `/admin` (same not-authorized screen).

**Acceptance**
A French user logging in from `/fr/account/login?next=/fr/submit/news` ends up on
`/fr/submit/news`; a contributor hitting `/admin` sees a French "not authorized" screen with
a way out; every role has a documented landing page.

---

## 5. ROLE-BASED ACCESS ENFORCED EVERYWHERE — ✅ guards/capabilities; RLS verify pending

`lib/auth/guards.ts` + `lib/auth/roles.ts` are a solid second line of defense, and
`app/admin/layout.tsx` correctly guards the whole root admin branch. But `/en/admin/*`
bypasses that layout entirely (P0-2), the "middleware protects routes" comment is false
(P0-7), there is no `member` role, and the admin sidebar shows **all** menu items to any
staff member with no per-role filtering.

**Lock in these decisions**
- 🔧 Role model: `admin`, `editor`, `contributor`, `advertiser` exist in
  `public.app_role`. Decide: **member = an authenticated user with no rows in `user_roles`**
  (current implicit behavior — document it) or add an explicit `member` enum value. Pick one,
  record it here; don't leave it implicit.
- 🔧 Defense in depth, in order: page/layout guards (always) → server-action role checks
  (every mutating action) → RLS policies (data layer). Never rely on one layer.
- 🔧 Menu visibility is role-driven, not hardcoded: the sidebar/topbar render from a
  capability map (`canManageUsers`, `canModerate`, `canManageAds`, …), so editors and admins
  see different menus.

**Tasks**
- [ ] Close the `/en/admin/*` guard bypass: add `app/[locale]/admin/layout.tsx` with the
      same `requireStaff()` (or move guards into each admin page). *(P0-2)*
- [ ] Correct the stale comment in `guards.ts:6-7`. *(P0-7)*
- [ ] Audit every server action in `lib/admin/actions.ts` + `app/**/*-actions.tsx` for an
      explicit role check at the top.
- [ ] Verify RLS on `user_roles`, `content_items`, `submissions` (anon/user cannot read or
      write staff-only rows) — the guards are UX; RLS is the real wall.
- [ ] Implement the role → menu visibility matrix (below) in `AdminSidebar`/`AdminTopbar`.

  | Area | admin | editor | contributor | advertiser | member |
  |---|---|---|---|---|---|
  | Dashboard | ✅ | ✅ | — | — | — |
  | Moderation | ✅ | ✅ | — | — | — |
  | Content | ✅ | ✅ | own submissions | — | — |
  | Users & roles | ✅ | — | — | — | — |
  | Ads | ✅ | — | — | own campaigns | — |
  | Storage/backup, Audit log | ✅ | — | — | — | — |

**Acceptance**
Anonymous `/en/admin/dashboard` is blocked; an editor cannot open users/ads/storage by URL or
see those menu items; every mutating server action refuses unauthorized roles.

---

## 6. TRANSLATION IS NOT OPTIONAL — ✅ App + admin surfaces localized (validation/email remain)

The public site is genuinely bilingual: 22 dictionary sections in `en.ts`/`fr.ts` cover
indexes, detail pages, forms, search, empty states and errors. The app areas are covered by
`en-app.ts`/`fr-app.ts` (`system`, `auth`, `account`, `admin`), and as of 2026-09-03 the
last hardcoded surface is gone too: all six admin list pages (moderation, content, users,
ads, audit log, storage & backup) plus their client action components (reject dialog,
content status transitions, homepage curation, role-assignment menu, ad campaign actions,
backup trigger) render from the dictionary — `admin.typeFilters` is a shared group used by
both moderation and content. Every list page also localizes its metadata title via
`generateMetadata`.

**Lock in these decisions**
- 🔧 Dictionary structure mirrors route areas; every user-facing string in
  auth/account/admin gets a key. No exceptions, including validation messages and empty states.
- 🔧 Missing-key policy: fall back to English + log in dev (the current `Dictionary = typeof en`
  typing already forces key parity — keep `fr.ts` typed as `Dictionary`).
- 🔧 Dates/numbers format per locale via `date-fns` locales (already a dependency).

**Tasks**
- [ ] Add `account`, `auth`, `admin`, `forms` (shared field labels, validation, buttons)
      sections to `en.ts`/`fr.ts`. *(P0-6)*
- [ ] Refactor login/signup/reset/landing + dashboards + admin components to the dictionary.
- [ ] Localize zod validation messages (message maps per locale, resolved at render).
- [ ] Localize email templates (password reset) or at minimum send in the user's locale.
- [ ] Add localized `not-found.tsx` + `error.tsx` boundaries. *(P0-8)*
- [ ] Add a grep/lint check to CI: no hardcoded user-visible strings in `app/[locale]`,
      `app/account`, `app/admin`, `app/auth`.

**Acceptance**
A French user can sign up, log in, reset a password, use both dashboards and every admin
screen without seeing English; a broken flow shows French errors, not English ones.

## 7. NAVIGATION MODEL DESIGNED AS A SYSTEM — 🟡

Pieces exist — public header/footer (`site-header`, `mobile-nav`, `language-switcher`,
`theme-toggle`), admin `AdminSidebar`/`AdminTopbar` — but there is no written rule for which
pages show which nav, the account area has no nav at all, and admin nav labels/links are
non-localized (`/admin/...` always lands on the root branch).

**Lock in these decisions**
- 🔧 One nav matrix for the whole app; every page's nav elements come from its shell:

  | Shell | Primary nav | Secondary | Mobile |
  |---|---|---|---|
  | Public | `SiteHeader` (sections + search) | `SiteFooter` | hamburger sheet (`mobile-nav`), sticky header |
  | App | `AdminSidebar` (admin) / account topbar tabs | `AdminTopbar` / profile menu | drawer sidebar under `lg`, sticky topbar |
  | Focused | none — only the back affordance | — | same as desktop |

- 🔧 Exactly one primary nav per screen — never header + sidebar + tabs stacked.
- 🔧 Nav destinations are locale-prefixed links built from the active locale, never bare
  `/admin/...` constants. The bare-href audit (`scripts/find-bare-hrefs.mjs`) now covers
  `(public)`, `(focused)`, **`(app)` and `components/`**, with exemptions for paths already
  flowing through `localePath`/`localeHref` (including the `p(...)` shorthand) — run it as
  a PR gate; it reports zero findings as of 2026-09-03.
- 🔧 Sticky behavior: public header sticks; admin topbar sticks; sidebar is sticky full-height
  (already implemented in `app/admin/layout.tsx`).

**Tasks**
- [ ] Encode the matrix in the shell components themselves (so a page can't opt out silently).
- [ ] Build the account AppShell nav (dashboard / submissions / profile / sign out).
- [ ] Verify admin mobile: sidebar is `hidden lg:block` — confirm `AdminClientWrapper`/
      `AdminTopbar` provide a working drawer on small screens; if not, build one.
- [ ] Localize all nav labels (`nav` dictionary section exists — use it in admin chrome too).
- [ ] Add breadcrumbs to admin pages (`breadcrumb` component already exists).

**Acceptance**
Every page matches the matrix on desktop and mobile; switching locale keeps you in the same
place in the nav; no screen shows two competing primary navs.

---

## 8. RESPONSIVE BEHAVIOR PER SHELL — 🟡

Public pages have mobile nav; admin hides its sidebar under `lg` with an unverified mobile
fallback; focused screens are already single-column. Nothing has been decided about touch
targets, breakpoints, or accessibility states per shell.

**Lock in these decisions**
- 🔧 Breakpoint contract: 320 / 390 / 768 / 1024 / 1280 must all be usable in every shell.
- 🔧 Primary CTAs ≥ 44×44 px touch targets in focused + app shells (one-handed, mobile-first
  audience per `features.md` §3 — low-bandwidth, mobile-first).
- 🔧 Admin on mobile = drawer sidebar + sticky topbar, not a shrunk sidebar.
- 🔧 Visible focus states (`focus-visible` rings) on every interactive element; keyboard
  navigable menus/drawers (Base UI primitives already provide this — don't fight them).

**Tasks**
- [ ] Walk each shell at each breakpoint; record defects; fix against the contract above.
- [ ] Audit tap-target sizes on auth forms, submit forms, admin tables/actions.
- [ ] Check dark mode alongside responsive (theme toggle exists on public; decide for app
      shell — inherit system theme).
- [ ] Test with browser zoom at 200% for accessibility.

**Acceptance**
A reviewer can open any page at 320 px in both locales and complete the core action of that
shell (read, submit, moderate) without horizontal scroll or unreachable controls.

## 9. ROOT REDIRECTS & DEEP-LINK HANDLING — ✅ single mechanism (proxy.ts)

`/`, `/account`, `/admin`, `/auth` all locale-redirect correctly (cookie → `Accept-Language`
→ `en`) — the pattern is right, just copy-pasted four times. But `/fr/admin` hardcodes
`/en` (P0-3), unprefixed public URLs render instead of redirecting (item 1), `next=`
preservation breaks at the landing page (P0-4), and there is no story for old/legacy URLs.

**Lock in these decisions**
- 🔧 One shared helper (`resolveLocaleFromRequest()` in `lib/i18n`) used by all redirect
  pages — no more four copies of the cookie/`Accept-Language` block.
- 🔧 `next=` handling: absolute-path-only (reject `//evil.com` and off-origin), always
  re-prefixed with the active locale, carried through login → landing → destination.
- 🔧 Legacy/old URLs: maintain a single redirect table (in `proxy.ts` or `next.config.ts`)
  rather than scattering ad-hoc redirects.
- 🔧 `/auth/callback` (and its `[locale]` re-export) must redirect into the locale that the
  user's cookie holds, so email-link landings don't switch language.

**Tasks**
- [ ] Fix the hardcoded `/en` in `app/[locale]/admin/page.tsx`. *(P0-3)*
- [ ] Extract and adopt the shared locale-redirect helper in all four root pages.
- [ ] Implement the `next=` validation + locale-prefixing rules in login/landing. *(P0-4)*
- [ ] Decide the unprefixed-URL policy with item 1 (redirect vs render) and apply it
      everywhere consistently.
- [ ] Verify `app/auth/callback/route.ts` honors `eea-locale` on redirect.
- [ ] Add the redirect table for any pre-existing public URLs before launch.

**Acceptance**
The matrix below all passes; pasting any sitemap URL unprefixed lands the user on the same
page in their language; `next=` survives the whole login journey.

| Entry URL (cookie=fr) | Expected final URL |
|---|---|
| `/` | `/fr` |
| `/account` | `/fr/account/dashboard` |
| `/admin` | `/fr/admin/dashboard` |
| `/auth` | `/fr/auth` |
| `/news` | `/fr/news` (per item-1 decision) |
| `/fr/admin` | `/fr/admin/dashboard` (today: `/en/admin/dashboard` ❌) |

---

## 10. METADATA & CANONICALS MATCH THE LOCALE MODEL — ✅

Root layout sets `metadataBase` + title template; `app/[locale]/layout.tsx` sets localized
title/description and `alternates.languages` — but its `canonical: /${locale}` applies to
**every nested page** (so `/en/account/login` claims canonical `/en`), public pages have no
hreflang at all, and admin/account pages should be `noindex` but aren't. `features.md` §4
explicitly calls out Open Graph for WhatsApp-first distribution — the product depends on
shared links rendering well.

**Lock in these decisions**
- 🔧 Canonical = the page's own localized URL, always. hreflang pairs (`en`/`fr`/`x-default`)
  on every public page.
- 🔧 `noindex` on everything behind auth (`/admin/*`, `/account/*`, `/auth/*` except landing).
- 🔧 Per-locale OG/Twitter tags on every public detail page; share text may use the
  Pidgin/Camfranglais overlay per `sitemap.md` §17 but the URL stays canonical.

**Tasks**
- [ ] Add a `buildAlternates(locale, path)` helper; use it per page; remove the blanket
      layout-level canonical.
- [ ] Add `robots: { index: false }` via the app-shell layout for admin/account/auth.
- [ ] Add per-locale titles/descriptions to every public index + detail page
      (`generateMetadata` per route, keyed off `getDictionary`).
- [ ] Verify WhatsApp link preview for a news + photo-story page in both locales
      (og:title, og:description, og:image absolute URLs via `metadataBase`).
- [ ] Locale-aware `sitemap.xml` + `robots.txt`; include `<xhtml:link rel="alternate">` entries per locale.

**Acceptance**
For `/fr/news`: `canonical=/fr/news`, hreflang `en=/en/news`, `fr=/fr/news`,
`x-default=/en/news`; admin pages return `noindex`; WhatsApp preview renders correctly in FR.

## 11. THE APP SHELL NEEDS PRODUCT PATTERNS, NOT JUST WRAPPERS — 🟡

`app/account/dashboard/page.tsx` is a genuinely good base pattern: role-aware (staff vs
member variants), stat cards, recent activity, recommended actions. `app/admin/dashboard`
follows with `PageHeader`/`StatGrid`/`StatusBadge`. What's missing: a profile area with sign
out, per-role quick actions beyond links, reusable empty states in app areas, and consistent
page headers across every role-based section.

**Lock in these decisions**
- 🔧 The account dashboard is the canonical pattern; every role-based landing reuses its
  structure: header (greeting + role badge) → stat grid → activity list → quick actions.
- 🔧 Every app page has: `PageHeader` (title + description + primary action), consistent
  empty states with a next-action CTA, and no dead ends.
- 🔧 Profile area lives in the AppShell topbar (avatar → profile / sign out), so it's on
  every app page, not just the dashboard.
- 🔧 **No blank navigation, in any shell:** every route group ships a route-level
  `loading.tsx` with a shell-specific skeleton (`components/system/page-skeletons.tsx`:
  `PublicPageSkeleton`, `AdminPageSkeleton`, `AccountPageSkeleton`, `FocusedPageSkeleton`,
  plus the `ApertureMark` brand motif). New segments inherit this rule.

**Tasks**
- [ ] Extract `AppPageHeader`, `AppStatGrid`, `AppEmptyState` from the existing dashboard
      components; adopt them everywhere in admin/account.
- [ ] Add the profile + sign-out area to the AppShell topbar.
- [ ] Per-role dashboards: contributor (submission status timeline), advertiser (campaign
      summary), member (activity + follows) — can start as conditional sections.
- [ ] Give every admin/account list view a localized empty state with its primary CTA.

**Acceptance**
Each role's landing answers "who am I, what's my status, what do I do next" without leaving
the page; all app pages share the same header/empty-state components.

---

## 12. ROLLOUT QA CHECKLIST — run before calling any of this "done"

Work through both locales (`en` **and** `fr`) unless marked `[once]`.

**Locale & routing**
- [ ] Language switcher works from every page type and never 404s.
- [ ] First visit with an FR browser lands on `/fr`; choice persists via cookie.
- [ ] Every sitemap.md URL resolves in both locales; unprefixed URLs follow the item-1 policy.
- [ ] `<html lang>` updates on switch; page reload keeps the locale.

**Auth & redirects**
- [ ] Login / signup / reset / reset-update all work in both locales, errors included.
- [ ] `next=` is preserved from a protected page through login to the destination.
- [ ] Post-login landing matches the role matrix (item 4) in both locales.
- [ ] Email-link flows (verify/reset) land in the right locale via `/auth/callback`.
- [ ] Redirect matrix in item 9 passes for cookie=en, cookie=fr, and no cookie.

**Shell isolation**
- [ ] Public pages show header + footer; no app chrome leaks in.
- [ ] Admin/account pages show app chrome; no public header/footer leaks in.
- [ ] Focused screens (auth, submit forms, confirmation) show neither — only the back path.

**Access control**
- [ ] Anonymous deep link to any protected page → localized login with `next` preserved.
- [ ] Anonymous `/en/admin/*` and `/fr/admin/*` are **blocked** (P0-2 regression test).
- [ ] Editor cannot open users/ads/storage by URL; menus hidden per the item-5 matrix.
- [ ] Every mutating admin action refuses a non-admin via direct invocation.

**Navigation & responsive**
- [ ] Mobile nav (public hamburger, admin drawer) works at 320/390/768.
- [ ] Sidebar collapse/expand persists; sticky topbar behaves on scroll.
- [ ] Back button returns to the correct page from every focused screen (item 3 matrix).

**Metadata & errors**
- [ ] Canonical + hreflang spot-checked on a content index and detail page in both locales.
- [ ] WhatsApp preview verified for a story link in FR.
- [ ] Localized 404 (hit a bogus URL under `/fr`) and localized error boundary.
- [ ] `sitemap.xml` lists both locales; admin/account are `noindex`.

**Sign-off**

| Area | Owner | Date | Result |
|---|---|---|---|
| Items 1–4 (routing/shells/flows) | | | |
| Items 5–6 (roles/i18n) | | | |
| Items 7–10 (nav/responsive/redirects/SEO) | | | |
| Item 12 QA pass ×2 locales | | | |

---

*Keep this file honest: when a decision above changes, update it in the same PR that
changes the code. When a P0 is fixed, tick its reference and move the item to the changelog
below.*

## Changelog

- 2026-09-02 — Created from the "missing architecture and product steps" review; audited
  against the codebase; P0-1…P0-8 recorded.
- 2026-09-02 — **Structural overhaul shipped** (`npm run build` green, `tsc --noEmit`
  clean): every page moved under `app/[locale]/(public|app|focused)`; `proxy.ts` is the
  single locale redirect; shells are route-group-driven (`PublicShell`,
  admin/account `AppShell`s, `FocusedShell` + `BackButton`); guards redirect to
  localized login/not-authorized; `next="` carries through login→landing and
  `/auth/callback`; auth/account/admin dictionaries added (en+fr); localized
  not-found/error; `buildAlternates` hreflang per public page; locale-aware
  `sitemap.ts`/`robots.ts`; bare-href audit script (`scripts/find-bare-hrefs.mjs`).
  Still open (tracked per item): admin per-role task screens, medium/per-role dashboards
  beyond the account dashboard pattern.
- 2026-09-03 — **Phase 0 foundations + About redesign shipped** (`tsc --noEmit` clean,
  bare-href audit zero findings): route-level `loading.tsx` for (public)/(app) admin/
  account/(focused) backed by shell-specific skeletons and the `ApertureMark` brand motif
  (`components/system/`); standard `EmptyState` component; all locale-blind links fixed
  (admin filter/tab/form URLs now route through `localePath`; fundraising, submit-form and
  featured-spotlight bare hrefs resolved); bare-href audit extended to `(app)` +
  `components/` with `localePath`/`p()` exemptions; admin inner pages fully localized
  (moderation/content/users/ads/audit/storage + their client actions — P0-6 remainder
  closed); `Tabs` upgraded to prefetching `Link`s (no more `window.location` reloads);
  content page now fetches homepage slots in the request locale (was hardcoded `'en'`);
  About page rebuilt as the brand's flagship ("The Eye That Never Blinks": aperture hero,
  core-loop journey, DB-fed live stats band via `getCommunityStats`, verification
  pipeline, values, charter) with full en/fr dictionary coverage. Next: Phase 2 admin
  command center (moderation preview/edit drawer, trust & safety queues, polls +
  fundraisers managers).
- 2026-09-03 — **Phase 2 admin command center shipped** (`tsc --noEmit` clean,
  bare-href audit zero findings, `npm run build` green): new `managePolls` +
  `manageFundraisers` capabilities (admin + editor) driving nav entries and the new
  `requireCapability`/`assertCapability` guards (pages and Server Functions now gate on
  capabilities, completing the defense-in-depth chain layout-guard → action-check →
  RLS); `/admin/polls` manager (create poll with options-from-lines + closes-in-days,
  activate/close, per-option tallies with leading indicator); `/admin/fundraisers`
  manager (inline edit of goal/currency/organizer/donation URL/verification notes,
  close/reopen, progress bar, story deadline); `/admin/moderation/[id]` review screen
  (submitter + contact, consent/rights confirmation, structured payload preview with
  `emptyPayload` fallback, internal notes, approve/reject-with-reason, view-content
  deep link) plus Review links from the queue; polls admin tallies read via the
  `poll_results` view separately (PostgREST cannot embed the view through
  `poll_options`); `approveSubmission` no longer wipes saved internal notes when called
  without notes; migration `20260903000000_admin_polls_fundraisers.sql` adds staff RLS
  on polls/poll_options, write grants for the staff session client, and the missing
  fundraisers UPDATE grant.






