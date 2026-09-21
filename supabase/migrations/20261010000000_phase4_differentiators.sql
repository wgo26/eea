-- ============================================================================
-- Eagle Eye Africa — Phase 4 Differentiators (2026-09-21)
--
-- 1. timeline_entries: Chronological story updates for developing stories
--    (Diff. #6: Eagle Eye Timeline)
-- 2. photo_pairs: Then & Now photo comparisons for community memory
--    (Diff. #11: Then & Now)
-- 3. share_text on content_translations: Pidgin/Camfranglais share text
--    for WhatsApp-first distribution (Diff. #8, #9)
-- 4. content_type 'micro_story' for Eye on the Street format (Diff. #8)
-- ============================================================================

-- Helper function: check if user has a specific role
-- Used by RLS policies in this migration
create or replace function public.has_role(user_id uuid, required_role text)
returns boolean
language sql
security definer
set search_path = public
as $$
    select exists (
        select 1 from public.user_roles
        where user_id = $1
          and role = $2::public.app_role
    );
$$;

-- Helper function: auto-update updated_at timestamp
-- Used by triggers in this migration
create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

-- 1. Timeline entries for live-updating stories
create table if not exists public.timeline_entries (
    id uuid primary key default gen_random_uuid(),
    content_item_id uuid not null references public.content_items(id) on delete cascade,
    timestamp timestamptz not null default now(),
    title text not null,
    body text not null,
    locale text not null default 'en',
    is_published boolean not null default true,
    sort_order int not null default 0,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists timeline_entries_content_item_id_idx
    on public.timeline_entries (content_item_id);
create index if not exists timeline_entries_timestamp_idx
    on public.timeline_entries (timestamp desc);
create index if not exists timeline_entries_published_idx
    on public.timeline_entries (is_published) where is_published = true;

-- RLS
alter table public.timeline_entries enable row level security;

create policy "Public can read published timeline entries"
    on public.timeline_entries for select
    using (is_published = true);

create policy "Editors can manage timeline entries"
    on public.timeline_entries for all
    using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'editor'))
    with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'editor'));

-- Updated_at trigger
create trigger update_timeline_entries_updated_at
    before update on public.timeline_entries
    for each row execute function public.update_updated_at_column();

-- 2. Photo pairs for Then & Now comparisons
create table if not exists public.photo_pairs (
    id uuid primary key default gen_random_uuid(),
    location_id uuid not null references public.locations(id) on delete cascade,
    then_image_id uuid not null references public.media_assets(id) on delete restrict,
    now_image_id uuid not null references public.media_assets(id) on delete restrict,
    then_caption text,
    now_caption text,
    locale text not null default 'en',
    is_published boolean not null default true,
    sort_order int not null default 0,
    created_by uuid references auth.users(id) on delete set null,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);

create index if not exists photo_pairs_location_id_idx
    on public.photo_pairs (location_id);
create index if not exists photo_pairs_published_idx
    on public.photo_pairs (is_published) where is_published = true;

-- RLS
alter table public.photo_pairs enable row level security;

create policy "Public can read published photo pairs"
    on public.photo_pairs for select
    using (is_published = true);

create policy "Editors can manage photo pairs"
    on public.photo_pairs for all
    using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'editor'))
    with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'editor'));

-- Updated_at trigger
create trigger update_photo_pairs_updated_at
    before update on public.photo_pairs
    for each row execute function public.update_updated_at_column();

-- 3. Add share_text column to content_translations for Pidgin/Camfranglais WhatsApp share text
--    Also add voice_type to support different voice/registers
alter table public.content_translations
    add column if not exists share_text text,
    add column if not exists voice_type public.voice_type;

-- Add micro_story to content_type enum (already exists as "timeline" but need to verify)
-- The enum already has 'timeline' from earlier migration

-- 4. Add micro_story to layout_template enum for the one-photo template
-- layout_template already has 'micro_story' from earlier migration

-- 5. Add content_type 'micro_story' to the enum if not exists
-- This requires ALTER TYPE which can't be done in a transaction, so we check first
do $$
begin
    if not exists (
        select 1 from pg_enum
        where enumlabel = 'micro_story'
        and enumtypid = 'public.content_type'::regtype
    ) then
        alter type public.content_type add value 'micro_story';
    end if;
end $$;

-- 6. Add user_place cookie-backed preference tracking
create table if not exists public.user_place_preferences (
    user_id uuid primary key references auth.users(id) on delete cascade,
    place_slug text not null references public.locations(slug) on delete restrict,
    locale text not null default 'en',
    updated_at timestamptz not null default now()
);

create index if not exists user_place_preferences_place_slug_idx
    on public.user_place_preferences (place_slug);

-- RLS
alter table public.user_place_preferences enable row level security;

create policy "Users can manage their own place preference"
    on public.user_place_preferences for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- Updated_at trigger
create trigger update_user_place_preferences_updated_at
    before update on public.user_place_preferences
    for each row execute function public.update_updated_at_column();

-- 7. Add saved_articles table for offline PWA reading
create table if not exists public.saved_articles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    content_item_id uuid not null references public.content_items(id) on delete cascade,
    locale text not null default 'en',
    saved_at timestamptz not null default now(),
    unique (user_id, content_item_id, locale)
);

create index if not exists saved_articles_user_id_idx
    on public.saved_articles (user_id);
create index if not exists saved_articles_content_item_id_idx
    on public.saved_articles (content_item_id);

-- RLS
alter table public.saved_articles enable row level security;

create policy "Users can manage their own saved articles"
    on public.saved_articles for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);

-- 8. Grant permissions
grant select on public.timeline_entries to anon, authenticated, service_role;
grant select on public.photo_pairs to anon, authenticated, service_role;
grant select on public.user_place_preferences to anon, authenticated, service_role;
grant select, insert, update, delete on public.saved_articles to anon, authenticated, service_role;