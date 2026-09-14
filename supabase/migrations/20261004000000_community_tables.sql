-- Migration: 20261004000000_community_tables.sql
-- Description: Community tables — digest archive, conversations, follows,
--              listing ratings.
--
-- NOTE 2026-09-14: the conversations section is SUPERSEDED on hosted DBs by
-- 20261005000000_listing_conversations_rename.sql. The hosted DB already owns
-- a legacy public.conversations table (no buyer_id/seller_id), so the
-- original CREATE TABLE IF NOT EXISTS was a silent no-op there and the policy
-- failed with 'column buyer_id does not exist', aborting the push.
-- This file was edited BEFORE it was ever recorded in
-- supabase_migrations.schema_migrations (the push failed mid-file), so the
-- edit ships inside the same version rather than a repair migration.
-- The app reads listing_conversations (lib/messages).
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS); safe to re-run.

-- ---------------------------------------------------------------------------
-- Digest archive
-- ---------------------------------------------------------------------------
create table if not exists public.digest_issues (
    id          uuid primary key default gen_random_uuid(),
    sent_on     date not null,
    locale      text not null default 'en',
    subject     text not null,
    stories     jsonb not null default '[]'::jsonb,
    emailed     integer not null default 0,
    whatsapped  integer not null default 0,
    created_at  timestamptz not null default now(),
    unique (sent_on, locale)
);

alter table public.digest_issues enable row level security;

drop policy if exists "Digest issues are public" on public.digest_issues;
create policy "Digest issues are public"
    on public.digest_issues for select using (true);

-- ---------------------------------------------------------------------------
-- Conversations + messages (listing-scoped buyer↔seller DMs)
-- Removed 2026-09-14 (same version, never applied — see header): use
-- listing_conversations / listing_conversation_messages from
-- 20261005000000_listing_conversations_rename.sql instead. The app
-- (lib/messages/actions.ts) reads only the renamed tables.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Contributor follows
-- ---------------------------------------------------------------------------
create table if not exists public.contributor_follows (
    follower_id    uuid not null references public.profiles (id) on delete cascade,
    contributor_id uuid not null references public.profiles (id) on delete cascade,
    created_at     timestamptz not null default now(),
    primary key (follower_id, contributor_id),
    check (follower_id <> contributor_id)
);

alter table public.contributor_follows enable row level security;

drop policy if exists "Own contributor follows" on public.contributor_follows;
create policy "Own contributor follows"
    on public.contributor_follows for all
    using (follower_id = auth.uid()) with check (follower_id = auth.uid());

drop policy if exists "Follower counts are public" on public.contributor_follows;
create policy "Follower counts are public"
    on public.contributor_follows for select using (true);

-- ---------------------------------------------------------------------------
-- Listing ratings (1–5 stars, one per user per listing)
-- ---------------------------------------------------------------------------
create table if not exists public.listing_ratings (
    user_id         uuid not null references public.profiles (id) on delete cascade,
    content_item_id uuid not null references public.content_items (id) on delete cascade,
    stars           smallint not null check (stars >= 1 and stars <= 5),
    created_at      timestamptz not null default now(),
    primary key (user_id, content_item_id)
);

alter table public.listing_ratings enable row level security;

drop policy if exists "Own listing ratings" on public.listing_ratings;
create policy "Own listing ratings"
    on public.listing_ratings for all
    using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Rating aggregates are public" on public.listing_ratings;
create policy "Rating aggregates are public"
    on public.listing_ratings for select using (true);
