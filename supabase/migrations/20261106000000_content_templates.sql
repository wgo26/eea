-- ============================================================================
-- Migration: 20261106000000_content_templates.sql
-- Description: Stream B (B1/B4) — dynamic recap templates — plus the A5
-- weekly-recap archive key fix.
--
--   * content_templates — reusable recipes that compile the window's content
--     into a recap DRAFT (lib/content/templates-run.ts). One row per recipe:
--       - section/source_type: which brief section + content type to pull
--         (source_type null = everything publishing into the section).
--       - window_days: how far back the source query looks.
--       - cadence 'daily' compiles inside the 06:00 ops-digest run,
--         'weekly' inside the Monday weekly-digest run (before delivery).
--       - living: the template keeps ONE draft (content_items.template_id)
--         and re-compiles append-only — editor-deleted blocks are never
--         resurrected, editor-edited blocks are never overwritten (the
--         auto-fill "suggest, never assert" rule).
--       - pinned/featured source items lead the recap (same rank order as
--         the digest slots).
--   * content_items.template_id — lineage for living drafts; set null on
--     template delete (the draft stays, it just stops being managed).
--   * digest_issues unique key gains cadence (A5): a weekly recap and the
--     Monday daily issue share sent_on + locale; without this the weekly
--     upsert would clobber the daily archive row.
--   * Seed gallery (B4): five recipes, insert-if-absent, so a fresh DB gets
--     working templates without hand-config.
--
-- Idempotent (IF NOT EXISTS / IF EXISTS / DROP POLICY / CREATE OR REPLACE /
-- WHERE NOT EXISTS); safe to re-run. Applied migrations are immutable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. content_templates
-- ---------------------------------------------------------------------------
create table if not exists public.content_templates (
    id               uuid primary key default gen_random_uuid(),
    name             text not null,
    name_fr          text,
    slug_base        text not null unique,
    -- Brief section the recap groups by; also the default source type filter.
    section          text not null check (section in ('news', 'photo', 'notice', 'listing', 'culture')),
    -- Exact content_type filter (null = the section's default type set).
    source_type      text check (source_type in ('news', 'micro_story', 'photo_story', 'notice', 'listing', 'culture')),
    -- Optional source narrowing: {"location_slug": "douala", "tag_slug": "music"}.
    -- Either key may be absent; unknown slugs compile to an empty window
    -- rather than throwing, so a renamed location never breaks the job.
    source_filters   jsonb not null default '{}'::jsonb,
    window_days      integer not null default 7 check (window_days between 1 and 90),
    cadence          text not null default 'weekly' check (cadence in ('daily', 'weekly')),
    living           boolean not null default true,
    is_active        boolean not null default true,
    last_compiled_at timestamptz,
    last_added_count integer,
    created_by       uuid references public.profiles (id) on delete set null,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

alter table public.content_templates enable row level security;

drop policy if exists "Staff read content templates" on public.content_templates;
create policy "Staff read content templates"
    on public.content_templates for select
    using (public.is_staff());

drop policy if exists "Staff manage content templates" on public.content_templates;
create policy "Staff manage content templates"
    on public.content_templates for all
    using (public.is_staff()) with check (public.is_staff());

drop trigger if exists content_templates_touch on public.content_templates;
create trigger content_templates_touch before update on public.content_templates
    for each row execute function public.update_updated_at_column();

comment on table public.content_templates is
  'Recap recipes (Stream B): compile a window''s content into a living or one-shot draft item via lib/content/templates-run.ts.';

-- ---------------------------------------------------------------------------
-- 2. content_items lineage
-- ---------------------------------------------------------------------------
alter table public.content_items
    add column if not exists template_id uuid
    references public.content_templates (id) on delete set null;

create index if not exists content_items_template_idx
    on public.content_items (template_id)
    where template_id is not null;

-- ---------------------------------------------------------------------------
-- 3. digest_issues unique key + cadence (A5)
-- ---------------------------------------------------------------------------
alter table public.digest_issues
    add column if not exists cadence text not null default 'daily'
    check (cadence in ('daily', 'weekly'));

alter table public.digest_issues
    drop constraint if exists digest_issues_sent_on_locale_key;

alter table public.digest_issues
    add constraint digest_issues_sent_on_locale_cadence_key
    unique (sent_on, locale, cadence);

-- ---------------------------------------------------------------------------
-- 4. Seed gallery (B4) — insert-if-absent, safe on re-run
-- ---------------------------------------------------------------------------
insert into public.content_templates (name, name_fr, slug_base, section, source_type, window_days, cadence, living)
select s.* from (values
    ('This week in pictures',   'La semaine en images',        'this-week-in-pictures',  'photo',   'photo_story', 7::int, 'weekly'::text, true),
    ('Community stories recap', 'Rappel des histoires',        'community-recap',        'news',    'news',        7::int, 'weekly'::text, true),
    ('This week on the board',  "La semaine sur le tableau",   'board-weekly',           'notice',  'notice',      7::int, 'weekly'::text, true),
    ('Marketplace highlights',  'Annonces de la semaine',      'marketplace-weekly',     'listing', 'listing',     7::int, 'weekly'::text, true),
    ('Culture this week',       'La culture de la semaine',    'culture-this-week',      'culture', 'culture',     7::int, 'weekly'::text, true)
) as s(name, name_fr, slug_base, section, source_type, window_days, cadence, living)
where not exists (select 1 from public.content_templates ct where ct.slug_base = s.slug_base);
