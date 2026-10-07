-- Trusted professionals directory (Phase 4): skills on businesses, public
-- verification claims (guest-friendly, staff-adjudicated), and the
-- listing → pro-storefront bridge.
--
-- - `businesses.skills` carries the trade/skill chips shown on cards and
--   profiles (e.g. plumbing, solar installation, tailoring).
-- - `business_claims` is the intake table: anyone (including guests, mirroring
--   the submissions model) may claim a listing; only staff read/adjudicate.
--   Approval creates or verifies the `businesses` row — never auto-publishes.
-- - `listings.business_id` lets a verified pro's storefront aggregate their
--   live listings.

alter table public.businesses
    add column if not exists skills text[] not null default '{}';

alter table public.listings
    add column if not exists business_id uuid references public.businesses (id) on delete set null;

create index if not exists listings_business_idx on public.listings (business_id);

create table if not exists public.business_claims (
    id            uuid primary key default gen_random_uuid(),
    business_name text not null check (char_length(business_name) between 2 and 200),
    claimant_name text not null check (char_length(claimant_name) between 2 and 200),
    contact_phone text,
    contact_email citext,
    whatsapp      text,
    location_id   uuid references public.locations (id) on delete set null,
    category_text text,
    skills        text[] not null default '{}',
    description   text,
    business_id   uuid references public.businesses (id) on delete set null,
    created_by    uuid references public.profiles (id) on delete set null,
    status        text not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
    reviewed_by   uuid references public.profiles (id) on delete set null,
    reviewed_at   timestamptz,
    review_note   text,
    created_at    timestamptz not null default now()
);

create index if not exists business_claims_status_idx on public.business_claims (status, created_at desc);

-- ---------------------------------------------------------------------------
-- RLS (mirrors submissions: open intake, staff-only review surface)
-- ---------------------------------------------------------------------------
alter table public.business_claims enable row level security;

drop policy if exists "Anyone may claim a listing" on public.business_claims;
create policy "Anyone may claim a listing"
    on public.business_claims for insert with check (true);

drop policy if exists "Own claims readable" on public.business_claims;
create policy "Own claims readable"
    on public.business_claims for select
    using (created_by = auth.uid() or public.is_staff());

drop policy if exists "Staff adjudicate claims" on public.business_claims;
create policy "Staff adjudicate claims"
    on public.business_claims for update
    using (public.is_staff()) with check (public.is_staff());
