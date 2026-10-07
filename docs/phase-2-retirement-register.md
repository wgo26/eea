# Phase 2 retirement register

## Scope

This register captures the first safe deprecations for the lean-cut release. It is intentionally limited to features that are already isolated from the five core jobs and can be retired without forcing a destructive database migration in the same release.

Decision owners are recorded by role rather than by person name so the register stays reusable in branch work, staging, and release notes without exposing private identities.

## Ownership and gate

- Product owner: confirms user impact, public messaging, and redirects.
- Technical owner: confirms route, server-action, cron, and bundle impact.
- Data/security reviewer: confirms retention, exports, and RLS/security risk.
- Moderator representative: confirms moderation capacity and urgent alert paths.
- Deployment owner: confirms feature flags, rollback, and scheduler ownership.

## Inventory and disposition

| Feature | Status | Evidence / impact | Route / code surface | Retention / rollback | Decision |
|---|---|---|---|---|---|
| Professionals storefronts | Active but retired from primary navigation | Duplicate directory, review/claim stack, SEO and moderation cost, no core user job | `/professionals`, `/professionals/[slug]`, `app/[locale]/(public)/professionals/*`, `components/professionals/*`, `lib/queries/businesses.ts`, `lib/professionals/actions.ts` | Keep claim intake and any verified business claims; redirect storefronts to `/locations`; preserve business listings only where they are needed for place pages or seller discovery | Hide + redirect + gate removal |
| Polls/votes/reactions | Retired from the public UI and admin flow | Engagement theater, low value before scale, extra moderation and reporting burden | `app/[locale]/(app)/admin/polls/*`, `lib/queries/polls.ts`, `components/news/poll-card.tsx`, `components/news/reaction-bar.tsx` | Do not delete tables in the same shipment; preserve active data for export and later archival review | Hide + deprecate + export before removal |
| Fundraisers | Retired from public and admin experience | Donation workflows add compliance and fraud risk without core product value | `app/[locale]/(app)/admin/fundraisers/*`, `lib/queries/fundraisers.ts`, related cron jobs | Keep service announcements in Notices; do not process payments; retain fund-raising records only if required by law or ongoing review | Hide + deprecate + retain data only if required |
| Live broadcasts, RSVP, chat | Retired from public pages and UI | Server cost, schedule complexity, moderation overhead, replaced by public links to external streams | `components/live/*`, `lib/live/*`, `app/[locale]/(public)/culture/events/*` | Keep link fields in content and avoid deleting event data until retention is reviewed | Hide + deprecate + replace with external link flow |
| Digest/AI/insights panels | Flagged for later review | High operational overhead, weak user value under a small-team model | admin dashboards, notification digests, cron jobs, analytics panels | Keep only if they support moderation or release-health monitoring | Hide/flag |
| Ad/prepaid boosts and payment flows | Deferred, not removed in the same release | Paid flows are high-risk and must not be orphaned | billing routes, ad tables, boost UI | Turn off new payments before any deletion; preserve inquiry-based advertiser contact route | Freeze + retain audit record |

## First safe deprecations

### 1) Professionals storefronts first

- Keep the claim and review intake path, because it is the safe, low-risk way to maintain verified local-business ownership without a whole storefront product.
- Redirect `/professionals` and locale-prefixed storefront detail routes to `/locations` with a permanent redirect (`308`) to preserve crawl and user flow clarity.
- Preserve any useful business metadata inside the Places experience or Market seller records only after ownership and moderation review.
- Do not delete business tables in the same release; keep them behind a staged export and migration review.

### 2) Polls, reactions, fundraising, and live broadcast surfaces second

- Remove these features from navigation and public pages before deleting the schema.
- Keep the content and moderation logs intact until the export-based retention review is complete.
- If any table is still referenced by active jobs or admin flows, leave it in place and replace the UI with a safe empty state rather than breaking the app.

### 3) Safeguards for the release

- Keep `legacy_redirects` authoritative for legacy URL moves.
- Keep localized routes intact; do not add bare `/professionals` style links back into the public navigation.
- Leave feature flags temporary, owner-scoped, and date-stamped.
- Require a production-like restore test before any actual schema removal.

## Redirect and retention policy

- Redirects: locale-prefixed and unprefixed storefront URLs are redirected to `/locations`, while claim intake remains live.
- Retention: preserve moderation logs, reports, user data subject to permissions, and any records needed for legal/audit obligations.
- Rollback: if a retirement breaks a live workflow, restore the old link or flag while leaving the new metadata intact.
- Deletion: treat any actual drop as a later migration after export review, not as part of the first deprecation pass.

## Evidence to keep with the release

- Proxy redirect behavior and tests for legacy vs. storefront routes.
- Public-sitemap updates and locale/bare-href checks showing the nav is limited to the five core destinations.
- Admin and moderation review notes confirming that no active workflow is stranded by the sunset.
- Staging export test and rollback notes for any tables that are still retained but hidden from the UI.
