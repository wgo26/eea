# Admin Gap-Closure — Full Implementation Plan

This plan works through all remaining gaps from the B / C / D / E / G audit matrix in priority order. Items are grouped by blast-radius and dependency order so nothing blocks anything else.

---

## User Review Required

> [!IMPORTANT]
> **Scope decision needed.** The gap list is enormous (16 admin areas × multiple gaps each + media upload overhaul). Implementing *everything* in one PR would produce a multi-thousand-line diff that is hard to review safely. Below I propose **5 sequential waves** that each ship a coherent, deployable slice. Please confirm whether you want all 5 waves or a subset, and whether there are areas you'd like skipped/deferred.

> [!WARNING]
> **`window.prompt` / `window.confirm` / `window.alert` removal** — `campaign-actions.tsx` still uses all three. The `advertiser-actions.tsx` has already been converted (it has a proper Dialog). Ads/campaigns will get proper Dialogs in Wave 1.

> [!IMPORTANT]
> **`updateAdSlot` / `deleteAdSlot` / `updateContributorCuration`** exist in `actions.ts` but have zero UI imports. Wave 1 wires `updateAdSlot`/`deleteAdSlot` to real slot Edit/Delete dialogs. `updateContributorCuration` will be evaluated — if the DB schema column still exists it will be wired to a user profile edit dialog; otherwise it will be deleted.

---

## Open Questions

> [!IMPORTANT]
> **Media upload (Wave 5 / G-series)** — The backend already supports uploads via `/api/uploads`. Should the admin content Create/Edit dialogs get a full file-picker with drag-drop and thumbnail strip (G1), or just a simple file-input that replaces the URL textarea? The former needs a new `MediaUploader` step; the backend is already wired.

> [!IMPORTANT]
> **Pagination strategy for moderation** — Currently 5×1000 parallel queries then client-side merge. The correct fix is a single paginated server query with status IN clause and server-side sort+slice. This changes the query signature. Confirm OK to modify `getSubmissions` in `queries.ts`.

> [!IMPORTANT]
> **Audit log date-range filter** — Free-text `action` / `entity` fields exist but no date-range picker. Should we add a `from` / `to` date-range (native `<input type="date">`) in Wave 3, or leave filters as-is?

---

## Proposed Changes by Wave

---

### Wave 1 — Native Dialog Elimination + Orphaned Actions Wired (highest risk, lowest code count)

Fix every `window.prompt` / `window.confirm` / `window.alert` and wire the two orphaned ad-slot actions.

---

#### [MODIFY] [`campaign-actions.tsx`](file:///c:/Users/VENTIZ/apps/eea/app/%5Blocale%5D/%28app%29/admin/ads/campaign-actions.tsx)
Replace `window.prompt`×2 + `window.confirm`×1 + implicit `alert()` with a shadcn `Dialog` (same pattern as `advertiser-actions.tsx`). Add proper `edit()` and `remove()` dialogs with `ConfirmDialog`.

#### [MODIFY] [`ad-slot-actions.tsx`](file:///c:/Users/VENTIZ/apps/eea/app/%5Blocale%5D/%28app%29/admin/ads/ad-slot-actions.tsx)
Currently only toggles campaign status. Add **Edit slot** (Dialog → `updateAdSlot`) and **Delete slot** (ConfirmDialog → `deleteAdSlot`). Both actions already exist in `actions.ts` — they are purely orphaned.

#### [MODIFY] [`user-actions.tsx`](file:///c:/Users/VENTIZ/apps/eea/app/%5Blocale%5D/%28app%29/admin/users/user-actions.tsx)
Add **Edit profile** dialog (display name, full name — read-only email) wiring the existing `updateContributorCuration` (or a new `updateUserProfile` action if the column has been removed). This resolves the "No profile/name/email edit" gap in Users.

#### [MODIFY] [`ads/page.tsx`](file:///c:/Users/VENTIZ/apps/eea/app/%5Blocale%5D/%28app%29/admin/ads/page.tsx)
Show **all campaigns** (not just active ones) by fetching them separately via a new `getAdCampaigns()` query — pending/ended/paused/future are currently invisible.

#### [NEW] `lib/admin/queries-ads.ts` (or inline in queries.ts)
Add `getAdCampaigns()` returning all campaigns with their status, not filtered to `active` only.

---

### Wave 2 — Pagination + Moderation Overhaul (performance + correctness)

#### [MODIFY] [`moderation/page.tsx`](file:///c:/Users/VENTIZ/apps/eea/app/%5Blocale%5D/%28app%29/admin/moderation/page.tsx)
Replace 5×1000 parallel queries with a single paginated query (`getSubmissions` with status array + pagination). Add **bulk approve/reject** toolbar using existing `BulkActionsBar` + `ModerationActions`. Add "next submission" link on detail page.

#### [MODIFY] [`lib/admin/queries.ts`](file:///c:/Users/VENTIZ/apps/eea/lib/admin/queries.ts) — `getSubmissions`
Accept `status: SubmissionStatus | SubmissionStatus[] | 'all'` and a `page`/`limit` instead of only a single status at limit:1000.

#### [MODIFY] [`moderation/[id]/page.tsx`](file:///c:/Users/VENTIZ/apps/eea/app/%5Blocale%5D/%28app%29/admin/moderation/%5Bid%5D/)
- Replace `humanizeKey` + `JSON.stringify` dump with locale-aware field labels.
- Photos: render thumbnail `<img>` from comma-joined URL field instead of raw text.
- Add **breadcrumb** (already used on this page — verify it's complete).
- Add **"Next pending"** link that resolves the next submission in the queue.

#### [MODIFY] [`users/page.tsx`](file:///c:/Users/VENTIZ/apps/eea/app/%5Blocale%5D/%28app%29/admin/users/page.tsx)
Add pagination (currently hard-capped at 100 with no count footer).

#### [MODIFY] [`audit-log/page.tsx`](file:///c:/Users/VENTIZ/apps/eea/app/%5Blocale%5D/%28app%29/admin/audit-log/page.tsx)
- Replace free-text action/entity inputs with `<select>` dropdowns populated from distinct values.
- Add date-range inputs.
- Add total-count footer (`N entries shown`).
- Add pagination (currently 100-cap, no next/prev).

---

### Wave 3 — Listings Edit + Trust-Safety + Storage Per-Asset Table

#### [MODIFY] [`listings/page.tsx`](file:///c:/Users/VENTIZ/apps/eea/app/%5Blocale%5D/%28app%29/admin/listings/page.tsx)
Add **Edit listing** — price/photos/seller — via a Dialog that re-uses the content edit dialog pattern. Add deep-link (`/admin/content?id=X`) bridge to the content edit dialog. Add bulk expire/relist/archive.

#### [MODIFY] [`listings-actions.tsx`](file:///c:/Users/VENTIZ/apps/eea/app/%5Blocale%5D/%28app%29/admin/listings/listings-actions.tsx)
Add Edit action (currently expire/relist/sold/remove only).

#### [MODIFY] [`trust-safety/page.tsx`](file:///c:/Users/VENTIZ/apps/eea/app/%5Blocale%5D/%28app%29/admin/trust-safety/page.tsx)
- Add **"Delete junk report"** action (dismiss-only currently).
- Add **"Edit content"** jump link (`contentHref` is already in the row, just needs an edit button).
- Add pagination (100-cap with no next).

#### [MODIFY] [`storage-backup/page.tsx`](file:///c:/Users/VENTIZ/apps\eea\app\[locale]\(app)\admin\storage-backup\page.tsx)
- Replace aggregates-only view with a **per-asset table** (`DataTable` with filename, kind, provider, size, backup status, verification status).
- Fix `queueStorageVerification(mediaId?)` — pass actual `mediaId` from the row.
- Fix provider keys to show human-readable labels.

#### [MODIFY] [`lib/admin/queries.ts`](file:///c:/Users/VENTIZ/apps/eea/lib/admin/queries.ts) — `getStorageStats`
Add `getMediaAssets({ page, limit, status? })` returning per-file rows from `media_assets`.

---

### Wave 4 — Dashboard Revival + UI Consistency

#### [MODIFY] [`dashboard/page.tsx`](file:///c:/Users/VENTIZ/apps/eea/app/%5Blocale%5D/%28app%29/admin/dashboard/page.tsx)
- Fix **Active listings** label (was showing `expiringListings` count — already has the right stat, fix the hint string).
- Make all 12 `StatCard`s clickable (currently only 3 are `<a>` wrapped).
- Pass `trend` prop to `StatCard` (currently always `undefined`).
- Make `pendingByType` chips `<a>` links to `/admin/moderation?type=X`.
- Add **SLA warning** — oldest pending > 48h.
- Add **Quick Actions** row (Create content, Invite user, New ad).

#### [MODIFY] [`components/admin/stat-card.tsx`](file:///c:/Users/VENTIZ/apps/eea/components/admin/stat-card.tsx)
Accept and render `trend?: { value: number; label: string }` prop.

#### [MODIFY] `components/admin/tabs.tsx`
Unify the 4 tab implementations (shadcn Tabs, pill `<a>` arrays, plain `<nav>`, plain `<form>`) into a single shared `AdminTabs` component. Migrate all admin pages to use it.

#### [MODIFY] `components/admin/empty-state.tsx`
Accept optional `icon`, `ctaLabel`, `ctaHref` props to replace the identical dashed-box pattern across all pages.

#### [MODIFY] `components/admin/bulk-actions.tsx`
Fix the hand-rolled confirm `<div>` inside `BulkActionsBar` — replace with `ConfirmDialog` (currently it's a `fixed inset-0` div, which is dialog system #3 per the audit).

#### [MODIFY] `app/[locale]/(app)/admin/content/page.tsx`
Fix **"Updated" column** — renders `createdAt` instead of `updatedAt` (confirmed: `content/page.tsx:153`).

---

### Wave 5 — Media Upload (G-series)

> [!IMPORTANT]
> This is the largest wave. The backend upload pipeline already exists (`/api/uploads`, `uploadMedia`, R2 + Supabase, SHA-256 backup). The work is purely UI.

#### [MODIFY] [`content-dialogs.tsx`](file:///c:/Users/VENTIZ/apps/eea/app/%5Blocale%5D/%28app%29/admin/content/content-dialogs.tsx)
Replace newline-textarea photo URLs (lines 251-253, 623-625) with `MediaUploader` component (already exists at `components/admin/media-uploader.tsx`). Add thumbnail strip, per-photo alt/caption, reorder. Existing photos show thumbnails not raw URLs.

#### [MODIFY] `moderation/[id]/review-actions.tsx`
Replace approve-drawer textarea (line 429-431) with `MediaUploader`.

#### [MODIFY] `app/[locale]/(public)/submit/submit-form.tsx`
Replace photo/doc textareas with file inputs + `MediaUploader` for public intake. This is G3 — the largest friction point for citizens.

#### [NEW] `components/admin/media-library.tsx`
Browsable `media_assets` grid with search, reuse, orphan detection (G5). Used from MediaUploader as a "pick existing" drawer.

---

## Verification Plan

### Automated Tests
- `npm run build` — TypeScript must compile with zero errors after each wave.
- Existing test files in `lib/admin/` must continue passing: `npx vitest run`.

### Manual Verification
- After Wave 1: Open `/admin/ads`, verify slot Edit/Delete dialogs open; campaign Edit/Delete use proper dialogs with no `window.prompt`/`confirm`.
- After Wave 2: Open `/admin/moderation` — verify only one DB round-trip (check Network tab), bulk toolbar appears on row select.
- After Wave 3: Open `/admin/listings`, verify Edit dialog; `/admin/storage-backup` shows per-file table.
- After Wave 4: Open `/admin/dashboard`, verify all cards are linked, pendingByType chips navigate to moderation.
- After Wave 5: In content create/edit dialog, drag a file — verify upload progress, thumbnail strip renders.
