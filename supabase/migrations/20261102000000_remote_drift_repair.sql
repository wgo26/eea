-- Migration: 20261102000000_remote_drift_repair.sql
--
-- Description: Repair live schema drift found after pushing the Phase 1-5
--   migrations (verified via `npm run verify:types` against the live DB).
--
--   The live project created several admin tables outside the migration
--   history, so `CREATE TABLE IF NOT EXISTS` skipped and live diverged:
--
--   1. Missing columns the code reads/writes (runtime failures without this
--      repair): `admin_notifications.link_path` (inserted by
--      lib/admin/notification-writes.ts, selected by
--      lib/admin/queries/notifications.ts) and `admin_widget_layouts.widgets`
--      (upserted by lib/admin/actions/widgets.ts).
--   2. Auto-generated `public_` foreign-key names (e.g.
--      `public_two_person_approvals_actor_id_fkey`) where the migrations and
--      every PostgREST `!hint` in the codebase expect the canonical short
--      names (`two_person_approvals_actor_id_fkey`). A wrong hint name is a
--      runtime 400 on the approvals console, the emergency console and the
--      translations page.
--   3. `emergency_publish_events.severity` check only allows
--      ('alert','critical') while the UI and
--      lib/admin/actions/emergency.ts publish ('info','warning','critical').
--
-- Every statement is idempotent (IF NOT EXISTS / guarded DO blocks) so the
-- migration is safe to replay and keeps `verify-migrations` green.

-- ---------------------------------------------------------------------------
-- 1. Missing columns
-- ---------------------------------------------------------------------------

alter table public.admin_notifications
  add column if not exists link_path text;

alter table public.admin_widget_layouts
  add column if not exists widgets jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. Severity check: the emergency console publishes info/warning/critical
-- ---------------------------------------------------------------------------

-- Drop any pre-existing severity check under any name, then install the
-- canonical one. The table is new (no legacy rows expected); if conflicting
-- rows ever exist the ADD fails loudly instead of silently miscategorizing.
do $$
declare c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.emergency_publish_events'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%severity%'
  loop
    execute format('alter table public.emergency_publish_events drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.emergency_publish_events
  drop constraint if exists emergency_publish_events_severity_check;

alter table public.emergency_publish_events
  add constraint emergency_publish_events_severity_check
  check (severity in ('info', 'warning', 'critical'));

-- ---------------------------------------------------------------------------
-- 3. Canonical FK names (PostgREST hints use the short names)
-- ---------------------------------------------------------------------------

do $$
declare r record;
begin
  for r in select * from (values
    ('admin_notifications', 'public_admin_notifications_user_id_fkey', 'admin_notifications_user_id_fkey'),
    ('admin_notifications', 'public_admin_notifications_source_fkey', 'admin_notifications_source_fkey'),
    ('admin_widget_layouts', 'public_admin_widget_layouts_user_id_fkey', 'admin_widget_layouts_user_id_fkey'),
    ('api_credentials', 'public_api_credentials_created_by_fkey', 'api_credentials_created_by_fkey'),
    ('audit_events', 'public_audit_events_actor_id_fkey', 'audit_events_actor_id_fkey'),
    ('brand_asset_usage', 'public_brand_asset_usage_asset_id_fkey', 'brand_asset_usage_asset_id_fkey'),
    ('brand_asset_usage', 'public_brand_asset_usage_theme_id_fkey', 'brand_asset_usage_theme_id_fkey'),
    ('brand_assets', 'public_brand_assets_owner_id_fkey', 'brand_assets_owner_id_fkey'),
    ('brand_assets', 'public_brand_assets_replaced_by_id_fkey', 'brand_assets_replaced_by_id_fkey'),
    ('brand_theme_versions', 'public_brand_theme_versions_theme_id_fkey', 'brand_theme_versions_theme_id_fkey'),
    ('brand_theme_versions', 'public_brand_theme_versions_created_by_fkey', 'brand_theme_versions_created_by_fkey'),
    ('brand_themes', 'public_brand_themes_created_by_fkey', 'brand_themes_created_by_fkey'),
    ('brand_themes', 'public_brand_themes_approved_by_fkey', 'brand_themes_approved_by_fkey'),
    ('credential_events', 'public_credential_events_credential_id_fkey', 'credential_events_credential_id_fkey'),
    ('credential_events', 'public_credential_events_actor_id_fkey', 'credential_events_actor_id_fkey'),
    ('emergency_publish_events', 'public_emergency_publish_events_preset_id_fkey', 'emergency_publish_events_preset_id_fkey'),
    ('emergency_publish_events', 'public_emergency_publish_events_content_item_id_fkey', 'emergency_publish_events_content_item_id_fkey'),
    ('emergency_publish_events', 'public_emergency_publish_events_actor_id_fkey', 'emergency_publish_events_actor_id_fkey'),
    ('emergency_publish_events', 'public_emergency_publish_events_approval_id_fkey', 'emergency_publish_events_approval_id_fkey'),
    ('emergency_publishing_presets', 'public_emergency_publishing_presets_created_by_fkey', 'emergency_publishing_presets_created_by_fkey'),
    ('incident_events', 'public_incident_events_incident_id_fkey', 'incident_events_incident_id_fkey'),
    ('incident_events', 'public_incident_events_actor_id_fkey', 'incident_events_actor_id_fkey'),
    ('incidents', 'public_incidents_created_by_fkey', 'incidents_created_by_fkey'),
    ('submission_escalations', 'public_submission_escalations_submission_id_fkey', 'submission_escalations_submission_id_fkey'),
    ('submission_escalations', 'public_submission_escalations_escalated_by_fkey', 'submission_escalations_escalated_by_fkey'),
    ('submission_escalations', 'public_submission_escalations_assigned_to_fkey', 'submission_escalations_assigned_to_fkey'),
    ('submission_reviews', 'public_submission_reviews_submission_id_fkey', 'submission_reviews_submission_id_fkey'),
    ('submission_reviews', 'public_submission_reviews_reviewer_id_fkey', 'submission_reviews_reviewer_id_fkey'),
    ('system_state_events', 'public_system_state_events_state_id_fkey', 'system_state_events_state_id_fkey'),
    ('system_state_events', 'public_system_state_events_actor_id_fkey', 'system_state_events_actor_id_fkey'),
    ('system_state_themes', 'public_system_state_themes_state_id_fkey', 'system_state_themes_state_id_fkey'),
    ('system_state_themes', 'public_system_state_themes_theme_id_fkey', 'system_state_themes_theme_id_fkey'),
    ('system_state_themes', 'public_system_state_themes_created_by_fkey', 'system_state_themes_created_by_fkey'),
    ('system_states', 'public_system_states_activated_by_fkey', 'system_states_activated_by_fkey'),
    ('translation_jobs', 'public_translation_jobs_content_item_id_fkey', 'translation_jobs_content_item_id_fkey'),
    ('translation_jobs', 'public_translation_jobs_translator_id_fkey', 'translation_jobs_translator_id_fkey'),
    ('translation_jobs', 'public_translation_jobs_reviewer_id_fkey', 'translation_jobs_reviewer_id_fkey'),
    ('two_person_approvals', 'public_two_person_approvals_actor_id_fkey', 'two_person_approvals_actor_id_fkey'),
    ('two_person_approvals', 'public_two_person_approvals_approver_id_fkey', 'two_person_approvals_approver_id_fkey')
  ) as v(tbl, old_name, new_name)
  loop
    if exists (select 1 from pg_constraint where conname = r.old_name)
       and not exists (select 1 from pg_constraint where conname = r.new_name) then
      execute format('alter table public.%I rename constraint %I to %I', r.tbl, r.old_name, r.new_name);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Media archive FK the drifted table missed (column exists, constraint does
--    not — matches the migration's inline REFERENCES intent)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'media_assets_archived_by_fkey') then
    alter table public.media_assets
      add constraint media_assets_archived_by_fkey
      foreign key (archived_by) references public.profiles (id) on delete set null;
  end if;
end $$;
