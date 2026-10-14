-- Auth/profile privilege boundaries.
--
-- The initial schema granted table-wide profile reads and writes to the
-- browser roles. RLS protects rows, not individual columns: a user could
-- therefore read private profile fields from other public profiles and
-- attempt to write trust/status fields on their own row. Keep public/profile
-- reads and self-service edits column-scoped; privileged profile mutations
-- use the guarded server-side service-role actions.

revoke select on table public.profiles from anon, authenticated;
revoke select (email, phone) on table public.profiles from anon, authenticated;
grant select (
    id,
    display_name,
    avatar_url,
    bio,
    location_id,
    is_verified,
    is_public,
    created_at,
    contributor_handle,
    contributor_featured,
    contributor_bio_override
) on table public.profiles to anon, authenticated;

revoke update on table public.profiles from anon, authenticated;
grant update (
    display_name,
    full_name,
    bio,
    phone,
    avatar_url,
    location_id,
    is_public,
    preferred_locale,
    preferred_voice,
    contributor_handle
) on table public.profiles to authenticated;
revoke delete on table public.profiles from anon, authenticated;

-- Optional TOTP is only meaningful if a password-only aal1 token cannot use
-- the privileged RLS branches after bypassing the login redirect. Keep users
-- without a verified factor unaffected; users with one require aal2 in RLS.
create or replace function public.session_mfa_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
    select auth.uid() is not null
       and (
           auth.jwt() ->> 'aal' = 'aal2'
           or not exists (
               select 1
               from auth.mfa_factors
               where user_id = auth.uid()
                 and factor_type = 'totp'
                 and status = 'verified'
           )
       );
$$;
revoke all on function public.session_mfa_ok() from public;
grant execute on function public.session_mfa_ok() to anon, authenticated;

create or replace function public.is_staff()
returns boolean
language sql
security definer
set search_path = public
as $$
    select public.session_mfa_ok()
       and exists (
           select 1 from public.user_roles
           where user_id = auth.uid()
             and role in ('admin', 'editor')
       );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public
as $$
    select public.session_mfa_ok()
       and exists (
           select 1 from public.user_roles
           where user_id = auth.uid()
             and role = 'admin'
       );
$$;

create or replace function public.is_advertiser()
returns boolean
language sql
security definer
set search_path = public
as $$
    select public.session_mfa_ok()
       and exists (
           select 1 from public.user_roles
           where user_id = auth.uid()
             and role = 'advertiser'
       );
$$;

create or replace function public.has_role(user_id uuid, required_role text)
returns boolean
language sql
security definer
set search_path = public
as $$
    select $1 = auth.uid()
       and public.session_mfa_ok()
       and exists (
           select 1 from public.user_roles
           where user_roles.user_id = $1
             and user_roles.role::text = $2
       );
$$;

-- Role writes are allowed only through the RLS policy "Staff manage user
-- roles"; authenticated staff need SQL privileges for the guarded admin UI.
revoke all on table public.user_roles from anon;
grant select, insert, update, delete on table public.user_roles to authenticated;

-- Retire the legacy custom-email hook helper. Auth email delivery now uses
-- Supabase's built-in templates; any hosted Auth hooks pointing at this
-- helper must also be disabled in the Dashboard before rollout.
drop function if exists extensions.send_auth_email(text, uuid, text, text, text);
