# Storage & backup — keeping data safe and the queue drained

**Where:** `/admin/storage-backup` (chief only). **Purpose:** see every byte
per provider/kind, mirror originals to the cold backup, verify them, and keep
stale bookkeeping from piling up.

## The pipeline

```
uploads → media_assets (R2 / Supabase) ──mirror──▶ B2 (SHA-256 verified)
                    │                                        │
                    └────── storage_tasks queue ─────────────┘
                              (verify · backup · delete · orphan_scan)
```

- **Trigger backup** marks un-backed-up R2 originals; the nightly job mirrors
  them to B2, downloads each copy back, and only then stamps `backed_up_at`
  with its SHA-256. Supabase-hosted assets are out of delta-backup scope.
- **Verify files** queues checksum/provider checks for `pending` assets (per
  row or all). The row shows verified / pending; per-row Verify re-queues one.
- **Delete** removes the stored object + metadata row (content-attached files
  warn first). The **B2 mirror is deliberately kept** — it is the
  disaster-recovery copy, not a cache.
- `lastBackupAt` reads the `storage-mirror` lease row — if it says *Never*
  while assets exist, the nightly job is not running (check `CRON_SECRET`).

## Queue operations (the tasks section)

- Header shows pending + failed depth at a glance.
- **Failed tasks stay until retried** — the nightly job never retries on its
  own. **Retry failed** re-queues them (attempts kept for forensics); inspect
  `last_error` first.
- **Completed tasks purge after 30 days** automatically (nightly
  `db-maintenance` sweep) or on demand with **Purge completed**.
- **Run restore drill** downloads a sample of origins next to their B2
  mirrors and compares SHA-256 — proof a restore *would* work, without
  overwriting anything. Run it monthly; a mismatch is a same-day
  investigation (do not delete the origin).
- **Scan orphans** lists B2 objects no ledger points at (mirrors, db-dumps,
  audit archives). Report-only — orphans are never auto-deleted.
- Any run that leaves failed tasks pages staff with a `storage.hygiene`
  alert — the queue cannot rot silently. Set `STORAGE_QUOTA_BYTES` to get an
  80%-of-quota warning in the same alert plus a usage line on the tab.

## Automation & schedules (cron)

| Job | Schedule | Does |
|---|---|---|
| `storage-backup?batch=100` | 02:00 UTC daily | Mirror + SHA-256 verify, drain queue, lease-guarded (409 on overlap), failed-task alert |
| `db-maintenance` | 02:30 UTC daily | Purge completed tasks > 30d, purge stale upload sessions + rate-limit buckets, **purge `audit_events` older than `AUDIT_RETENTION_DAYS`** (default 365) |
| `db-dump` | 02:45 UTC daily | `pg_dump` → gzip → B2 `db-dumps/`, ledger row, 30-day prune |

Heartbeats: 36h grace (`storage-backup`, `db-maintenance`), 60h (`db-dump`).
There is no restore button — restores are a documented manual procedure, see
`docs/disaster-recovery.md`, because a one-click restore is a one-click
overwrite. Full DB restores come from `db_dumps` (30-day ledger); file
restores come from the B2 mirror (never deleted by the app).

## Data model (for debugging)

- `media_assets`: provider/destination/kind/size + `backed_up_at`,
  `backup_sha256`, `backup_verified_at`, `verification_status`.
- `storage_tasks`: the queue (all four types; only `verify` is UI-produced
  today) with attempts + `last_error`.
- `backup_jobs`: the `storage-mirror` lease + `last_run_at`/`last_run_result`.
- `db_dumps`: cold-backup ledger with SHA-256 + expiry.

## Troubleshooting

- Backup run 409 `lease-held`: a previous run overran its 10-min lease —
  normal on huge batches; the next night catches up.
- `mismatched` verifies: bytes differ between origin and B2 — do not delete
  the origin; investigate the provider first.
- Pending backup never drains: `backup_requested_at` set but no run — check
  cron secret, then heartbeat staleness in `/api/ready`.
