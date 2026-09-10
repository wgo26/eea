B — CRUD Matrix (still missing)
Area	Create	Read	Edit	Delete	Gap
Content content/	✓ dialog	✓ now paginated (20) + status/type filters, no search	✓ dialog	✓ admin-only	No bulk publish/archive/delete, no duplicate/clone, no versioning, no select-all.
Listings listings/	— via content	✓ status pills, no search/pagination	—	— (remove only soft-archives)	No Edit at all — price/photos/seller live in /admin/content with no bridge link. No bulk. listings-actions.tsx = expire/relist/sold/remove only.
Moderation moderation/	— (intake only)	✓ but 5×1000 rows merged in-memory then sliced to 100	—	✓ queue + detail (fixed)	No bulk approve/reject, no "next submission" on detail, payload = humanizeKey + JSON.stringify dump, photos as comma-joined URLs, no preview thumbnails.
Users users/	✓ invite	✓ 100-cap, no pagination	— dropdown role only	✓ reauth	No profile/name/email edit. updateContributorCuration (lib/admin/actions.ts:987) orphaned — zero UI imports. Restore still window.confirm (user-actions.tsx:164). No bulk invite/suspend.
Ads — slots	✓ card	✓	✗ updateAdSlot (actions.ts:1220) orphaned	✗ deleteAdSlot (actions.ts:1308) orphaned	Slot row only toggles its campaign's paused/active. Seed slots cannot be edited/removed from UI.
Ads — advertisers	✓	✓	✓ but window.prompt×3 (advertiser-actions.tsx:13-17), phone never prompted	✓ but window.confirm	Native dialogs = unfocusable, unstylable, unlocalizable. No drawer.
Ads — campaigns	✓	✗ only slots with an active campaign are listed — pending/ended/paused/future invisible	✓ window.prompt	✓ window.confirm, server blocks status=active	No real campaign list. ad-slot-actions.tsx:21 alert() on error. No bulk.
Ads — inquiries	—	✓	approve/reject inline	— no delete for spam/stale	Slot/date selects cramped in table row. No bulk.
Fundraisers	✓	✓ 100-cap, no search/filter	✓ goal/currency/organizer/URLs + now title/desc (A9 fixed)	✓ admin-only	No payout detail rollup, no per-organizer view.
Polls	✓ single-locale	✓ locale filter (A6 fixed)	✓ but options locked with votes; active must close first	✓ with override	Results = raw counts + "Leading" tag, no chart, no on-screen export preview.
Taxonomy	✓	✓	✓	✓ reassign-or-block	Redirects dialog is second hand-rolled modal. No bulk.
Policies/About	✓ version	✓	✓ inline card	✓ version delete (current-protected)	Flat cards, no diff between current vs archived, no clone-from-existing.
Legal inbox policies/inbox	—	✓ 50-cap	resolve/dismiss only	— no delete	History retained forever.
Trust & Safety trust-safety/	—	✓ 100-cap, status pills	investigate/resolve/dismiss	— (dismiss only)	No "delete junk report", no jump-to-content-edit from a report (contentHref added but no edit link).
Storage storage-backup/	—	✓ aggregates only	triggerBackup / queueStorageVerification	— no asset delete	No per-asset table — can't see WHICH files are pending/backup/verification. queueStorageVerification(mediaId?) called with no arg. Providers as raw keys.
Audit audit-log/	—	✓ 100-cap, action/entity free-text, CSV export	—	—	No pagination, no date-range, free-text filters (typo = zero results) instead of selects, no total count.
Homepage slots content?tab=homepage	✓	✓	assign/search (fixed), toggle, reorder	✓ delete (fixed)	No drag-reorder, no empty-slot defaults, cover is implicit first asset — no "set as cover".
C — Cannot Delete Dummy Data (still true)
1. Role asymmetry: content/polls/fundraisers/taxonomy deletes gated canDelete=isAdminRoles(roles) — editors/contributors create test rows they cannot remove, no explanation in UI.
2. No-delete rows: ad inquiries, reports/corrections after dismissal, data_requests, audit entries, policy history (current-protected), storage assets. Submission spam is now deletable (already fixed), everything else piles up.
3. Demo data CLI-only: scripts/seed-demo.mjs / seed-fundraisers.mjs / migration-seeded polls teardownable only via scripts/teardown-demo.mjs — no "demo content" badge or sweep surfaced in admin.
D — General UI/UX Mediocrity (still true)
Patterns & consistency
- 3 dialog systems: shadcn Dialog, ConfirmDialog/AlertDialog, hand-rolled fixed inset-0 divs (review-actions.tsx:386) — different focus traps, z-indexes, close behaviors.
- 2 hand-rolled dropdown menus (content-actions.tsx:76-104, user-actions.tsx:208-236) — no keyboard nav, no aria-expanded, no Escape, backdrop divs.
- Native window.prompt/confirm/alert in ads + users-restore — violates confirm-dialog.tsx:19 "instead of window.confirm".
- 4 tab implementations: <Tabs>, pill <a> arrays, plain <nav> (ads), plain <form> (audit). No shared SegmentedControl. Counts on some, not others.
- Section headings drift: mixed uppercase text-xs vs text-sm font-medium, inconsistent mb-*.
- Filter/search non-uniform: users has a search box; content now has pagination but no q; moderation/listings/trust-safety/audit have no shared SearchableSelect.
- No sorting anywhere: data-table.tsx:33-46 headers are static <th>, no onSort, no aria-sort.
Information design
- Dashboard dashboard/page.tsx: static, partly misleading — "Active listings" card showed expiringListings (mislabeled), only 3/12 cards clickable, StatCard trend never passed, pendingByType chips are <div> not links, recentActivity = moderation getRecentModeration only (not full audit), no SLA "oldest pending >48h", no quick-actions.
- Review screen moderation/[id]/page.tsx:20-31: ugly humanizeKey dump, photos as comma text, no thumbnails, no locale-aware labels.
- Polls/fundraisers are cards, everything else is tables — no coherent collection language.
- Empty states: identical dashed boxes, single sentence, no icon, no "Create first / Clear filters" CTA. data-table.tsx:21-27 default emptyMessage='No items found.' hardcoded.
- Content "Updated" column renders createdAt (content/page.tsx:153), not updatedAt.
Interaction quality
- Pagination now exists only on content (20/page). Every other list silently truncates at 100 (or 1000×5 merged) with no counts footer, no next/prev/load-more.
- No bulk actions, no undo on destructive ops, toasts have no dismiss. data-table.tsx has no selection/checkbox API.
- Filter changes are full server round-trips with full-page flash; no per-table Suspense. TableSkeleton (data-table.tsx:73-89) exported, zero imports — only generic AdminPageSkeleton (admin/loading.tsx).
- No keyboard shortcuts / command palette — no Cmd+K, no quick-jump, no recent items.
- Only moderation has deep links (/admin/moderation/[id]); content rows can't be copied/shared via URL.
- Stale rows after actions: many mutations router.refresh but no optimistic update; role toggle/feature/poll activate leave stale rows until manual navigation.
- Breadcrumbs: PageHeader breadcrumb only on moderation/[id]/page.tsx:88-94, nowhere else.
- Audit export used relative href="export" (fixed in A12), audit/auth inputs had no <label>/aria-label.
- Guard fallbacks inconsistent: trust-safety/page.tsx:36 → /admin/dashboard vs listings/page.tsx:35 → /admin/content (now capability-gated, but targets differ).
- Side-effect in render: runDueContentSweep() in listings/page.tsx:44 during render.
- Date formatting mixed: formatRelative (with/without locale) vs formatDateTime — no single helper.
E — Technical Debt (still true)
- Monolith files: lib/admin/actions.ts ~2,900 lines (50+ actions), lib/admin/queries.ts ~1,860 lines — impossible to navigate; per-domain modules would parallelize rebuild. lib/admin/labels.ts (A12) is the first extraction.
- Orphaned actions with zero UI: updateAdSlot, deleteAdSlot, updateContributorCuration (still dead).
- Heavy moderation reads: 5 parallel × limit:1000 then client merge/sort/slice (moderation/page.tsx:58-64) — wasteful, degrades with volume.
- Ad-hoc copy constants: inputCls/btnGhost/btnDanger string literals duplicated across 10+ files.
- Moderation statusParam dead code + status scoping fixed in this pass; remaining debt above intact.
G — Media (still entirely link-paste, except site logo)
The backend already does uploads (/api/uploads → uploadMedia → media_assets, 12 MB cap, 20/min, R2 + Supabase, SHA-256 backup) — the admin exposes it in one place: site logo (site-content-forms.tsx:287-317 file input + <img> preview).
#	Defect
G1	Content create/edit photos = newline textarea of pasted URLs (content-dialogs.tsx:251-253,623-625), content-validation.ts:44-45 checks only http prefix. No file picker, no drag-drop, no progress, no thumbnail strip, no reorder, no per-photo alt/caption. Existing photos = checkbox + truncated URL text (:606-622), no image preview.
G2	Moderation approve drawer photos = same textarea (review-actions.tsx:429-431). Reviewer cannot upload a replacement cover or pull submitter photos in visually.
G3	Public submit forms photos/doc = same textareas/inputs (submit-form.tsx:149-155,183-185,205-207,307-309 textareas; :248-250 doc as plain Input). Citizens must host images elsewhere and paste URLs — biggest intake friction on a photo-led product.
G4	No video anywhere — no video field in content dialogs, review drawer, submit forms, or media_assets kind handling in admin UI. No upload, embed, or thumbnail.
G5	No media library / picker — no browsable media_assets grid, no search, no reuse, no orphan detection. Every image re-pasted per item. Storage page is aggregates only.
G6	No inline validation — oversize/wrong-type/bad-URL fails at save time with a toast, not at the field. No dimensions/size hint, no per-URL error row.
G7	Cover is implicit — queries.ts:280 cover:media_assets!inner(public_url) first asset wins. No "set as cover", no crop, no focal-point. Homepage slots show thumbnails but admin cannot choose which image that is.