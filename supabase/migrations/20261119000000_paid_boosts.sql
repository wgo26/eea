-- Paid promotion, Cameroon-first (Phase 5): MoMo-billed pro subscriptions
-- (directory featuring) and listing boosts.
--
-- Money model, deliberately small:
-- - `professional_subscriptions`: a verified business pays for `pro` tier
--   featuring (businesses.is_featured) for 7/30 days. Paid featuring is
--   tracked by `businesses.featured_source = 'paid'` so expiry never clears
--   an editorial (`'editorial'`) feature — the two never share a flag.
-- - `listing_promotions`: a listing owner buys a 7/30-day ranking boost.
--   Boosts NEVER touch content_items.is_featured (that flag is the editorial
--   homepage rotation); ranking reads active promotions at query time.
-- - Payment is Mobile Money (MTN/Orange, Cameroon prefixes) via a provider
--   intent (Campay Collect) confirmed by webhook; staff can also confirm
--   manually (same precedent as the advertise-inquiry flow). Every state
--   change is audited in moderation_log.
-- - Expiry is enforced by runDueContentSweep (code fallback, idempotent) the
--   same way listing expiry already is — no new pg_cron surface needed.

-- Paid vs editorial featuring on the directory (default keeps old rows editorial).
alter table public.businesses
    add column if not exists featured_source text not null default 'editorial'
    check (featured_source in ('editorial', 'paid'));

create table if not exists public.professional_subscriptions (
    id               uuid primary key default gen_random_uuid(),
    business_id      uuid not null references public.businesses (id) on delete cascade,
    tier             text not null default 'pro' check (tier in ('pro')),
    plan_id          text not null,
    amount_xaf       integer not null check (amount_xaf > 0),
    days             integer not null check (days between 1 and 365),
    status           text not null default 'pending'
                     check (status in ('pending', 'active', 'expired', 'failed', 'cancelled')),
    momo_provider    text,
    momo_number      text,
    reference        text not null unique,
    provider_ref     text,
    created_by       uuid references public.profiles (id) on delete set null,
    confirmed_by     uuid references public.profiles (id) on delete set null,
    starts_at        timestamptz,
    ends_at          timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create table if not exists public.listing_promotions (
    id               uuid primary key default gen_random_uuid(),
    content_item_id  uuid not null references public.content_items (id) on delete cascade,
    business_id      uuid references public.businesses (id) on delete set null,
    plan_id          text not null,
    amount_xaf       integer not null check (amount_xaf > 0),
    days             integer not null check (days between 1 and 365),
    status           text not null default 'pending'
                     check (status in ('pending', 'active', 'expired', 'failed', 'cancelled')),
    momo_provider    text,
    momo_number      text,
    reference        text not null unique,
    provider_ref     text,
    created_by       uuid references public.profiles (id) on delete set null,
    confirmed_by     uuid references public.profiles (id) on delete set null,
    starts_at        timestamptz,
    ends_at          timestamptz,
    created_at       timestamptz not null default now(),
    updated_at       timestamptz not null default now()
);

create index if not exists pro_subscriptions_business_idx
    on public.professional_subscriptions (business_id, status);
create index if not exists pro_subscriptions_status_idx
    on public.professional_subscriptions (status, ends_at);
create index if not exists listing_promotions_content_idx
    on public.listing_promotions (content_item_id, status);
create index if not exists listing_promotions_status_idx
    on public.listing_promotions (status, ends_at);

-- ---------------------------------------------------------------------------
-- RLS: money rows are private. Owners read their own (business owner for
-- subs; listing owner for promos — resolved service-side, so the policy is
-- staff + created_by + business owner), all writes go through the
-- service-role client in the billing actions. No public/anon policies at all.
-- ---------------------------------------------------------------------------
alter table public.professional_subscriptions enable row level security;
alter table public.listing_promotions enable row level security;

drop policy if exists "Own subscriptions readable" on public.professional_subscriptions;
create policy "Own subscriptions readable"
    on public.professional_subscriptions for select
    using (created_by = auth.uid() or public.is_staff());

drop policy if exists "Staff manage subscriptions" on public.professional_subscriptions;
create policy "Staff manage subscriptions"
    on public.professional_subscriptions for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Own promotions readable" on public.listing_promotions;
create policy "Own promotions readable"
    on public.listing_promotions for select
    using (created_by = auth.uid() or public.is_staff());

drop policy if exists "Staff manage promotions" on public.listing_promotions;
create policy "Staff manage promotions"
    on public.listing_promotions for all
    using (public.is_staff()) with check (public.is_staff());
