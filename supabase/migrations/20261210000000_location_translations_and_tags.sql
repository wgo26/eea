-- ============================================================================
-- Eagle Eye Africa — Location translations & tagging (Phase 2)
--
-- location_translations mirrors category_translations: per-locale name +
-- description so Francophone readers see "Buéa" not "Buea".
-- location_tags + location_taggings let admins tag places independently of
-- content tags (e.g. "market", "historical", "flood-prone", "fondom").
--
-- Safe to run twice.
-- ============================================================================

-- 1. Per-locale names / descriptions -----------------------------------------
create table if not exists public.location_translations (
    location_id uuid not null references public.locations (id) on delete cascade,
    locale      text not null,
    name        text not null,
    description text,
    primary key (location_id, locale)
);

create index if not exists location_translations_location_idx
    on public.location_translations (location_id);

create index if not exists location_translations_locale_idx
    on public.location_translations (locale);

-- 2. Independent location tags -----------------------------------------------
create table if not exists public.location_tags (
    id          uuid primary key default gen_random_uuid(),
    slug        text not null unique,
    name_en     text not null,
    name_fr     text not null,
    color       text,
    created_at  timestamptz not null default now()
);

create index if not exists location_tags_slug_idx
    on public.location_tags (slug);

-- 3. Tagging join table ------------------------------------------------------
create table if not exists public.location_taggings (
    location_id uuid not null references public.locations (id) on delete cascade,
    tag_id      uuid not null references public.location_tags (id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (location_id, tag_id)
);

create index if not exists location_taggings_tag_idx
    on public.location_taggings (tag_id);

-- 4. RLS ---------------------------------------------------------------------
alter table public.location_translations enable row level security;
alter table public.location_tags enable row level security;
alter table public.location_taggings enable row level security;

create policy if not exists "Public read location translations"
    on public.location_translations for select
    using (true);

create policy if not exists "Staff manage location translations"
    on public.location_translations for all
    using (public.is_staff()) with check (public.is_staff());

create policy if not exists "Public read location tags"
    on public.location_tags for select
    using (true);

create policy if not exists "Staff manage location tags"
    on public.location_tags for all
    using (public.is_staff()) with check (public.is_staff());

create policy if not exists "Public read location taggings"
    on public.location_taggings for select
    using (true);

create policy if not exists "Staff manage location taggings"
    on public.location_taggings for all
    using (public.is_staff()) with check (public.is_staff());
