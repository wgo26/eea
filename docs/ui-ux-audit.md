# UI/UX Audit — Eagle Eye Africa (EEA) — Finalized Status

**Date:** 2026-09-23  
**Scope:** Public-facing Next.js website (`app/[locale]/(public)/`, `(focused)/` shells)  
**Method:** Source-code review + implementation verification — evidence cited by file path  
**Baseline (verified):** 260 tests passing, 18 skipped (RLS runs separately via `npm run test:rls`), `tsc` clean, `npm run check` clean. ISR `revalidate=300` on public pages.  
**Convention:** Statuses per `docs/LASTEST.MD` — **Implemented** (code changed), **Already Done** (existed pre-audit), **Declined** (documented decision), **Deferred** (out of scope / future phase).

---

## Quick-Verdict Matrix (Final)

| Pillar | Implemented | Already Done | Declined | Deferred | Key Evidence |
|---|---|---|---|---|---|
| 1. Cognitive Load | 1.1, 1.2, 1.4, 1.7 | 1.5, 1.8 | — | 1.3, 1.6 | toolbar overlap fixed, place-prompt snooze, cookie 2s delay, WA FAB desktop-only |
| 2. Friction / Conversion | 2.1, 2.2, 2.3, 2.4, 2.5 | 2.6 | — | 2.7 | review summary panel, Save Draft → link, contact indicator, advertise required, search zero-results links |
| 3. Responsive / Cross-Platform | — | — | — | 3.1, 3.2 | tablet breakpoint audit, carousel focus mgmt (out of scope) |
| 4. Visual Hierarchy / A11y | 4.3 | 4.1, 4.5 | 4.1 (done) | 4.2, 4.4 | main landmark id, Newsreader loaded on h1, reading-mode scope reasonable |
| 5. Gap vs Ultimate State | — | 5.5, 5.7 | 5.1 | 5.2, 5.3, 5.4, 5.6 | Listen TTS player exists, PWA largely done; events/ad-self-serve/faceted-search/newsletter = Phase-5 |

---

## 1. Cognitive Load & Psychological Optimization

### 1.1 Reader-toolbar + article-action-row overlap — **Implemented**
- **Fix:** `app/[locale]/(public)/news/[slug]/page.tsx:510` — passed `showTextSize={false}` to `<ArticleActionRow>` since `<ReaderToolbar>` (line 325) already provides TextSizeControl. Deduplicates text-size control.
- **Related:** 1.7 below resolves WhatsApp duplication.

### 1.2 Place prompt "Not now" permanently dismisses — **Implemented**
- **Fix:** `components/locations/place-prompt.tsx` — "Not now" now sets a 5-day snooze (`eea-place-remind-after`); "Don't show again" permanently dismisses (`eea-place-dismissed`). Backdrop close = 5-day snooze.
- **i18n:** `lib/i18n/chrome-en.ts:84-85`, `lib/i18n/chrome-fr.ts:74-75` — added `placePromptNever` keys.

### 1.3 Homepage has 4 ad slots above the fold — **Deferred**
- **Status:** Phase-5 ad placement per spec §11; scroll/time gating deferred to future work. No code change.

### 1.4 Cookie banner blocks content immediately — **Implemented**
- **Fix:** `components/system/cookie-banner.tsx:52-56` — added 2-second mount delay (`ready` state gated by `useEffect` timer) so banner never covers top-of-fold on first view.

### 1.5 Article "Listen" mode lacks audio player UI — **Already Done**
- **Evidence:** `components/system/listen-button.tsx` implements a full Web Speech API TTS player with playback controls, progress, and voice selection. Button in `ArticleActionRow` (line 80) launches it.

### 1.6 "View all" links use inconsistent labeling — **Implemented**
- **Fix:** Added section-aware keys to `lib/i18n/en.ts:46-52` / `fr.ts:45-51` (`viewAllPhotoStories`, `viewAllNews`, `viewAllNotices`, `viewAllBuySell`, `viewAllCulture`). Updated `components/home/home-sections.tsx` SectionHeader calls (lines 130, 160, 197, 206, 228) and `EmptySection` (line 169) to use section-specific labels.

### 1.7 Reader toolbar WhatsApp button duplicates mobile sticky action — **Implemented**
- **Fix:** `components/system/reader-toolbar.tsx:86` — toolbar WhatsApp Button now `className="hidden lg:inline-flex gap-1.5"` so it only renders on desktop; mobile FAB (`lg:hidden`, lines 93-107) remains the sole mobile WhatsApp action.

### 1.8 No "recently viewed" for anonymous users on detail pages — **Already Done**
- **Evidence:** `components/home/continue-reading-rail.tsx` renders on homepage and article detail pages (via `RecordRecentView` at `news/[slug]/page.tsx:172`), populated from device-local IndexedDB (`lib/cache/tags.ts:continue-reading`).

---

## 2. Friction Reduction & Conversion Flow

### 2.1 Submit form "Review" button resets to step 0 — **Implemented**
- **Fix:** `components/submit/submit-form.tsx:769-776` — replaced destructive `goStep(0)` reset with a toggle button that opens an expandable review summary panel reading live form values (captured via `captureReviewValues()` in handler, not during render). Panel shows Contact + Details groups with "Edit" links jumping to the relevant step.
- **i18n:** Reused `s.review` key — changed value to `'Review your answers'` (en, line 585) / `'Revoir ma soumission'` (fr, line 695). No new key needed.

### 2.2 Submit form Save Draft + Submit buttons side by side — **Implemented**
- **Fix:** `components/submit/submit-form.tsx:806-830` — Submit is now primary full-width button; Save Draft rendered as a subtle text-link below it (only for `canUpload`). Removed side-by-side button row.
- **i18n:** Added `saveDraft` key to `lib/i18n/en.ts:611` / `fr.ts:716` (`'Save draft'` / `'Enregistrer le brouillon'`).

### 2.3 Submit form Step 1 contact info is collapsed and easy to miss — **Implemented**
- **Fix:** `components/submit/submit-form.tsx:419-433` — collapsed contact summary now shows a validation indicator: green `Check` icon when `initial.email` present, amber `AlertCircle` when missing. Uses `lucide-react` imports added at line 7.

### 2.4 Advertise form has no inline validation — **Implemented**
- **Fix:** `components/advertise/advertise-form.tsx:75, 93` — added `required` attribute to both placement and format `<select>` elements. Browser validation fires before Turnstile widget.

### 2.5 Search lacks "no results" guidance — **Implemented**
- **Fix:** `app/[locale]/(public)/search/page.tsx:143-157` — added `SEARCH_SECTIONS` const with links to `/photo-stories`, `/news`, `/notices`, `/buy-sell`, `/culture`, `/locations` using existing `dict.nav.*` labels. Zero-results state (lines 203-220) now renders a recovery nav with these section quick-links.

### 2.6 Buy-sell listing contact reveal requires trust — **Already Done**
- **Evidence:** `components/buy-sell/message-seller-button.tsx` renders alongside `reveal-contact.tsx`, giving users "Message seller" (discreet) vs "Reveal contact" (direct) choice per audit recommendation.

### 2.7 Submit form autosave to localStorage but no restore indicator — **Deferred**
- **Status:** `components/submit/use-submit-draft.ts` restores draft via `restored` banner (submit-form.tsx:382-393). Audit's additional toast enhancement deferred.

### 2.8 Account dashboard uses monospace font — **False Positive (Declined)**
- **Evidence:** `app/[locale]/(app)/account/layout.tsx:19` applies `appMono.variable` (sets `--font-mono` CSS var) but NO `font-mono` class on body text. Actual `font-mono` usage is admin-only (tables, slugs, code samples). Account content uses default `font-sans` (Inter). No change needed.

---

## 3. Responsive Design & Cross-Platform Fluidity

### 3.1 No tablet-specific breakpoint review in Tailwind config — **Deferred**
- **Status:** Requires design-system audit of `md:` variants across components. Deferred to future Phase-3 task.

### 3.2 Focus management in hero carousel needs verification — **Deferred**
- **Status:** Carousel (`components/home/hero-carousel.tsx`, `hero-slide.tsx`) handles arrow keys and `prefers-reduced-motion`. Roving tabindex / ARIA live region verification deferred to accessibility sprint.

### 3.3 Mobile nav bottom drawer safe-area handling — **Already Done (Verified Good)**
- **Evidence:** `components/mobile-nav.tsx` uses `pb-[env(safe-area-inset-bottom)]`. Correctly handles iPhone notch + home indicator.

### 3.4 Responsive image sizes contract needs review — **Deferred**
- **Status:** Cross-reference `SmartImage` `sizes` props against CSS grid at each breakpoint. Deferred.

---

## 4. Visual Hierarchy & Accessibility

### 4.1 Typography identity — Inter only, no display serif — **Already Done / Declined (Done)**
- **Evidence:** `app/layout.tsx:28-35` loads Newsreader (700/800) as `--font-display` with `display: swap`. `app/globals.css:39,46` wires `--font-heading: var(--font-display)` and `font-display` utility. `app/[locale]/(public)/news/[slug]/page.tsx:226` uses `font-display` on article `<h1>`. Audit's "Inter only" claim was stale. Decision documented in `docs/audit.md` Phase 1 U5; now implemented per plan.

### 4.2 Contrast on muted text may be below WCAG AA — **Deferred**
- **Status:** Requires Lighthouse/axe-core run on key pages in both modes. Check `text-muted-foreground` on `bg-muted`, category pill, TrustBadge. Deferred to CI accessibility gate.

### 4.3 No skip-link on article detail pages — **Implemented**
- **Fix:** `components/shells/public-shell.tsx:69` — `<main id="main-content" tabIndex={-1}>` wraps all public page content (added `tabIndex={-1}`). Skip-link at line 52 (`href="#main-content"`) now has a focusable target.

### 4.4 Trust badge has 4 states but no visual differentiation audit — **Deferred**
- **Status:** Add help link/tooltip near badge explaining states. Deferred.

### 4.5 Article reading mode (distraction-free) toggle exists but scope unverified — **Already Done (Reasonably Scoped)**
- **Evidence:** `app/globals.css:345-352` — `body.reading-mode aside { display: none !important }` hides sidebar/rail; `main article` / `main > div > article` constrained to `max-width: 56rem` centered. Keeps byline, date, text-size controls, save-offline (not hidden). Scope reasonable per audit best practice.

---

## 5. Gap Analysis vs. The "Ultimate State" (`features.md`)

### 5.1 Typography identity (display serif) — **Already Done**
- **Status:** Implemented per 4.1 above. Marked DONE in `docs/LASTEST.MD`.

### 5.2 Events module — **Deferred (Phase-5)**
- **Status:** No `/events` route. Culture section is story-based. Spec §4.3. Deferred.

### 5.3 Advertiser self-serve dashboard — **Deferred (Phase-5)**
- **Status:** Only `/advertise/page.tsx` (inquiry form) exists. Admin has advertiser stats but no public portal. Spec §5.2. Deferred.

### 5.4 Faceted search — **Deferred (Phase-3 gap)**
- **Status:** `ilike` substring match only; category chips exist but no location/date/author facets. Spec §6.2. Deferred.

### 5.5 Audio player for article listening — **Already Done**
- **Status:** Full TTS player in `listen-button.tsx`. Spec §7.1. Marked DONE.

### 5.6 Newsletter/digest subscription — **Deferred (Phase-2 partial)**
- **Status:** `digest-cta.tsx` exists on homepage. Backend delivery + location curation unconfirmed. Spec §8.1. Deferred.

### 5.7 PWA installable + offline — **Already Done (Mostly)**
- **Status:** `offline/page.tsx`, `save-offline-button.tsx` (Cache API), manifest exist. `beforeinstallprompt` handler + background sync need final testing. Spec §9.1. Largely DONE.

---

## Severity Legend

| Severity | Definition |
|---|---|
| **CRITICAL** | Blocks core task completion or causes data loss |
| **HIGH** | Reduces conversion significantly or causes frequent user confusion |
| **MEDIUM** | Noticeable usability friction for a subset of users |
| **LOW** | Minor polish gap, edge-case experience improvement |

---

## Final Implementation Summary

| ID | Item | Status | Files Changed | Verification |
|---|---|---|---|---|
| 1.1 | Toolbar/ActionRow TextSize dedupe | Implemented | `app/[locale]/(public)/news/[slug]/page.tsx:510` | tsc ✓, test ✓, lint ✓ |
| 1.2 | Place-prompt 5-day snooze + never | Implemented | `components/locations/place-prompt.tsx`, `chrome-en/fr.ts` | tsc ✓, test ✓, lint ✓ |
| 1.4 | Cookie banner 2s delay | Implemented | `components/system/cookie-banner.tsx` | tsc ✓, test ✓, lint ✓ |
| 1.6 | Section-aware View All labels | Implemented | `lib/i18n/en/fr.ts`, `components/home/home-sections.tsx` | tsc ✓, test ✓, lint ✓ |
| 1.7 | Reader-toolbar WA desktop-only | Implemented | `components/system/reader-toolbar.tsx:86` | tsc ✓, test ✓, lint ✓ |
| 2.1 | Review summary panel (no reset) | Implemented | `components/submit/submit-form.tsx` | tsc ✓, test ✓, lint ✓ |
| 2.2 | Save Draft → text link | Implemented | `components/submit/submit-form.tsx`, `lib/i18n/en/fr.ts` | tsc ✓, test ✓, lint ✓ |
| 2.3 | Contact collapsed validation icon | Implemented | `components/submit/submit-form.tsx` | tsc ✓, test ✓, lint ✓ |
| 2.4 | Advertise required placement/format | Implemented | `components/advertise/advertise-form.tsx` | tsc ✓, test ✓, lint ✓ |
| 2.5 | Search zero-results section links | Implemented | `app/[locale]/(public)/search/page.tsx` | tsc ✓, test ✓, lint ✓ |
| 4.3 | main landmark id + tabIndex | Implemented | `components/shells/public-shell.tsx:69` | tsc ✓, test ✓, lint ✓ |

**Gates:** `npm run typecheck` ✓, `npm run lint` ✓ (0 errors), `npm test` ✓ (260/18), `npm run check` sub-scripts ✓ (bare-hrefs, anon-bundle, client-dictionary, etc.)

---

*Finalized 2026-09-23 — all implemented items verified against baseline. Stale audit claims corrected with live code evidence.*