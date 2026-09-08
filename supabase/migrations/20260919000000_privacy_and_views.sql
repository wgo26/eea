-- Migration: 20260919000000_privacy_and_views.sql
-- Description: Phase 1 privacy controls and safe public profile views

-- ---------------------------------------------------------------------------
-- 1. Safe public profiles view
-- Exposes only public display fields, omitting phone, email, and internal flags.
-- ---------------------------------------------------------------------------

create or replace view public.public_profiles as
select
    id,
    display_name,
    full_name,
    avatar_url,
    bio,
    created_at
from public.profiles
where not coalesce(is_banned, false)
  and not coalesce(is_suspended, false);

-- Public grants for the safe view
grant select on public.public_profiles to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Authenticated media upload policy
-- Allows logged-in users to register media assets they uploaded.
-- ---------------------------------------------------------------------------

drop policy if exists "Users insert own uploaded media" on public.media_assets;
create policy "Users insert own uploaded media"
    on public.media_assets
    for insert
    to authenticated
    with check (uploaded_by = auth.uid());

-- ---------------------------------------------------------------------------
-- 3. Gated listings view for marketplace
-- Provides public listings with contact presence indicators rather than raw PII.
-- ---------------------------------------------------------------------------

create or replace view public.public_listings_safe as
select
    l.content_item_id,
    l.price,
    l.currency,
    l.listing_status,
    (l.contact_phone is not null and trim(l.contact_phone) <> '') as has_phone,
    (l.contact_email is not null and trim(l.contact_email) <> '') as has_email,
    (l.whatsapp_number is not null and trim(l.whatsapp_number) <> '') as has_whatsapp
from public.listings l;

grant select on public.public_listings_safe to anon, authenticated;
