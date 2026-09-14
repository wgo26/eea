-- Migration: 20261005000000_listing_conversations_rename.sql
-- The hosted DB already owns public.conversations (legacy table without
-- buyer_id/seller_id), so CREATE TABLE IF NOT EXISTS silently no-ops and the
-- policy fails with 'column buyer_id does not exist'. We use fresh
-- listing_conversations / listing_conversation_messages names instead —
-- non-destructive, idempotent, safe to re-run.

create table if not exists public.listing_conversations (
    id              uuid primary key default gen_random_uuid(),
    content_item_id uuid not null references public.content_items (id) on delete cascade,
    buyer_id        uuid not null references public.profiles (id) on delete cascade,
    seller_id       uuid not null references public.profiles (id) on delete cascade,
    created_at      timestamptz not null default now(),
    updated_at      timestamptz not null default now(),
    unique (content_item_id, buyer_id, seller_id)
);

create table if not exists public.listing_conversation_messages (
    id              uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.listing_conversations (id) on delete cascade,
    sender_id       uuid not null references public.profiles (id) on delete cascade,
    body            text not null,
    created_at      timestamptz not null default now()
);

create index if not exists listing_conversation_messages_thread_idx
    on public.listing_conversation_messages (conversation_id, created_at);

alter table public.listing_conversations enable row level security;
alter table public.listing_conversation_messages enable row level security;

drop policy if exists "Listing conversation participants only" on public.listing_conversations;
create policy "Listing conversation participants only"
    on public.listing_conversations for all
    using (buyer_id = auth.uid() or seller_id = auth.uid())
    with check (buyer_id = auth.uid() or seller_id = auth.uid());

drop policy if exists "Listing message participants only" on public.listing_conversation_messages;
create policy "Listing message participants only"
    on public.listing_conversation_messages for all
    using (
        exists (
            select 1 from public.listing_conversations c
            where c.id = listing_conversation_messages.conversation_id
            and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
        )
    )
    with check (
        sender_id = auth.uid()
        and exists (
            select 1 from public.listing_conversations c
            where c.id = listing_conversation_messages.conversation_id
            and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
        )
    );
