-- Migration: 20260921000000_db_maintenance.sql
-- Description: Phase 4 — database hardening (audit §4.2 + §4.3):
--   1. Automated vacuum/analyze tuning for the high-churn rate_limit_hits
--      counter table (the limiter upserts one row per IP per window).
--   2. A service-role-only db_maintenance_report() RPC that deep-purges stale
--      rate-limit buckets, reports dead-tuple/autovacuum stats, and verifies
--      that the schema objects earlier migrations rely on actually exist.
--      Consumed by the CRON_SECRET-protected /api/cron/db-maintenance route.
--   3. Structural constraints on the public submissions intake (audit §4.3):
--      payload must be a JSON object with only the documented fields, every
--      field a bounded string, and guest contact fields sane — enforced at the
--      engine level so a forgotten app-layer check can never write garbage.
--
-- Why no explicit VACUUM: VACUUM/ANALYZE cannot run inside a function or
-- transaction block, so PostgREST RPCs can never issue them. The automated
-- mechanism on Supabase is autovacuum; part 1 tunes this table's per-relation
-- settings so autovacuum runs early and often, and the maintenance cron keeps
-- dead tuples near zero by deleting stale buckets outright.

-- ---------------------------------------------------------------------------
-- 1. Automated vacuum/analyze tuning for the rate-limit counter table
-- ---------------------------------------------------------------------------

-- HOT-friendly: `count` is updated in place per hit, so leave free page space;
-- lowered scale factors make autovacuum/analyze react to the constant churn
-- instead of waiting for the 20%/10% defaults to accumulate bloat.
alter table public.rate_limit_hits set (
    fillfactor = 80,
    autovacuum_vacuum_scale_factor = 0.05,
    autovacuum_vacuum_threshold = 500,
    autovacuum_analyze_scale_factor = 0.02,
    autovacuum_analyze_threshold = 500
);

-- ---------------------------------------------------------------------------
-- 2. Maintenance/verification RPC (Phase 4.2)
-- ---------------------------------------------------------------------------

create or replace function public.db_maintenance_report(
    p_purge_older_than_seconds integer default 86400
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_purged    integer := 0;
    v_stats     record;
    v_missing   text[] := '{}';
    v_migrations jsonb;
begin
    -- Deep purge of stale rate-limit buckets. The check_rate_limit RPC only
    -- opportunistically deletes rows older than 10x its (short) window; this
    -- is the nightly full sweep (default: anything older than 24 hours).
    with deleted as (
        delete from public.rate_limit_hits
        where window_start < now() - make_interval(
            secs => greatest(coalesce(p_purge_older_than_seconds, 86400), 3600))
        returning 1
    )
    select count(*)::int into v_purged from deleted;

    -- Dead-tuple / autovacuum telemetry for the ops log (no row when the
    -- table is missing — to_regclass returns null instead of raising).
    select n_live_tup, n_dead_tup, last_autovacuum, last_autoanalyze
      into v_stats
      from pg_stat_user_tables
     where relid = to_regclass('public.rate_limit_hits');

    -- Migration verification: confirm the objects earlier phases depend on.
    -- Functions are matched by name only (robust against signature drift).
    if to_regclass('public.rate_limit_hits') is null then
        v_missing := v_missing || 'table:rate_limit_hits';
    end if;
    if not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'check_rate_limit'
    ) then
        v_missing := v_missing || 'fn:check_rate_limit';
    end if;
    if not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'enforce_last_active_admin'
    ) then
        v_missing := v_missing || 'fn:enforce_last_active_admin';
    end if;
    if not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'try_acquire_backup_lease'
    ) then
        v_missing := v_missing || 'fn:try_acquire_backup_lease';
    end if;
    if not exists (
        select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public' and p.proname = 'enforce_submission_payload_shape'
    ) then
        v_missing := v_missing || 'fn:enforce_submission_payload_shape';
    end if;
    if to_regclass('public.public_profiles') is null then
        v_missing := v_missing || 'view:public_profiles';
    end if;
    if to_regclass('public.public_listings_safe') is null then
        v_missing := v_missing || 'view:public_listings_safe';
    end if;
    if not exists (
        select 1 from pg_trigger
        where tgrelid = to_regclass('public.user_roles')
          and tgname = 'user_roles_last_admin_guard' and not tgisinternal
    ) then
        v_missing := v_missing || 'trigger:user_roles_last_admin_guard';
    end if;
    if not exists (
        select 1 from pg_trigger
        where tgrelid = to_regclass('public.profiles')
          and tgname = 'profiles_last_admin_guard' and not tgisinternal
    ) then
        v_missing := v_missing || 'trigger:profiles_last_admin_guard';
    end if;
    if not exists (
        select 1 from pg_trigger
        where tgrelid = to_regclass('public.submissions')
          and tgname = 'submissions_payload_shape' and not tgisinternal
    ) then
        v_missing := v_missing || 'trigger:submissions_payload_shape';
    end if;

    -- Applied-migration trail kept by the Supabase CLI. Best-effort: hosted
    -- projects expose it, some setups do not.
    begin
        select jsonb_build_object(
                   'applied', count(*),
                   'latest', max(version),
                   'latestAppliedAt', max(applied_at)
               )
          into v_migrations
          from supabase_migrations.schema_migrations;
    exception when undefined_table or insufficient_privilege then
        v_migrations := jsonb_build_object('error', 'not readable from this role');
    end;

    return jsonb_build_object(
        'checkedAt', now(),
        'purgedRateLimitRows', v_purged,
        'rateLimitTable', jsonb_build_object(
            'liveTuples', v_stats.n_live_tup,
            'deadTuples', v_stats.n_dead_tup,
            'lastAutovacuum', v_stats.last_autovacuum,
            'lastAutoanalyze', v_stats.last_autoanalyze
        ),
        'missingObjects', to_jsonb(v_missing),
        'migrations', coalesce(v_migrations, jsonb_build_object('error', 'unknown'))
    );
end;
$$;

revoke all on function public.db_maintenance_report(integer)
    from public, anon, authenticated;
grant execute on function public.db_maintenance_report(integer)
    to service_role;

-- ---------------------------------------------------------------------------
-- 3. Structural constraints on public submissions (Phase 4.3)
-- ---------------------------------------------------------------------------

-- The payload column must hold a JSON object (never an array/scalar).
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'submissions_payload_object_check'
          and conrelid = 'public.submissions'::regclass
    ) then
        alter table public.submissions
            add constraint submissions_payload_object_check
            check (payload is null or jsonb_typeof(payload) = 'object');
    end if;
end $$;

-- Guest contact sanity (mirrors the app-layer validation in
-- lib/public/actions.ts). NOT VALID so legacy rows can never fail the
-- migration; every NEW write is fully validated from now on.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'submissions_guest_name_len_check'
          and conrelid = 'public.submissions'::regclass
    ) then
        alter table public.submissions
            add constraint submissions_guest_name_len_check
            check (guest_name is null or char_length(guest_name) <= 160) not valid;
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'submissions_guest_phone_len_check'
          and conrelid = 'public.submissions'::regclass
    ) then
        alter table public.submissions
            add constraint submissions_guest_phone_len_check
            check (guest_phone is null or char_length(guest_phone) <= 32) not valid;
    end if;

    if not exists (
        select 1 from pg_constraint
        where conname = 'submissions_guest_email_format_check'
          and conrelid = 'public.submissions'::regclass
    ) then
        alter table public.submissions
            add constraint submissions_guest_email_format_check
            check (guest_email is null or guest_email ~*
                   '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') not valid;
    end if;
end $$;

-- Payload shape trigger: the engine-level mirror of PAYLOAD_FIELDS in
-- lib/public/actions.ts. Fires for EVERY writer (service_role included —
-- unlike RLS, triggers are not bypassed by the service-role client), closing
-- the audit's "unconstrained service-role writes" gap for the public intake.
create or replace function public.enforce_submission_payload_shape()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    v_allowed text[] := array[
        'headline', 'description', 'what', 'location', 'date', 'photos',
        'noticeType', 'organization', 'expiry', 'item', 'category', 'price',
        'currency', 'doc', 'message', 'contributorName', 'email', 'phone'
    ];
    v_keys    integer;
    v_key     text;
    v_value   jsonb;
    v_text    text;
begin
    if new.payload is null or jsonb_typeof(new.payload) <> 'object' then
        raise exception 'submissions.payload must be a JSON object';
    end if;

    select count(*) into v_keys from jsonb_object_keys(new.payload) as keys(k);
    if v_keys = 0 then
        raise exception 'submissions.payload must not be empty';
    end if;
    if v_keys > 30 then
        raise exception 'submissions.payload has too many fields (max 30)';
    end if;

    for v_key, v_value in
        select key, value from jsonb_each(new.payload)
    loop
        if not (v_key = any (v_allowed)) then
            raise exception 'submissions.payload contains unknown field "%"', v_key;
        end if;
        -- The intake layer stores every field as a string (photos is a
        -- newline-separated URL list, also one string).
        if jsonb_typeof(v_value) <> 'string' then
            raise exception 'submissions.payload."%" must be a string', v_key;
        end if;
        v_text := v_value #>> '{}';
        if v_key = 'photos' then
            if char_length(v_text) > 8000 then
                raise exception 'submissions.payload.photos exceeds 8000 characters';
            end if;
        elsif char_length(v_text) > 4000 then
            raise exception 'submissions.payload."%" exceeds 4000 characters', v_key;
        end if;
    end loop;

    return new;
end;
$$;

-- Trigger functions are invoked regardless of EXECUTE privileges, so the
-- grants stay closed: no role can call the validator directly.
revoke all on function public.enforce_submission_payload_shape()
    from public, anon, authenticated;

drop trigger if exists submissions_payload_shape on public.submissions;
create trigger submissions_payload_shape
    before insert or update of payload
    on public.submissions
    for each row execute function public.enforce_submission_payload_shape();
