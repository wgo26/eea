-- Community live events (Phase 3): embed-first broadcasts with chat + RSVP.
--
-- Design notes (see architecture-checklist.md):
-- - One broadcast per event (unique on content_item_id); the row is created
--   lazily by the first staff save, so existing events need no backfill.
-- - `provider = 'native'` (Mux/Livepeer ingest) is gated by the
--   `live.native_enabled` app flag, enforced in the server action — not here —
--   so flipping infrastructure never needs a migration. The embed providers
--   (YouTube / Facebook Live URLs) work with zero extra resources.
-- - Chat abuse controls: 500-char CHECK, staff hide via `moderate`, 10s
--   slow-mode enforced in the action (defense in depth, not a DB rule).
-- - RLS mirrors engagement_tables: public reads, session-bound writes.

create table if not exists public.event_broadcasts (
    id               uuid primary key default gen_random_uuid(),
    content_item_id  uuid not null unique references public.content_items (id) on delete cascade,
    status           text not null default 'scheduled'
                     check (status in ('scheduled', 'live', 'ended')),
    provider         text not null default 'youtube'
                     check (provider in ('youtube', 'facebook', 'native')),
    stream_url       text,
    recording_url    text,
    recap_content_item_id uuid references public.content_items (id) on delete set null,
    chat_enabled     boolean not null default true,
    started_at       timestamptz,
    ended_at         timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create table if not exists public.event_broadcast_chats (
    id           uuid primary key default gen_random_uuid(),
    broadcast_id uuid not null references public.event_broadcasts (id) on delete cascade,
    user_id      uuid not null references public.profiles (id) on delete cascade,
    body         text not null check (char_length(body) between 1 and 500),
    is_hidden    boolean not null default false,
    created_at   timestamptz not null default now()
);

create table if not exists public.event_rsvps (
    user_id         uuid not null references public.profiles (id) on delete cascade,
    content_item_id uuid not null references public.content_items (id) on delete cascade,
    created_at      timestamptz not null default now(),
    primary key (user_id, content_item_id)
);

create index if not exists event_broadcasts_status_idx on public.event_broadcasts (status);
create index if not exists event_broadcast_chats_broadcast_idx on public.event_broadcast_chats (broadcast_id, created_at);
create index if not exists event_rsvps_content_idx on public.event_rsvps (content_item_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.event_broadcasts enable row level security;
alter table public.event_broadcast_chats enable row level security;
alter table public.event_rsvps enable row level security;

-- Broadcast schedule/state is public information (drives LIVE badges).
drop policy if exists "Broadcasts are public" on public.event_broadcasts;
create policy "Broadcasts are public"
    on public.event_broadcasts for select using (true);

drop policy if exists "Staff manage broadcasts" on public.event_broadcasts;
create policy "Staff manage broadcasts"
    on public.event_broadcasts for all
    using (public.is_staff()) with check (public.is_staff());

-- Chat: everyone reads visible messages; only the author writes their own.
drop policy if exists "Visible chat is public" on public.event_broadcast_chats;
create policy "Visible chat is public"
    on public.event_broadcast_chats for select
    using (is_hidden = false or public.is_staff());

drop policy if exists "Authenticated users may chat" on public.event_broadcast_chats;
create policy "Authenticated users may chat"
    on public.event_broadcast_chats for insert
    with check (user_id = auth.uid());

drop policy if exists "Staff moderate chat" on public.event_broadcast_chats;
create policy "Staff moderate chat"
    on public.event_broadcast_chats for update
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff delete chat" on public.event_broadcast_chats;
create policy "Staff delete chat"
    on public.event_broadcast_chats for delete
    using (public.is_staff());

-- RSVPs: own rows only (counts are aggregated service-side).
drop policy if exists "Own RSVPs" on public.event_rsvps;
create policy "Own RSVPs"
    on public.event_rsvps for select
    using (user_id = auth.uid() or public.is_staff());

drop policy if exists "Authenticated users may RSVP" on public.event_rsvps;
create policy "Authenticated users may RSVP"
    on public.event_rsvps for insert
    with check (user_id = auth.uid());

drop policy if exists "Users may cancel own RSVP" on public.event_rsvps;
create policy "Users may cancel own RSVP"
    on public.event_rsvps for delete
    using (user_id = auth.uid());
