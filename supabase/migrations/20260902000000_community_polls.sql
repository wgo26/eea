-- ============================================================================
-- Eagle Eye Africa — Community Polls
-- Adds the polls feature used on the Community News page.
--
-- Run this in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to run twice (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table if not exists public.polls (
    id              uuid primary key default gen_random_uuid(),
    slug            text unique,
    question        text not null,
    locale          text not null default 'en',
    -- Optional link to the article/community story the poll belongs to.
    content_item_id uuid references public.content_items (id) on delete set null,
    location_id     uuid references public.locations (id) on delete set null,
    is_active       boolean not null default true,
    closes_at       timestamptz,
    created_at      timestamptz not null default now()
);

create table if not exists public.poll_options (
    id         uuid primary key default gen_random_uuid(),
    poll_id    uuid not null references public.polls (id) on delete cascade,
    label      text not null,
    sort_order integer not null default 0
);

create table if not exists public.poll_votes (
    id           uuid primary key default gen_random_uuid(),
    poll_id      uuid not null references public.polls (id) on delete cascade,
    option_id    uuid not null references public.poll_options (id) on delete cascade,
    -- Anonymous ballot token held in the reader's browser. One row per poll
    -- per token: the unique constraint below is what enforces one vote.
    voter_token  text not null,
    created_at   timestamptz not null default now(),
    constraint poll_votes_one_per_reader unique (poll_id, voter_token)
);

create index if not exists poll_options_poll_id_idx on public.poll_options (poll_id, sort_order);
create index if not exists poll_votes_option_id_idx on public.poll_votes (option_id);
create index if not exists polls_active_idx on public.polls (is_active, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Aggregate results view
--
-- Raw ballots are private (no SELECT policy on poll_votes). Readers get only
-- the counts via this view, which is defined with security_invoker = false so
-- it bypasses RLS and exposes aggregates exclusively.
-- ---------------------------------------------------------------------------
create or replace view public.poll_results with (security_invoker = false) as
    select
        poll_id,
        option_id,
        count(*)::integer as votes
    from public.poll_votes
    group by poll_id, option_id;

-- ---------------------------------------------------------------------------
-- 3. Row level security
-- ---------------------------------------------------------------------------
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;

drop policy if exists "Polls are readable by everyone" on public.polls;
create policy "Polls are readable by everyone"
    on public.polls for select
    using (is_active = true);

drop policy if exists "Poll options are readable by everyone" on public.poll_options;
create policy "Poll options are readable by everyone"
    on public.poll_options for select
    using (
        exists (
            select 1 from public.polls p
            where p.id = poll_options.poll_id
              and p.is_active = true
        )
    );

-- Anyone may cast a ballot. There is intentionally no SELECT policy on
-- poll_votes: individual ballots are never readable, only the tallies in
-- public.poll_results.
drop policy if exists "Anyone can cast a vote" on public.poll_votes;
create policy "Anyone can cast a vote"
    on public.poll_votes for insert
    to anon, authenticated
    with check (true);

grant select on public.polls to anon, authenticated;
grant select on public.poll_options to anon, authenticated;
grant insert on public.poll_votes to anon, authenticated;
grant select on public.poll_results to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Demo content — REMOVED
--
-- This migration originally seeded 3 hardcoded demo polls
-- ('mankon-market-priority', 'rainy-season-readiness', 'what-to-cover-next').
-- They are gone: polls are now created by staff from /admin/polls and
-- published through the normal workflow. 20260926000001_remove_demo_polls.sql
-- deletes the legacy rows from databases that already ran the old version;
-- lib/admin/demo-data.ts keeps the slugs listed so the "Remove demo data"
-- sweep and scripts/teardown-demo.mjs still catch any stragglers.
-- ---------------------------------------------------------------------------
