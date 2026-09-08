-- Abuse hardening (pre-production gate):
-- 1. A durable fixed-window rate limiter (Postgres-backed, multi-instance
--    safe) used by every public server action and the upload route.
-- 2. Last-active-admin enforcement at the database layer — mirrors the
--    app-level checks in lib/admin/actions.ts so a direct SQL write through a
--    leaked anon/authenticated grant or a future code path cannot leave the
--    deployment without an active administrator.

-- ---------------------------------------------------------------------------
-- 1. Rate limiting
-- ---------------------------------------------------------------------------

create table if not exists public.rate_limit_hits (
    key          text        not null,
    window_start timestamptz not null,
    count        integer     not null default 0,
    primary key (key, window_start)
);

alter table public.rate_limit_hits enable row level security;

-- No policies: the table is only reachable through the security-definer
-- function below (service-role server code). Explicitly revoke direct access.
revoke all on public.rate_limit_hits from anon, authenticated;

create or replace function public.check_rate_limit(
    p_key            text,
    p_max            integer,
    p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_window_start timestamptz;
    v_count        integer;
begin
    -- Defensive defaults: invalid input never locks anyone out.
    if p_key is null or p_key = '' or p_max is null or p_max < 1
       or p_window_seconds is null or p_window_seconds < 1 then
        return true;
    end if;

    v_window_start := to_timestamp(
        floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
    );

    insert into public.rate_limit_hits (key, window_start, count)
    values (p_key, v_window_start, 1)
    on conflict (key, window_start)
    do update set count = public.rate_limit_hits.count + 1;

    select count into v_count
    from public.rate_limit_hits
    where key = p_key and window_start = v_window_start;

    -- Opportunistic garbage collection of stale buckets (~10% of calls).
    if random() < 0.1 then
        delete from public.rate_limit_hits
        where window_start < now() - make_interval(secs => p_window_seconds * 10);
    end if;

    return v_count <= p_max;
end;
$$;

revoke all on function public.check_rate_limit(text, integer, integer)
    from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer)
    to service_role;

-- ---------------------------------------------------------------------------
-- 2. Last-active-admin enforcement (database layer)
-- ---------------------------------------------------------------------------

create or replace function public.enforce_last_active_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_user    uuid;
    v_removed boolean := false;
    v_admins  integer;
begin
    if TG_TABLE_NAME = 'user_roles' then
        if TG_OP = 'DELETE' then
            v_user    := old.user_id;
            v_removed := old.role = 'admin';
        else
            v_user    := new.user_id;
            v_removed := old.role = 'admin' and new.role <> 'admin';
        end if;
    elsif TG_TABLE_NAME = 'profiles' then
        if TG_OP = 'DELETE' then
            v_user    := old.id;
            v_removed := true;
        else
            v_user    := new.id;
            v_removed := (new.is_suspended or new.is_banned)
                         and not (coalesce(old.is_suspended, false)
                                  or coalesce(old.is_banned, false));
        end if;
    end if;

    -- Only guard changes that would deactivate an administrator.
    if not v_removed
       or v_user is null
       or not exists (
            select 1 from public.user_roles
            where user_roles.user_id = v_user and user_roles.role = 'admin'
       ) then
        if TG_OP = 'DELETE' then return old; else return new; end if;
    end if;

    select count(distinct ur.user_id) into v_admins
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    where ur.role = 'admin'
      and ur.user_id <> v_user
      and not coalesce(p.is_suspended, false)
      and not coalesce(p.is_banned, false);

    if v_admins < 1 then
        raise exception 'Cannot remove, suspend or ban the last active administrator';
    end if;

    if TG_OP = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists user_roles_last_admin_guard on public.user_roles;
create trigger user_roles_last_admin_guard
    before update of role or delete on public.user_roles
    for each row execute function public.enforce_last_active_admin();

drop trigger if exists profiles_last_admin_guard on public.profiles;
create trigger profiles_last_admin_guard
    before update of is_suspended, is_banned or delete on public.profiles
    for each row execute function public.enforce_last_active_admin();