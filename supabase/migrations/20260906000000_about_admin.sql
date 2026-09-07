-- ============================================================================
-- Eagle Eye Africa — About page copy management + legal inbox support
--
-- The /about index (hero, section headers, closing) lives in the i18n
-- dictionaries; this table holds optional per-locale admin overrides so the
-- editorial team can maintain the page without a code deploy. Empty table =
-- dictionary defaults render (safe fallback).
--
-- Also wires the grants/RLS the legal inbox needs: staff resolve copyright
-- reports and data requests from /admin/policies?tab=inbox via the RLS-bound
-- session client (page guard → action check → RLS).
--
-- Run in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to run twice (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. about_sections: admin-editable overrides for the /about index
-- ---------------------------------------------------------------------------
create table if not exists public.about_sections (
    id            uuid primary key default gen_random_uuid(),
    section_key   text not null,
    locale        text not null default 'en',
    heading       text,
    body          text,
    cta_label     text,
    cta_href      text,
    is_active     boolean not null default true,
    updated_at    timestamptz not null default now(),
    unique (section_key, locale)
);

alter table public.about_sections enable row level security;

drop policy if exists "Active about sections are readable by everyone" on public.about_sections;
create policy "Active about sections are readable by everyone"
    on public.about_sections for select using (is_active = true);

drop policy if exists "Staff manage about sections" on public.about_sections;
create policy "Staff manage about sections"
    on public.about_sections for all
    using (public.is_staff()) with check (public.is_staff());

grant usage on schema public to anon, authenticated;
grant select on public.about_sections to anon, authenticated;
grant select, insert, update, delete on public.about_sections to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Legal inbox: staff resolve paths (policies mirror the existing
-- "Staff manage reports/corrections" pattern; data_requests already has
-- "Staff manage data requests" for update)
-- ---------------------------------------------------------------------------
drop policy if exists "Staff manage reports" on public.reports;
create policy "Staff manage reports"
    on public.reports for update using (public.is_staff()) with check (public.is_staff());

grant update on public.reports to authenticated;
grant update on public.data_requests to authenticated;
