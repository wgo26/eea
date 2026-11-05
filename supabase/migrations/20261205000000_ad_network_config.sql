-- Ad monetization: DB-backed remnant-network configuration + the missing
-- direct-sold slot rows for the index rails.
--
-- Why the config moves into the database: `NEXT_PUBLIC_AD_SLOTS` is inlined
-- into the client bundle at build time, so every change to a tag needed a full
-- rebuild and an operator who could edit env. The columns below let
-- /admin/ads own the same data (audited, per-slot, no deploy) while the env
-- JSON stays as a bootstrap/fallback for environments without a database.
--
-- Everything is idempotent: `add column if not exists`, guarded constraints and
-- `on conflict do nothing`, matching the repair-migration pattern this repo
-- already uses (see 20261001000002_ads_formats.sql).

-- ---------------------------------------------------------------------------
-- 1. Network columns on ad_slots
-- ---------------------------------------------------------------------------
alter table public.ad_slots
    add column if not exists network            text null,
    add column if not exists network_format      text null,
    add column if not exists network_kind        text null,
    add column if not exists network_url         text null,
    add column if not exists network_width       integer null,
    add column if not exists network_height      integer null,
    add column if not exists network_attributes  jsonb not null default '{}'::jsonb,
    add column if not exists network_active      boolean not null default true,
    add column if not exists adsense_client      text null,
    add column if not exists adsense_slot        text null,
    add column if not exists adsense_format      text null,
    add column if not exists adsense_layout      text null;

comment on column public.ad_slots.network is
    'Remnant provider label (monetag/propellerads/adsense/adsterra/custom). Null = no network tag for this slot.';
comment on column public.ad_slots.network_attributes is
    'data-* attributes copied onto the injected script. Only data-* keys are honoured by lib/ads/networks.ts.';

-- Closed vocabularies mirror AD_UNIT_FORMATS / AD_UNIT_KINDS in lib/ads/networks.ts.
do $$ begin
    alter table public.ad_slots
        add constraint ad_slots_network_format_valid
        check (network_format is null or network_format in
            ('banner', 'native', 'in-page-push', 'push', 'interstitial', 'vignette', 'popunder', 'smartlink', 'adsense'));
exception when duplicate_object then null; end $$;

do $$ begin
    alter table public.ad_slots
        add constraint ad_slots_network_kind_valid
        check (network_kind is null or network_kind in ('script', 'link', 'adsense'));
exception when duplicate_object then null; end $$;

-- Same https-only rule the renderer enforces: a stored javascript:/http: URL
-- must be impossible, not merely filtered at render time.
do $$ begin
    alter table public.ad_slots
        add constraint ad_slots_network_url_https
        check (network_url is null or network_url ~* '^https://[^[:space:]]+$');
exception when duplicate_object then null; end $$;

do $$ begin
    alter table public.ad_slots
        add constraint ad_slots_network_box_size
        check ((network_width is null or (network_width between 1 and 2000))
           and (network_height is null or (network_height between 50 and 1200)));
exception when duplicate_object then null; end $$;

do $$ begin
    alter table public.ad_slots
        add constraint ad_slots_adsense_pair
        check ((adsense_client is null) = (adsense_slot is null));
exception when duplicate_object then null; end $$;

-- A network tag without a URL is half-configured; reject it at the data layer
-- so /admin/ads can never persist a unit that renders an empty box.
do $$ begin
    alter table public.ad_slots
        add constraint ad_slots_network_requires_url
        check (network_kind is null or network_url is not null);
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 2. Global switches (one row)
-- ---------------------------------------------------------------------------
create table if not exists public.ad_network_settings (
    id                  boolean primary key default true,
    networks_enabled    boolean not null default true,
    consent_required    boolean not null default true,
    reserve_space       boolean not null default true,
    house_ads_enabled   boolean not null default true,
    updated_at          timestamptz not null default now(),
    constraint ad_network_settings_single_row check (id)
);

comment on table public.ad_network_settings is
    'Single-row global switches for remnant advertising. Written only by /admin/ads (manageAds capability); read by lib/queries/ad-networks.ts.';

insert into public.ad_network_settings (id)
values (true)
on conflict (id) do nothing;

alter table public.ad_network_settings enable row level security;

-- Staff reads use the service role; this policy is defense in depth, the same
-- shape as the other admin-only tables (anon has no access at all).
do $$ begin
    create policy "Staff read ad network settings"
        on public.ad_network_settings for select
        using (public.is_staff());
exception when duplicate_object then null; end $$;

do $$ begin
    create policy "Staff update ad network settings"
        on public.ad_network_settings for update
        using (public.is_staff())
        with check (public.is_staff());
exception when duplicate_object then null; end $$;

grant select, update on public.ad_network_settings to authenticated;
grant all on public.ad_network_settings to service_role;

-- ---------------------------------------------------------------------------
-- 3. The index-rail placements become real sellable slots
-- ---------------------------------------------------------------------------
-- These keys already render (AD_PLACEMENTS in lib/ads/networks.ts) but had no
-- ad_slots row, so a direct campaign could not target them. Product defaults,
-- not demo data: an empty slot renders nothing until staff book a campaign or
-- configure a network unit.
insert into public.ad_slots
    (slot_key, name, placement, dimensions, mobile_dimensions, allowed_formats, is_active)
values
    ('news-index-rail',        'News index rail',         'news',          '300x250', '320x100', '{image,sponsored}', true),
    ('photo-story-index-rail', 'Photo stories index rail','photo-stories', '300x250', '320x100', '{image,sponsored}', true),
    ('notices-index-rail',     'Notices index rail',      'notices',       '300x250', '320x100', '{image,sponsored}', true),
    ('notices-rail',           'Notice detail rail',      'notices',       '300x250', '320x100', '{image,sponsored}', true),
    ('culture-rail',           'Culture index rail',      'culture',       '300x250', '320x100', '{image,sponsored}', true),
    ('buy-sell-index-rail',    'Buy & Sell index rail',   'buy-sell',      '300x250', '320x100', '{image,sponsored}', true),
    ('contributor-rail',       'Contributor profile band','contributors',  '728x90',  '320x100', '{image,sponsored}', true)
on conflict (slot_key) do nothing;