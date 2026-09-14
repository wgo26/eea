-- ============================================================================
-- Migration: 20261004000000_community_tables.sql
-- Description: Community tables — digest archive, conversations, follows,
--              listing ratings.
--
--   * digest_issues: one row per sent daily digest (date, locale, story
--     snapshot, delivered counts), written by the ops-digest cron. Powers
--     the public /digest/archive page. No RLS reads needed beyond public
--     select (digests are public content).
--   * conversations + conversation_messages: lean buyer↔seller messaging
--     about a listing. Participants only (buyer_id / seller_id), no
--     realtime — the inbox refreshes on navigation.
--   * contributor_follows: one row per (follower, contributor) pair for
--     "follow favorite contributors".
--   * listing_ratings: one 1–5 star row per (user, listing content item).
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS); safe to re-run.
-- Rules: applied migrations are immutable — repairs always append new files.
-- ============================================================================

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
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
    id              uuid primary key default gen_random_uuid(),
    content_item_id uuid not null references public.content_items (id) on delete cascade,
    buyer_id        uuid not null references public.profiles (id) on delete cascade,
    seller_id       uuid not null references public.profiles (id) on delete cascade,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (content_item_id, buyer_id, seller_id)
);

create table if not exists public.conversation_messages (
    id              uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations (id) on delete cascade,
    sender_id       uuid not null references public.profiles (id) on delete cascade,
    body            text not null,
    created_at      timestamptz not null default now()
);

create index if not exists conversation_messages_thread_idx
    on public.conversation_messages (conversation_id, created_at);

alter table public.conversations enable row level security;
alter table public.conversation_messages enable row level security;

drop policy if exists "Conversation participants only" on public.conversations;
create policy "Conversation participants only"
    on public.conversations for all
    using (buyer_id = auth.uid() or seller_id = auth.uid())
    with check (buyer_id = auth.uid() or seller_id = auth.uid());

drop policy if exists "Message participants only" on public.conversation_messages;
create policy "Message participants only"
    on public.conversation_messages for all
    using (
        exists (
            select 1 from public.conversations c
            where c.id = conversation_messages.conversation_id
            and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
        )
    )
    with check (
        sender_id = auth.uid()
        and exists (
            select 1 from public.conversations c
            where c.id = conversation_messages.conversation_id
            and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
        )
    );

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
