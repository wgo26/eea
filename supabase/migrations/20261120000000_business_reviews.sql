-- Trusted professionals, the trust engine (Phase 7): community reviews.
--
-- A verified badge says the team checked the pro; reviews say neighbours
-- vouch for the work. Reviews are staff-adjudicated like claims (pending by
-- default, approved rows only are public) — a review section that also
-- doubles as a disputes log stops recording what the work was actually like.
-- Aggregates (avg/count) are computed service-side at read time; the
-- directory stays small enough that no materialized counter is warranted.

create table if not exists public.business_reviews (
    id            uuid primary key default gen_random_uuid(),
    business_id   uuid not null references public.businesses (id) on delete cascade,
    reviewer_name text not null check (char_length(reviewer_name) between 2 and 200),
    rating        integer not null check (rating between 1 and 5),
    body          text not null check (char_length(body) between 10 and 2000),
    status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
    created_by    uuid references public.profiles (id) on delete set null,
    reviewed_by   uuid references public.profiles (id) on delete set null,
    reviewed_at   timestamptz,
    created_at    timestamptz not null default now()
);

create index if not exists business_reviews_business_idx
    on public.business_reviews (business_id, status, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS: open intake (anyone who hired the pro may review), public reads of
-- approved rows only, staff-only adjudication. Writes go through the
-- service-role client in the actions; no owner-write path needed.
-- ---------------------------------------------------------------------------
alter table public.business_reviews enable row level security;

drop policy if exists "Anyone may review a pro" on public.business_reviews;
create policy "Anyone may review a pro"
    on public.business_reviews for insert with check (true);

drop policy if exists "Approved reviews are public" on public.business_reviews;
create policy "Approved reviews are public"
    on public.business_reviews for select
    using (status = 'approved' or public.is_staff());

drop policy if exists "Staff adjudicate reviews" on public.business_reviews;
create policy "Staff adjudicate reviews"
    on public.business_reviews for update
    using (public.is_staff()) with check (public.is_staff());
