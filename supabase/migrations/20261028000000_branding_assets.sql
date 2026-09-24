-- ============================================================================
-- Migration: 20261028000000_branding_assets.sql
-- Description: Branding assets + publication state (plan Phase 3.1, spec §9/§10).
--
--   * brand_themes.is_active — exactly one theme is the published one. The
--     activation flag is a column (not just `status = 'published'`) so the
--     partial unique index can guarantee "one live theme" at the data layer,
--     and so archiving the previous theme cannot leave the site themeless.
--   * brand_assets           — the asset library (logo/wordmark/icon/
--     illustration) with dimensions, format, version, owner and usage
--     restrictions (spec §10 "missing asset" + reuse governance).
--   * brand_asset_usage      — which theme/state consumes which asset, so a
--     replace can report every affected surface and an archive can refuse to
--     orphan a live theme.
--   * system_state_themes    — contextual state → theme binding (spec §20/§27):
--     a seasonal or critical state may carry its own palette without changing
--     the published base theme.
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS); safe to re-run.
-- Rules: applied migrations are immutable — repairs always append new files.
-- ============================================================================

-- Exactly one published theme. The partial unique index makes the invariant
-- structural: publishing a second theme must first deactivate the incumbent
-- (lib/admin/actions/themes.ts does both inside one transaction-like flow).
alter table public.brand_themes
    add column if not exists is_active boolean not null default false;

create unique index if not exists brand_themes_active_idx
    on public.brand_themes (is_active) where is_active;

-- ---------------------------------------------------------------------------
-- brand_assets (spec §9/§10)
-- ---------------------------------------------------------------------------
do $$ begin
    create type public.brand_asset_type as enum
        ('logo', 'wordmark', 'icon', 'illustration');
exception when duplicate_object then null; end $$;

create table if not exists public.brand_assets (
    id                 uuid primary key default gen_random_uuid(),
    name               text not null,
    type               public.brand_asset_type not null default 'logo',
    file_url           text not null,
    -- Storage coordinates so replacing/archiving can delete the old object
    -- (nullable: an asset may have been imported as an external https URL).
    provider           text not null default 'r2',
    storage_key        text,
    dimensions         jsonb not null default '{}'::jsonb,
    format             text,
    size_bytes         bigint,
    version            integer not null default 1,
    owner_id           uuid references public.profiles (id) on delete set null,
    usage_restrictions text,
    is_active          boolean not null default true,
    replaced_by_id     uuid references public.brand_assets (id) on delete set null,
    created_at         timestamptz not null default now(),
    updated_at         timestamptz not null default now()
);

create index if not exists brand_assets_type_idx on public.brand_assets (type, is_active);
create index if not exists brand_assets_owner_idx on public.brand_assets (owner_id);

alter table public.brand_assets enable row level security;

drop policy if exists "Staff read brand assets" on public.brand_assets;
create policy "Staff read brand assets"
    on public.brand_assets for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- brand_asset_usage — asset ↔ theme binding (spec §9)
-- ---------------------------------------------------------------------------
create table if not exists public.brand_asset_usage (
    id         uuid primary key default gen_random_uuid(),
    asset_id   uuid not null references public.brand_assets (id) on delete cascade,
    theme_id   uuid not null references public.brand_themes (id) on delete cascade,
    -- Token path the asset fills, e.g. `imagery.logoUrl` (spec §10).
    role       text not null default 'logo',
    created_at timestamptz not null default now(),
    unique (asset_id, theme_id, role)
);

create index if not exists brand_asset_usage_theme_idx on public.brand_asset_usage (theme_id);

alter table public.brand_asset_usage enable row level security;

drop policy if exists "Staff read brand asset usage" on public.brand_asset_usage;
create policy "Staff read brand asset usage"
    on public.brand_asset_usage for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- system_state_themes — contextual state → theme binding (spec §20/§27)
-- ---------------------------------------------------------------------------
create table if not exists public.system_state_themes (
    state_id   text primary key references public.system_states (id) on delete cascade,
    theme_id   uuid not null references public.brand_themes (id) on delete cascade,
    created_at timestamptz not null default now(),
    created_by uuid references public.profiles (id) on delete set null
);

create index if not exists system_state_themes_theme_idx on public.system_state_themes (theme_id);

alter table public.system_state_themes enable row level security;

drop policy if exists "Staff read system state themes" on public.system_state_themes;
create policy "Staff read system state themes"
    on public.system_state_themes for select using (public.is_staff());
