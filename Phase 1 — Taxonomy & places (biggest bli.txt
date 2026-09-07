Phase 1 — Taxonomy & places (implemented; deployment verification remains)
4. Migration + RLS: staff-only write policies for categories, locations (admin-only delete).
5. New lib/admin/actions.ts actions: createCategory/updateCategory/deleteCategory (with reassignment-or-block when items reference it), same trio for locations (slug regenerate + redirect note).
6. New /admin/taxonomy page (capability manageContent): two tabs, tables + create/edit dialogs; add taxonomy nav item + en-app/fr-app keys.
7. Regression: moderation [id] category/location selects keep working; public /locations/* redirects renamed slugs and 404s unknown slugs.
Phase 1 remaining omissions: apply and verify migrations in every environment; add Supabase integration tests for slug uniqueness and old-slug redirects; localize remaining public location labels; and verify redirect cleanup permissions against deployed RLS.


Phase 2 — Content full lifecycle (implemented; transactional and RLS integration hardening remains)
8. createContentItem action: admin direct-publish (bypasses submissions), with translations + media + type-specific rows (listings/notices/event fields).
9. deleteContentItem action (admin-only): removes item + translations + media assets + type rows + clears homepage_slots refs; confirm-dialog + audit entry. Archive stays as the soft path.
10. Content page: "New item" button + delete action per row; event date/venue fields editable in the drawer.
11. RLS check: admin bypass for delete across content_items, content_translations, media_assets, listings, notices.
Phase 2 remaining omissions: move create/edit workflows to transactional RPCs or an equivalent rollback-safe unit; make all audit writes durable and observable instead of best-effort; add role-based Supabase integration tests proving editors cannot delete; add rollback tests for child-row and storage failures; enforce content-type-to-extension-table constraints; add before/after audit metadata; reconcile analytics and search-index references; and add deployed-provider media cleanup verification.


Phase 3 — Engagement (polls + fundraisers)
12. Poll edit (question/options while draft; options locked once votes exist — show why) + poll delete (blocked with count when votes exist, admin override with audit).
13. Fundraiser create + delete; keep update/close/reopen.
14. Both on existing pages; no new routes.
Phase 3 remaining omissions: add Supabase integration tests for poll RLS, option-ID preservation, and vote constraints; make fundraiser money fields immutable/audited after donations; and add payment-provider/webhook reconciliation, refunds, fraud controls, receipts, and donor privacy controls.
Phase 3 completed hardening: draft poll option IDs are preserved during reorder; vote uniqueness and ballot validation are database-enforced; fundraisers auto-close at target; payout methods and currencies are validated; and home/poll/fundraiser paths are revalidated after mutations.


Phase 4 — Monetization inbox (advertise page → money)
15. Inquiry triage: advertise form already creates advertisers + ad_campaigns rows — surface pending ones in /admin/ads as an "Inquiries" tab with approve-into-campaign / reject.
16. Full advertiser edit/delete, campaign field edit/delete, ad_slots edit (size, placement, active).
17. Capability stays manageAds (admin-only); editors see nothing here.
Phase 4 remaining omissions: add immutable inquiry history and duplicate-inquiry detection; validate advertiser ownership and campaign budget/spend limits; add approval/rejection reasons and notifications; enforce ad creative moderation and expiry; add billing/payment reconciliation, invoice export, delivery/impression reporting, and campaign audit history; test that editors cannot read or mutate monetization data.
Slot Overlap & Oversubscription Prevention: Validating campaign date ranges (starts_at → ends_at) against target ad_slot capacity to prevent approving campaigns that exceed max concurrent banners for a placement.
Atomic Counter Updates for Impressions & Clicks: Utilizing atomic SQL increments (UPDATE ad_campaigns SET impressions_count = impressions_count + 1) via Supabase RPCs to prevent race conditions during high public traffic.
Creative URL & Protocol Sanitization: Strict URL safety checks for ad destination links (https:// enforcement) and image MIME-type validation for uploaded banner creatives.
Automatic Campaign Expiry Engine: Background job or scheduled check to transition campaign status from active → expired when ends_at passes or impression/click budgets are exhausted.


Phase 5 — People (users + contributors directory)
18. User actions: suspend/ban (blocks login via profiles.is_suspended + RLS/query enforcement), delete (GDPR path, content reassigned or anonymized), invite-by-email (creates user + role in one step).
19. Contributor curation: feature flag / bio override surfaced on /contributors.
20. Server-side search already exists; add status filter (suspended).
Phase 5 remaining omissions: require reauthentication and confirmation for suspension, ban, deletion, and role changes; add session/token revocation and appeal/reinstatement workflows; make GDPR deletion an asynchronous, verifiable erasure job with retention exceptions; preserve authorship through anonymized references; add invite expiry/resend and duplicate-account handling; add contributor consent, moderation, and attribution history; and test every role/status transition against RLS and login enforcement.
Self-Action & "Last Admin" Safeguards: Hard enforcement preventing admins from suspending, banning, deleting, or revoking admin status from themselves, as well as blocking demotion/deletion of the final remaining admin in the system.
Privilege Escalation Prevention: Server-side checks preventing non-admin staff (e.g. editor) from assigning admin roles or promoting users beyond their own capabilities.
Contributor Handle & Slug Uniqueness: Ensuring bio overrides and contributor profiles enforce unique handles to prevent routing collisions on public /contributors/[slug] pages.
Sensitive Action Audit Logging: Explicit audit entries whenever an admin views or updates user PII (GDPR export, email changes, invite link resends).


Phase 6 — Ops (storage, audit, dashboard, homepage)
21. Storage: per-file retry/verify, delete orphaned assets, per-bucket stats.
22. Audit log: filter by actor/action/entity + CSV export.
23. Homepage: create new slot keys (currently assign/toggle only).
24. Dashboard: make widgets link through to filtered admin views (e.g. pending count → moderation queue).
Phase 6 remaining omissions: add storage checksums, retry queues, orphan scans, provider health checks, and deletion verification; make audit logs append-only with actor/request metadata, filters, pagination, and CSV export tests; support homepage slot creation, validation, scheduling, preview, and conflict detection; add dashboard freshness/error states and links for every metric; add job monitoring, alerts, backups/restore drills, migration status, rate-limit visibility, cache invalidation, and incident notes.
Per this repo's standards each step ships: migration + RLS → lib/admin/queries.ts + actions.ts (with assertCapability) → page/UI under the correct route group → localePath links, dictionary keys in en-app.ts/fr-app.ts (never hardcoded strings), noindex inherited from the (app) layout → vitest for the new actions.
Cross-phase delivery gate: every mutation needs authorization tests, validation tests, RLS integration coverage, durable audit evidence, idempotency/retry behavior, transactional failure handling, localized UI copy, cache/search invalidation, and documented deployment/migration verification before its phase is marked complete.
Memory-Safe CSV Streaming: Chunked pagination/streaming for large audit log CSV exports to prevent server Node process Out-of-Memory (OOM) crashes.
Homepage Fallbacks & Empty Slot Handling: Graceful fallback components when a homepage slot references an item that was deleted, expired, or unpublished.
Storage Security Headers & CORS Config: Pre-signed URL expiration enforcement and Content-Security-Policy (CSP) header generation for R2/S3 asset buckets.
System Maintenance & Banner Toggle: Admin operational toggle for site-wide maintenance banners or read-only mode during major database migrations.