-- ============================================================================
-- RLS harness stubs — Supabase-managed scaffolding for an EPHEMERAL Postgres.
-- ============================================================================
-- `scripts/rls-harness.mjs` applies this file, then every migration in
-- supabase/migrations, to a throwaway database so the behavioral invariant
-- suites (tests/integration/rls*.test.ts) can run against the REAL policy
-- definitions (audit W3/D3 — the RLS layer previously had zero automated
-- coverage).
--
-- Everything here recreates scaffolding that hosted Supabase itself provides;
-- nothing weakens the security posture being tested:
--   1. the three Supabase roles (anon / authenticated / service_role);
--   2. the auth schema (users + uid()/role()/jwt() helpers);
--   3. the storage schema buckets/objects (touched by 20260907000000);
--   4. a no-op cron schema (migrations guard their pg_cron calls with
--      exception handlers — the stub just makes `perform cron.schedule(...)`
--      succeed harmlessly on vanilla Postgres);
--   5. hosted-Supabase DEFAULT privileges: on a hosted project every new
--      table/function in public is granted to anon/authenticated/service_role
--      and RLS is the actual gate. Reproducing those grants is REQUIRED —
--      without them vanilla Postgres denies by privilege where production
--      denies by policy, which would mask real RLS regressions. The harness
--      additionally asserts EVERY public table has RLS enabled, which is what
--      makes the default grants safe.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists unaccent;

-- 1. Supabase roles -----------------------------------------------------------
do $$ begin
    if not exists (select from pg_roles where rolname = 'anon') then
        create role anon nologin noinherit;
    end if;
    if not exists (select from pg_roles where rolname = 'authenticated') then
        create role authenticated nologin noinherit;
    end if;
    if not exists (select from pg_roles where rolname = 'service_role') then
        create role service_role nologin noinherit bypassrls;
    end if;
end $$;

-- 2. auth schema stub ---------------------------------------------------------
create schema if not exists auth;
create table if not exists auth.users (
    id                 uuid primary key default gen_random_uuid(),
    email              text unique,
    raw_user_meta_data jsonb not null default '{}'::jsonb
);

create or replace function auth.uid() returns uuid
language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create or replace function auth.role() returns text
language sql stable as $$
    select nullif(current_setting('request.jwt.claim.role', true), '')
$$;

create or replace function auth.jwt() returns jsonb
language sql stable as $$
    select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb)
$$;

-- 3. storage schema stub (what 20260907000000_admin_asset_storage.sql touches)
create schema if not exists storage;
grant usage on schema storage to anon, authenticated;
create table if not exists storage.buckets (
    id                 text primary key,
    name               text,
    public             boolean default false,
    file_size_limit    bigint,
    allowed_mime_types text[]
);
create table if not exists storage.objects (
    id         uuid primary key default gen_random_uuid(),
    bucket_id  text,
    name       text,
    owner      uuid,
    owner_id   text,
    metadata   jsonb,
    created_at timestamptz default now()
);

-- 4. no-op cron schema --------------------------------------------------------
create schema if not exists cron;
create or replace function cron.schedule(p_job_name text, p_schedule text, p_command text)
    returns bigint language plpgsql as $$ begin return null; end $$;
create or replace function cron.unschedule(p_job_name text)
    returns boolean language plpgsql as $$ begin return true; end $$;

-- 5. hosted-Supabase default privileges ---------------------------------------
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public
    grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
    grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public
    grant usage, select on sequences to anon, authenticated, service_role;
alter default privileges in schema storage
    grant all on tables to anon, authenticated, service_role;
