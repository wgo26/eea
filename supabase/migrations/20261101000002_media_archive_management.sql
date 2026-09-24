alter table public.media_assets
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references public.profiles (id) on delete set null,
  add column if not exists crop jsonb,
  add column if not exists resize_width integer,
  add column if not exists resize_height integer,
  add column if not exists resized_at timestamptz,
  add column if not exists captured_at timestamptz,
  add column if not exists location_text text,
  add column if not exists creator text,
  add column if not exists copyright_holder text,
  add column if not exists license text,
  add column if not exists usage_permission text,
  add column if not exists consent_status text;

alter table public.media_assets
  drop constraint if exists media_assets_consent_status_check;
alter table public.media_assets
  add constraint media_assets_consent_status_check
  check (consent_status is null or consent_status in ('pending', 'confirmed', 'not_required', 'withdrawn'));

create index if not exists media_assets_active_created_idx
  on public.media_assets (created_at desc)
  where archived_at is null;
create index if not exists media_assets_metadata_search_idx
  on public.media_assets using gin (
    to_tsvector('simple', coalesce(caption, '') || ' ' || coalesce(alt_text, '') || ' ' || coalesce(creator, '') || ' ' || coalesce(location_text, '') || ' ' || coalesce(rights_holder, ''))
  );
