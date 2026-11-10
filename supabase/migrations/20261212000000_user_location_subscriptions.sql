-- ============================================================================
-- Eagle Eye Africa — User location subscriptions (Phase 5)
--
-- A dedicated subscription table so members can follow places (continent,
-- country, region, division, city, town, quarter, landmark) independently of
-- the content_follows topic model. Subscriptions drive the followed-places
-- digest rail and personalized "near you" briefs.
--
-- Safe to run twice.
-- ============================================================================

create table if not exists public.user_location_subscriptions (
    user_id     uuid not null references public.profiles (id) on delete cascade,
    location_id uuid not null references public.locations (id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (user_id, location_id)
);

create index if not exists user_location_subscriptions_user_idx
    on public.user_location_subscriptions (user_id);

create index if not exists user_location_subscriptions_location_idx
    on public.user_location_subscriptions (location_id);

alter table public.user_location_subscriptions enable row level security;

-- Members manage their own subscriptions only (user_id = auth.uid()).
create policy if not exists "Members manage own subscriptions"
    on public.user_location_subscriptions for all
    using (auth.uid() = user_id)
    with check (auth.uid() = user_id);
