-- ============================================================================
-- Migration: 20261111000000_system_hardening.sql
-- Description: System & Infrastructure hardening tables + audit hash chain.
--
--   * blocked_ips — chief-managed network blocks enforced at the app layer
--     (auth + public intake). Service-role only; no cookie-client policies,
--     so a SELECT without the service key sees nothing.
--   * audit_events.entry_hash / prev_hash — tamper-evident hash chain over
--     new rows (nullable: pre-chain history stays valid, chain starts at the
--     first chained row). Written by auditEvent()/recordAuthEvent().
--   * audit_archives — ledger for the monthly cold-archive cron (CSV bundles
--     in B2 `audit-archive/`, one row per bundle).
--
-- Idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS); safe to re-run.
-- ============================================================================

create table if not exists public.blocked_ips (
    ip           text primary key,
    reason       text,
    blocked_by   uuid references public.profiles (id) on delete set null,
    blocked_at   timestamptz not null default now(),
    expires_at   timestamptz,
    created_at   timestamptz not null default now()
);

alter table public.blocked_ips enable row level security;
-- No policies: service-role only (reads go through the app-layer cache).

alter table public.audit_events
    add column if not exists prev_hash text,
    add column if not exists entry_hash text;

create table if not exists public.audit_archives (
    id           uuid primary key default gen_random_uuid(),
    filename     text not null unique,
    sha256       text not null,
    size_bytes   bigint not null default 0,
    from_ts      timestamptz,
    to_ts        timestamptz,
    row_count    integer not null default 0,
    created_at   timestamptz not null default now()
);

alter table public.audit_archives enable row level security;
-- No policies: service-role only.
