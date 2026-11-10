-- ============================================================================
-- Eagle Eye Africa — Auth security fixes (Progressive lockout + digest RLS)
--
-- 1. digest_subscribers: add user_id column and replace the wide-open RLS
--    policy (using (true) with check (true)) with scoped policies:
--    • public can INSERT (newsletter signup without an account)
--    • authenticated users manage their own rows (user_id = auth.uid())
--    • staff can manage all rows
-- 2. login_attempts: durable per-email failed-login counter with temporary
--    lockout (5 failures → 15 min lock), used by signInWithPassword.
--
-- Idempotent; safe to re-run.
-- ============================================================================

-- 1. digest_subscribers -------------------------------------------------------
alter table public.digest_subscribers
    add column if not exists user_id uuid references public.profiles (id) on delete set null;

create index if not exists digest_subscribers_user_id_idx
    on public.digest_subscribers (user_id);

-- Backfill: link existing subscriber rows to profiles by email.
update public.digest_subscribers d
set user_id = p.id
from public.profiles p
where d.user_id is null
  and d.email is not null
  and p.email = d.email;

alter table public.digest_subscribers enable row level security;

drop policy if exists "Own digest subscription" on public.digest_subscribers;

-- Public can subscribe (insert only, no read/modify).
create policy if not exists "Public can subscribe to digest"
    on public.digest_subscribers for insert
    with check (true);

-- Authenticated users manage their own subscription rows.
create policy if not exists "Users manage own digest subscription"
    on public.digest_subscribers for all
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- Staff manage all digest subscriptions.
create policy if not exists "Staff manage digest subscriptions"
    on public.digest_subscribers for all
    using (public.is_staff())
    with check (public.is_staff());

-- 2. login_attempts -----------------------------------------------------------
create table if not exists public.login_attempts (
    email         citext primary key,
    failed_count  integer not null default 0,
    locked_until  timestamptz,
    last_attempt  timestamptz not null default now(),
    created_at    timestamptz not null default now()
);

alter table public.login_attempts enable row level security;

-- No public policies: only the sign-in server action (service-role or
-- guarded server client) reads/writes this table.
revoke all on public.login_attempts from anon, authenticated;

-- Function to check and record login attempts. Security definer so it can
-- write to the locked-down table.
create or replace function public.record_login_attempt(
    p_email citext,
    p_succeeded boolean
)
returns boolean  -- true when login is allowed to proceed
language plpgsql
security definer
set search_path = public
as $$
declare
    v_attempts record;
    v_now timestamptz := now();
    v_locked_until timestamptz;
    v_failed_count integer;
begin
    -- Fetch current state
    select * into v_attempts
    from public.login_attempts
    where email = p_email;

    -- If locked and lock hasn't expired, reject
    if found then
        v_locked_until := v_attempts.locked_until;
        if v_locked_until is not null and v_now < v_locked_until then
            return false; -- still locked
        end if;
        -- Lock expired: reset counter
        if v_locked_until is not null and v_now >= v_locked_until then
            v_failed_count := 0;
        else
            v_failed_count := v_attempts.failed_count;
        end if;
    else
        v_failed_count := 0;
    end if;

    if p_succeeded then
        -- Successful login: clear the record
        delete from public.login_attempts where email = p_email;
        return true;
    end if;

    -- Failed login: increment counter
    v_failed_count := v_failed_count + 1;

    if v_failed_count >= 5 then
        -- Lock for 15 minutes
        insert into public.login_attempts (email, failed_count, locked_until, last_attempt)
        values (p_email, v_failed_count, v_now + interval '15 minutes', v_now)
        on conflict (email)
        do update set
            failed_count = v_failed_count,
            locked_until = v_now + interval '15 minutes',
            last_attempt = v_now;
        return false; -- locked
    else
        insert into public.login_attempts (email, failed_count, locked_until, last_attempt)
        values (p_email, v_failed_count, null, v_now)
        on conflict (email)
        do update set
            failed_count = v_failed_count,
            locked_until = null,
            last_attempt = v_now;
        return true; -- still allowed to try
    end if;
end;
$$;

revoke all on function public.record_login_attempt(citext, boolean) from public, anon, authenticated;
grant execute on function public.record_login_attempt(citext, boolean) to service_role;

-- Check-only function: returns true when the email is NOT locked (allowed to try).
-- Does not modify any counters. Called before the Supabase password check.
create or replace function public.check_login_lock(p_email citext)
returns boolean  -- true when login is allowed (not locked)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_attempts record;
    v_now timestamptz := now();
begin
    select * into v_attempts
    from public.login_attempts
    where email = p_email;

    if not found then
        return true;
    end if;

    if v_attempts.locked_until is not null and v_now < v_attempts.locked_until then
        return false; -- still locked
    end if;

    -- Lock expired: reset counter
    if v_attempts.locked_until is not null and v_now >= v_attempts.locked_until then
        delete from public.login_attempts where email = p_email;
        return true;
    end if;

    return true; -- not locked, has failed attempts but under limit
end;
$$;

revoke all on function public.check_login_lock(citext) from public, anon, authenticated;
grant execute on function public.check_login_lock(citext) to service_role;
