-- Repair: drop obsolete `auth_user_changes` hook that references the removed
-- `auth.users.confirmation_url` column.
--
-- Symptom on live: `POST /auth/v1/admin/generate_link` (recovery) 500s with
-- "Database error granting user". Any trigger on auth.users whose function
-- reads NEW.confirmation_url / OLD.confirmation_url fails because that
-- column no longer exists in hosted Supabase Auth.
--
-- Project direction (20261203120000_auth_security_hardening.sql): Auth email
-- delivery uses Supabase built-in templates; the custom
-- extensions.send_auth_email helper was retired. This hook is the same
-- retired drift, so it is removed — NOT rewritten. The signup trigger
-- `on_auth_user_created` (public.handle_new_user) is untouched.
--
-- Idempotent: safe to replay. Run in SQL Editor or via `supabase db push`.

-- 1. Drop any trigger on auth.users that calls a function named
--    auth_user_changes (any schema), without needing to know the trigger name.
do $$
declare r record;
begin
  for r in
    select tg.tgname as trigger_name
    from pg_trigger tg
    join pg_class c on c.oid = tg.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = tg.tgfoid
    where n.nspname = 'auth'
      and c.relname = 'users'
      and not tg.tgisinternal
      and p.proname = 'auth_user_changes'
  loop
    execute format('drop trigger if exists %I on auth.users', r.trigger_name);
  end loop;
end $$;

-- 2. Drop the obsolete function itself wherever it lives. Trigger functions
--    take no args; cover public/extensions in case it was recreated elsewhere.
drop function if exists public.auth_user_changes() cascade;
drop function if exists extensions.auth_user_changes() cascade;
