-- ============================================================================
-- Migration: 20260920000001_remote_drift_repair.sql
-- Description: Repair drift between the remote database and the repository's
--              init schema (audit production-hardening follow-up).
--
-- Why this exists:
--   The remote database was first migrated from an older revision of
--   20260901000000_init_schema.sql. Enum labels and columns that were later
--   added by EDITING the init file (instead of appending a migration) never
--   reached the remote, because the migration tracker records filenames, not
--   content. First visible symptom: `supabase db push` failed on
--   (the then-named) 20260921000000_production_phase1_3_fixes.sql with
--   `invalid input value for enum submission_status: "pending"`.
--
-- What this does:
--   1. Ensures every enum label the application writes exists (add value
--      if not exists — a no-op for labels already present, so this is safe
--      to run against any revision of the remote).
--   2. Ensures media_assets backup-integrity columns exist (the storage-backup
--      worker writes them; the remote's applied 20260920000000 may predate
--      the backed_up_at column).
--
-- Rules this file exists to enforce:
--   * Applied migrations are immutable — repairs always append new files.
--   * Every migration is idempotent and safe to re-run.
--
-- Note: ALTER TYPE ... ADD VALUE may run inside a transaction (PG 12+); the
-- values added here are only USED by later migrations, never in this one.
-- ============================================================================

alter type public.app_role            add value if not exists 'admin';
alter type public.app_role            add value if not exists 'editor';
alter type public.app_role            add value if not exists 'contributor';
alter type public.app_role            add value if not exists 'advertiser';

alter type public.content_type        add value if not exists 'photo_story';
alter type public.content_type        add value if not exists 'news';
alter type public.content_type        add value if not exists 'listing';
alter type public.content_type        add value if not exists 'notice';
alter type public.content_type        add value if not exists 'culture';

alter type public.content_status      add value if not exists 'draft';
alter type public.content_status      add value if not exists 'pending';
alter type public.content_status      add value if not exists 'approved';
alter type public.content_status      add value if not exists 'scheduled';
alter type public.content_status      add value if not exists 'published';
alter type public.content_status      add value if not exists 'archived';
alter type public.content_status      add value if not exists 'rejected';

alter type public.submission_type     add value if not exists 'photo_story';
alter type public.submission_type     add value if not exists 'news';
alter type public.submission_type     add value if not exists 'culture';
alter type public.submission_type     add value if not exists 'notice';
alter type public.submission_type     add value if not exists 'buy_sell';

alter type public.submission_status   add value if not exists 'pending';
alter type public.submission_status   add value if not exists 'in_review';
alter type public.submission_status   add value if not exists 'approved';
alter type public.submission_status   add value if not exists 'rejected';
alter type public.submission_status   add value if not exists 'needs_clarification';
alter type public.submission_status   add value if not exists 'published';
alter type public.submission_status   add value if not exists 'withdrawn';

alter type public.verification_status add value if not exists 'verified';
alter type public.verification_status add value if not exists 'community_submission';
alter type public.verification_status add value if not exists 'official_source';
alter type public.verification_status add value if not exists 'developing';

alter type public.notice_type         add value if not exists 'public_notice';
alter type public.notice_type         add value if not exists 'lost_found';
alter type public.notice_type         add value if not exists 'road_closure';
alter type public.notice_type         add value if not exists 'community_alert';
alter type public.notice_type         add value if not exists 'missing_person';
alter type public.notice_type         add value if not exists 'service_announcement';
alter type public.notice_type         add value if not exists 'government_notice';
alter type public.notice_type         add value if not exists 'school_notice';
alter type public.notice_type         add value if not exists 'organization_notice';
alter type public.notice_type         add value if not exists 'other';

alter type public.listing_status      add value if not exists 'draft';
alter type public.listing_status      add value if not exists 'active';
alter type public.listing_status      add value if not exists 'sold';
alter type public.listing_status      add value if not exists 'expired';
alter type public.listing_status      add value if not exists 'removed';
alter type public.listing_status      add value if not exists 'pending';

alter type public.ad_status           add value if not exists 'draft';
alter type public.ad_status           add value if not exists 'pending';
alter type public.ad_status           add value if not exists 'active';
alter type public.ad_status           add value if not exists 'paused';
alter type public.ad_status           add value if not exists 'ended';
alter type public.ad_status           add value if not exists 'rejected';

alter type public.report_type         add value if not exists 'spam';
alter type public.report_type         add value if not exists 'abuse';
alter type public.report_type         add value if not exists 'copyright';
alter type public.report_type         add value if not exists 'misinformation';
alter type public.report_type         add value if not exists 'other';

alter type public.report_status       add value if not exists 'open';
alter type public.report_status       add value if not exists 'investigating';
alter type public.report_status       add value if not exists 'resolved';
alter type public.report_status       add value if not exists 'dismissed';

alter type public.media_kind          add value if not exists 'image';
alter type public.media_kind          add value if not exists 'video';
alter type public.media_kind          add value if not exists 'audio';
alter type public.media_kind          add value if not exists 'document';

alter type public.storage_provider    add value if not exists 'r2';
alter type public.storage_provider    add value if not exists 'supabase';
alter type public.storage_provider    add value if not exists 'b2';
alter type public.storage_provider    add value if not exists 'cloudinary';

alter type public.storage_destination add value if not exists 'public_photo';
alter type public.storage_destination add value if not exists 'admin_asset';
alter type public.storage_destination add value if not exists 'backup';

alter type public.voice_type          add value if not exists 'formal';
alter type public.voice_type          add value if not exists 'pidgin';
alter type public.voice_type          add value if not exists 'camfranglais';

alter type public.layout_template     add value if not exists 'standard';
alter type public.layout_template     add value if not exists 'feature';
alter type public.layout_template     add value if not exists 'timeline';
alter type public.layout_template     add value if not exists 'photo_essay';
alter type public.layout_template     add value if not exists 'micro_story';
alter type public.layout_template     add value if not exists 'breaking';

-- ---------------------------------------------------------------------------
-- media_assets backup-integrity columns (storage-backup worker contract)
-- ---------------------------------------------------------------------------
alter table public.media_assets
    add column if not exists backed_up_at timestamptz,
    add column if not exists backup_sha256 text,
    add column if not exists backup_verified_at timestamptz;
