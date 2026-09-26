# Audit log — the trail that answers "who did what"

**Where:** `/admin/audit-log` (chief only). **Purpose:** one screen over two
append-only sources — `audit_events` (system-wide privileged actions) and
`moderation_log` (editorial pipeline) — merged newest-first with an `origin`
badge, detail drawer, and CSV export.

## Daily use

- **Filters:** origin, action, entity type, **actor** (recent humans, exact
  match), date range, free text (sanitized against PostgREST injection).
  Chips remove one facet; clearing all resets. Pagination preserves filters.
- **Export CSV** streams the *current filter set* (actor included), RFC-quoted,
  newest-first — the same filters the screen shows, so an export is
  reproducible evidence.
- **Detail drawer** shows transition, actor, entity, request id and notes
  without losing scroll position.

## Retention (automation)

The trail grows unbounded, so the nightly `db-maintenance` job hard-deletes
`audit_events` older than `AUDIT_RETENTION_DAYS` (env, 30–3650, default 365).
Deliberately kept forever: `moderation_log` (per-item editorial history) and
`credential_events` (key lifecycle) — small, and needed for forensics.

**Before the retention window drops anything you may need** (legal hold,
incident review): export the filtered CSV first. The monthly `audit-archive`
cron (1st, 03:30 UTC) seals everything since the last bundle into B2
`audit-archive/` with a ledger row — but **only after verifying the hash
chain from genesis**. A break aborts the archive loudly instead of sealing a
lie. The audit page shows the newest bundle and a **Verify chain** button
(bounded on-demand replay).

## Data model & integrity notes

- `audit_events`: actor, role, action, resource, request id, source, metadata,
  plus `prev_hash`/`entry_hash` — each row HMAC-seals its predecessor
  (`AUDIT_CHAIN_KEY`, else the credential key; without a key rows write
  unchained rather than failing). Pre-chain history stays readable outside
  the verifiable window.

## Data model & integrity notes

- `audit_events`: actor, role, action, resource, request id, source, metadata.
  Admin-read RLS, service-role writes; writes are best-effort and never fail
  the action they record; bulk ops write one row with a 10-id sample.
- `moderation_log`: staff append-only, content-joined for titles.
- Pagination is `O(page × limit)` per source (merged in memory) — deep pages
  are expensive; filter first, then page. Filter dropdowns sample 5,000 rows,
  so long-tail values under heavy volume may hide — search by text instead.
- Tamper-evidence rests on the hash chain (above) plus append-only RLS +
  service-role writes + restricted (chief-only) reads. Treat DB-level access
  as the trust boundary.
