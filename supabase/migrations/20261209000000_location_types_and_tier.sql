-- ============================================================================
-- Eagle Eye Africa — Location types & tiered hierarchy (Phase 1 & 2 foundation)
--
-- Adds a typed tier registry (continent → country → region → division →
-- city → town → quarter → landmark) and extends locations with:
--   location_type_id   FK into location_types
--   depth              materialized depth from root (0 = continent)
--   path               materialized ancestor id path for fast descendant queries
--   alt_names          variant spellings / local names (e.g. "Buéa", "Duala")
--   is_featured        surfaced on homepage rails / place directories
--
-- Safe to run twice (idempotent via IF NOT EXISTS / DO blocks).
-- ============================================================================

-- 1. Tier registry -----------------------------------------------------------
create table if not exists public.location_types (
    id          uuid primary key default gen_random_uuid(),
    slug        text not null unique,
    name_en     text not null,
    name_fr     text not null,
    icon        text,            -- lucide icon name (globe, map-pin, building-2, …)
    color       text,            -- tailwind hex-ish, e.g. '#0ea5e9'
    sort_order  integer not null default 0,
    created_at  timestamptz not null default now()
);

-- 2. Extend locations with tier + materialized path --------------------------
alter table public.locations
    add column if not exists location_type_id uuid references public.location_types (id) on delete set null;

alter table public.locations
    add column if not exists depth integer not null default 0;

alter table public.locations
    add column if not exists path uuid[] not null default '{}';

alter table public.locations
    add column if not exists alt_names text[] not null default '{}';

alter table public.locations
    add column if not exists is_featured boolean not null default false;

-- Indexes for hierarchy traversal -------------------------------------------
create index if not exists locations_location_type_id_idx
    on public.locations (location_type_id);

create index if not exists locations_depth_idx
    on public.locations (depth);

create index if not exists locations_path_idx
    on public.locations using gin (path);

create index if not exists locations_alt_names_idx
    on public.locations using gin (alt_names);

create index if not exists locations_is_featured_idx
    on public.locations (is_featured)
    where is_featured;

-- 3. Backfill: depth + path from existing parent chains ----------------------
-- Depth: root (no parent) = 0, each child = parent.depth + 1.
-- Path: array of ancestor ids from root down to this row's parent, then self.
do $$
declare
    r record;
begin
    -- Iterate until no row changes (bounded safety: hierarchy is shallow).
    for r in
        with recursive walk as (
            select id, parent_id, 0 as d, array[id] as p
            from public.locations
            where parent_id is null
            union all
            select l.id, l.parent_id, w.d + 1, w.p || l.id
            from public.locations l
            join walk w on l.parent_id = w.id
        )
        select id, d, p from walk
    loop
        update public.locations
        set depth = r.d,
            path = r.p
        where id = r.id;
    end loop;
end $$;

-- 4. RLS ---------------------------------------------------------------------
alter table public.location_types enable row level security;

create policy if not exists "Public read location types"
    on public.location_types for select
    using (true);

create policy if not exists "Staff manage location types"
    on public.location_types for all
    using (public.is_staff()) with check (public.is_staff());

-- Locations RLS already exists; new columns inherit table policy.
