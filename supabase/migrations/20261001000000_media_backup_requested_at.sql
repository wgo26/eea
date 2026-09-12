-- ============================================================================
-- Migration: 20260928000000_media_backup_requested_at.sql
-- Description: Add the missing media_assets.backup_requested_at column.
--
-- Why this exists:
--   init_schema.sql declares media_assets.backup_requested_at (the admin
--   "Trigger backup" button writes it — lib/admin/actions.ts triggerBackup),
--   but the hosted database was migrated from an older init revision.
--   20260920000001_remote_drift_repair.sql re-added the other backup-integrity
--   columns (backed_up_at / backup_sha256 / backup_verified_at) and missed
--   this one, so the button failed with "Could not find the
--   'backup_requested_at' column of 'media_assets' in the schema cache".
-- ============================================================================

alter table public.media_assets
  add column if not exists backup_requested_at timestamptz;

comment on column public.media_assets.backup_requested_at is 'When a backup of this asset was queued (storage-backup cron copies R2→B2, verifies SHA-256, then stamps backed_up_at).';