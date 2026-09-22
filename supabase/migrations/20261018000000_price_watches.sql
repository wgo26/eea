-- Phase 3: price-drop alerts for marketplace savers.
--
-- `price_watches` links an authenticated user to a listing content item.
-- Toggled from the listing detail page (rate-limited action); the staff
-- `updateListing` price path notifies watchers on drops via the existing
-- `listing.update` outbox event. RLS: owners manage their own rows, staff
-- read all. Idempotent.

create table if not exists public.price_watches (
    user_id         uuid not null references public.profiles (id) on delete cascade,
    content_item_id uuid not null references public.content_items (id) on delete cascade,
    created_at      timestamptz not null default now(),
    primary key (user_id, content_item_id)
);

alter table public.price_watches enable row level security;

drop policy if exists "Own price watches" on public.price_watches;
create policy "Own price watches"
    on public.price_watches for all
    using (user_id = auth.uid() or public.is_staff())
    with check (user_id = auth.uid() or public.is_staff());
