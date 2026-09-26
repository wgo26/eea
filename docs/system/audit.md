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
incident review): export the filtered CSV first. There is no archive-to-cold
step today — the CSV *is* the archive.

## Data model & integrity notes

- `audit_events`: actor, role, action, resource, request id, source, metadata.
  Admin-read RLS, service-role writes; writes are best-effort and never fail
  the action they record; bulk ops write one row with a 10-id sample.
- `moderation_log`: staff append-only, content-joined for titles.
- Pagination is `O(page × limit)` per source (merged in memory) — deep pages
  are expensive; filter first, then page. Filter dropdowns sample 5,000 rows,
  so long-tail values under heavy volume may hide — search by text instead.
- No hash-chaining: tamper-evidence rests on append-only RLS + service-role
  writes + restricted (chief-only) reads. Treat DB-level access as the trust
  boundary.
