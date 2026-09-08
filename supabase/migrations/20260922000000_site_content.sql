-- ============================================================================
-- Eagle Eye Africa — Site content: advertise-page overrides + footer links
--
-- Completes the "maintained from the admin command center" story for the two
-- remaining developer-edited surfaces:
--
--   1. /advertise copy (hero title/tagline/intro + the placements/audience/
--      pricing cards) — optional per-locale overrides with dictionary
--      fallback, same shape and fallback semantics as about_sections.
--      Empty table = built-in dictionary text renders, never a blank.
--   2. Footer social links (Facebook/YouTube) — a tiny key-value table so
--      staff can point the footer icons at the real brand pages (or clear a
--      value to hide the icon) without a code deploy. Values are public,
--      non-secret config only.
--
-- Managed at /admin/site-content behind the `manageSiteContent` capability
-- (admin + editor); Server Functions run on the RLS-bound session client
-- (defense in depth: page guard → action check → RLS).
--
-- Run in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to run twice (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. advertise_sections: admin-editable overrides for the /advertise page
-- ---------------------------------------------------------------------------
create table if not exists public.advertise_sections (
    id            uuid primary key default gen_random_uuid(),
    section_key   text not null,
    locale        text not null default 'en',
    heading       text,
    body          text,
    is_active     boolean not null default true,
    updated_at    timestamptz not null default now(),
    unique (section_key, locale)
);

alter table public.advertise_sections enable row level security;

drop policy if exists "Active advertise sections are readable by everyone" on public.advertise_sections;
create policy "Active advertise sections are readable by everyone"
    on public.advertise_sections for select using (is_active = true);

drop policy if exists "Staff manage advertise sections" on public.advertise_sections;
create policy "Staff manage advertise sections"
    on public.advertise_sections for all
    using (public.is_staff()) with check (public.is_staff());

grant usage on schema public to anon, authenticated;
grant select on public.advertise_sections to anon, authenticated;
grant select, insert, update, delete on public.advertise_sections to authenticated;

-- ---------------------------------------------------------------------------
-- 2. site_settings: public, non-secret key-value config (footer social URLs)
-- ---------------------------------------------------------------------------
create table if not exists public.site_settings (
    key         text primary key,
    value       text,
    updated_by  uuid,
    updated_at  timestamptz not null default now()
);

alter table public.site_settings enable row level security;

drop policy if exists "Site settings are readable by everyone" on public.site_settings;
create policy "Site settings are readable by everyone"
    on public.site_settings for select using (true);

drop policy if exists "Staff manage site settings" on public.site_settings;
create policy "Staff manage site settings"
    on public.site_settings for all
    using (public.is_staff()) with check (public.is_staff());

grant select on public.site_settings to anon, authenticated;
grant select, insert, update, delete on public.site_settings to authenticated;
