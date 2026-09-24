-- ============================================================================
-- Migration: 20261027000000_admin_audit_infrastructure.sql
-- Description: Admin foundation schema (plan Phase 1.1) — the operational
--              data model the admin dashboard is built on.
--
--   * audit_events          (spec §19) — immutable operational audit trail.
--     moderation_log stays the content-moderation pipeline record; system
--     level events (secrets, branding, incidents, configuration, permissions)
--     land here with a resource_type/resource_id pair so non-content entities
--     are addressable without stuffing ids into `notes`.
--   * system_states         (spec §27) — contextual states as configuration:
--     precedence + visual/behavior/accessibility profiles live as data so a
--     new state is a row, not a code branch. Seeded with the spec §20 ladder.
--   * system_state_events   (spec §27) — activation/deactivation history with
--     actor, reason and the state that was displaced.
--   * incidents             (spec §39) — severity, owner, internal notes and
--     the public status message kept as separate fields (spec §40 boundary).
--   * incident_events       (spec §39) — every status transition.
--   * brand_themes          (spec §9)  — draft → review → approved → published
--     → archived, with preview_token for safe preview (spec §46).
--   * brand_theme_versions  (spec §9)  — immutable token snapshots for rollback.
--   * api_credentials       (spec §12) — metadata only in readable columns;
--     the secret itself is AES-256-GCM ciphertext (secret_encrypted) and is
--     never selected by the admin query layer.
--   * credential_events     (spec §14/§55) — create/rotate/revoke/disable/
--     enable history; never stores the secret value.
--
-- RLS: every table is staff/admin read via policies and service-role write
-- (no insert/update/delete policies — nothing but the server reaches these
-- tables). Secrets are admin-only. Anonymous access is impossible.
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS); safe to re-run.
-- Rules: applied migrations are immutable — repairs always append new files.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
    create type public.severity_level as enum ('normal', 'info', 'warning', 'critical');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.incident_status as enum
        ('investigating', 'identified', 'mitigating', 'monitoring', 'resolved');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.theme_status as enum
        ('draft', 'review', 'approved', 'published', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
    create type public.credential_status as enum
        ('active', 'disabled', 'expired', 'revoked');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- audit_events (spec §19)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_events (
    id            uuid primary key default gen_random_uuid(),
    actor_id      uuid references public.profiles (id) on delete set null,
    actor_role    text,
    action        text not null,
    resource_type text not null,
    resource_id   text,
    created_at    timestamptz not null default now(),
    request_id    text,
    source        text not null default 'admin_dashboard',
    metadata      jsonb not null default '{}'::jsonb
);

create index if not exists audit_events_created_idx on public.audit_events (created_at desc);
create index if not exists audit_events_action_idx on public.audit_events (action);
create index if not exists audit_events_actor_idx on public.audit_events (actor_id);
create index if not exists audit_events_resource_idx on public.audit_events (resource_type, resource_id);

alter table public.audit_events enable row level security;

drop policy if exists "Admins read audit events" on public.audit_events;
create policy "Admins read audit events"
    on public.audit_events for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- system_states (spec §27) + history (spec §27)
-- ---------------------------------------------------------------------------
create table if not exists public.system_states (
    id                    text primary key,
    name                  text not null,
    severity              public.severity_level not null default 'normal',
    active                boolean not null default false,
    precedence            integer not null default 0,
    visual_profile        text not null default 'default',
    affected_modules      text[] not null default '{}',
    behavior_profile      jsonb not null default '{}'::jsonb,
    accessibility_profile text not null default 'default',
    activated_at          timestamptz,
    activated_by          uuid references public.profiles (id) on delete set null,
    expires_at            timestamptz,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

create index if not exists system_states_active_idx on public.system_states (active);

alter table public.system_states enable row level security;

drop policy if exists "Staff read system states" on public.system_states;
create policy "Staff read system states"
    on public.system_states for select using (public.is_staff());

create table if not exists public.system_state_events (
    id                uuid primary key default gen_random_uuid(),
    state_id          text not null references public.system_states (id) on delete cascade,
    action            text not null,
    previous_state_id text,
    reason            text,
    actor_id          uuid references public.profiles (id) on delete set null,
    created_at        timestamptz not null default now()
);

create index if not exists system_state_events_state_idx
    on public.system_state_events (state_id, created_at desc);

alter table public.system_state_events enable row level security;

drop policy if exists "Staff read system state events" on public.system_state_events;
create policy "Staff read system state events"
    on public.system_state_events for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- incidents (spec §39) + incident_events (spec §39)
-- ---------------------------------------------------------------------------
create table if not exists public.incidents (
    id                    uuid primary key default gen_random_uuid(),
    title                 text not null,
    severity              public.severity_level not null default 'warning',
    description           text,
    affected_services     text[] not null default '{}',
    start_time            timestamptz not null default now(),
    current_status        public.incident_status not null default 'investigating',
    incident_owner        text,
    internal_notes        text,
    public_status_message text,
    timeline              jsonb not null default '[]'::jsonb,
    resolution_notes      text,
    resolved_at           timestamptz,
    created_by            uuid references public.profiles (id) on delete set null,
    created_at            timestamptz not null default now(),
    updated_at            timestamptz not null default now()
);

create index if not exists incidents_status_idx on public.incidents (current_status, created_at desc);

alter table public.incidents enable row level security;

drop policy if exists "Staff read incidents" on public.incidents;
create policy "Staff read incidents"
    on public.incidents for select using (public.is_staff());

create table if not exists public.incident_events (
    id          uuid primary key default gen_random_uuid(),
    incident_id uuid not null references public.incidents (id) on delete cascade,
    from_status public.incident_status,
    to_status   public.incident_status,
    note        text,
    actor_id    uuid references public.profiles (id) on delete set null,
    created_at  timestamptz not null default now()
);

create index if not exists incident_events_incident_idx
    on public.incident_events (incident_id, created_at desc);

alter table public.incident_events enable row level security;

drop policy if exists "Staff read incident events" on public.incident_events;
create policy "Staff read incident events"
    on public.incident_events for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- brand_themes (spec §9) + brand_theme_versions (spec §9)
-- ---------------------------------------------------------------------------
create table if not exists public.brand_themes (
    id            uuid primary key default gen_random_uuid(),
    name          text not null,
    version       text not null default '1.0',
    tokens        jsonb not null default '{}'::jsonb,
    status        public.theme_status not null default 'draft',
    created_by    uuid references public.profiles (id) on delete set null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    approved_by   uuid references public.profiles (id) on delete set null,
    approved_at   timestamptz,
    preview_token text unique,
    unique (name, version)
);

alter table public.brand_themes enable row level security;

drop policy if exists "Staff read brand themes" on public.brand_themes;
create policy "Staff read brand themes"
    on public.brand_themes for select using (public.is_staff());

create table if not exists public.brand_theme_versions (
    id             uuid primary key default gen_random_uuid(),
    theme_id       uuid not null references public.brand_themes (id) on delete cascade,
    version        text not null,
    tokens         jsonb not null default '{}'::jsonb,
    change_summary text,
    created_by     uuid references public.profiles (id) on delete set null,
    created_at     timestamptz not null default now(),
    unique (theme_id, version)
);

alter table public.brand_theme_versions enable row level security;

drop policy if exists "Staff read brand theme versions" on public.brand_theme_versions;
create policy "Staff read brand theme versions"
    on public.brand_theme_versions for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- api_credentials (spec §12) + credential_events (spec §14, §55)
-- ---------------------------------------------------------------------------
create table if not exists public.api_credentials (
    id               uuid primary key default gen_random_uuid(),
    name             text not null,
    provider         text not null,
    status           public.credential_status not null default 'active',
    secret_encrypted text not null,
    created_by       uuid references public.profiles (id) on delete set null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now(),
    last_used_at     timestamptz,
    expires_at       timestamptz,
    rotation_policy  jsonb not null default '{}'::jsonb,
    metadata         jsonb not null default '{}'::jsonb
);

create index if not exists api_credentials_status_idx on public.api_credentials (status);

alter table public.api_credentials enable row level security;

-- Admin-only: credential metadata is security-sensitive even without the
-- plaintext. Server code reads it through the service-role client, so this
-- policy is the defense-in-depth backstop, not the access path.
drop policy if exists "Admins read api credentials" on public.api_credentials;
create policy "Admins read api credentials"
    on public.api_credentials for select using (public.is_admin());

create table if not exists public.credential_events (
    id            uuid primary key default gen_random_uuid(),
    credential_id uuid not null references public.api_credentials (id) on delete cascade,
    action        text not null,
    actor_id      uuid references public.profiles (id) on delete set null,
    created_at    timestamptz not null default now(),
    request_id    text,
    source        text not null default 'admin_dashboard'
);

create index if not exists credential_events_credential_idx
    on public.credential_events (credential_id, created_at desc);

alter table public.credential_events enable row level security;

drop policy if exists "Admins read credential events" on public.credential_events;
create policy "Admins read credential events"
    on public.credential_events for select using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Seed the spec §20 state ladder (idempotent). Precedence is data (spec §27:
-- states are configuration, not hard-coded branches) — a critical
-- operational state must outrank cosmetic seasonal ones (spec §29).
-- ---------------------------------------------------------------------------
insert into public.system_states (id, name, severity, active, precedence, visual_profile, affected_modules, behavior_profile, accessibility_profile)
values
    ('NORMAL',        'Normal Operations',  'normal',   true,  0,
     'default',      '{}',
     '{"navigation":"standard","notifications":"standard","contentPriority":"editorial","motion":"full"}', 'standard'),
    ('SEASONAL',      'Seasonal Campaign',  'info',     false, 10,
     'seasonal',     '{home,news,culture}',
     '{"navigation":"standard","notifications":"campaign","contentPriority":"campaign","motion":"full"}', 'standard'),
    ('HIGH_ACTIVITY', 'High Activity',      'info',     false, 20,
     'high-activity','{home,listings,notices}',
     '{"navigation":"standard","notifications":"elevated","contentPriority":"recency","motion":"reduced"}', 'standard'),
    ('MAINTENANCE',   'Scheduled Maintenance', 'warning', false, 30,
     'maintenance',  '{submissions,listings}',
     '{"navigation":"reduced","notifications":"maintenance","contentPriority":"editorial","motion":"reduced"}', 'standard'),
    ('DEGRADED',      'Degraded Service',   'warning',  false, 40,
     'degraded',     '{submissions,media,listings}',
     '{"navigation":"standard","notifications":"elevated","contentPriority":"editorial","motion":"reduced"}', 'high-contrast'),
    ('RECOVERY',      'Recovering',         'info',     false, 45,
     'recovery',     '{submissions,media}',
     '{"navigation":"standard","notifications":"elevated","contentPriority":"editorial","motion":"reduced"}', 'standard'),
    ('INCIDENT',      'Active Incident',    'warning',  false, 50,
     'incident',     '{}',
     '{"navigation":"standard","notifications":"incident","contentPriority":"operational","motion":"reduced"}', 'high-contrast'),
    ('CRITICAL',      'Critical Platform State', 'critical', false, 60,
     'critical',     '{}',
     '{"navigation":"reduced","notifications":"critical","contentPriority":"operational","motion":"minimal"}', 'high-contrast')
on conflict (id) do nothing;
