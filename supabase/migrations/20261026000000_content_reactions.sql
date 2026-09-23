-- W20 (P3) — content reactions (spec §16, first slice).
--
-- Lightweight appreciation signals (like / helpful) on published content.
-- Deliberately NOT user-generated content, so they need no moderation
-- pipeline: the model mirrors community polls (migration 20260902000000):
--   * anonymous per-reader token held in the browser (`eea-reactor`); the
--     unique constraint below is what enforces one reaction per reader/kind;
--   * raw rows are private (no SELECT policy); readers get only the tallies
--     via the `content_reaction_counts` view (security_invoker = false).
-- Full write-up comments stay gated on W13 demand (docs/LASTEST.MD W20).

create table if not exists public.content_reactions (
    id               uuid primary key default gen_random_uuid(),
    content_item_id  uuid not null references public.content_items (id) on delete cascade,
    kind             text not null constraint content_reactions_kind_check check (kind in ('like', 'helpful')),
    -- Anonymous token held in the reader's browser. One row per content item
    -- per kind per token: the unique constraint below enforces one tap.
    reactor_token    text not null constraint content_reactions_token_check check (reactor_token ~ '^[A-Za-z0-9-]{8,64}$'),
    created_at       timestamptz not null default now(),
    constraint content_reactions_one_per_reader unique (content_item_id, kind, reactor_token)
);

create index if not exists content_reactions_item_idx
    on public.content_reactions (content_item_id);

-- ---------------------------------------------------------------------------
-- Aggregate counts view (public readers get tallies only, never raw rows)
-- ---------------------------------------------------------------------------
create or replace view public.content_reaction_counts with (security_invoker = false) as
    select
        content_item_id,
        kind,
        count(*)::integer as reactions
    from public.content_reactions
    group by content_item_id, kind;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.content_reactions enable row level security;

-- Anyone may react. There is intentionally no SELECT policy on
-- content_reactions: individual taps are never readable, only the tallies in
-- public.content_reaction_counts.
drop policy if exists "Anyone can react" on public.content_reactions;
create policy "Anyone can react"
    on public.content_reactions for insert
    to anon, authenticated
    with check (true);

-- No DELETE policy: un-reacting happens only through the service-role
-- toggle action (lib/public/actions.ts), which scopes the delete to the
-- caller's own reactor_token. An open anon DELETE would let anyone wipe a
-- story's tallies.

grant insert on public.content_reactions to anon, authenticated;
grant select on public.content_reaction_counts to anon, authenticated;
