-- P0-2 hardening: close the expired-content read gap on the anon path.
--
-- The init schema's public SELECT on content_items allowed every
-- status='published' + NOT is_archived row, with no bound on published_at /
-- expires_at. Scheduled rows are safe (status='scheduled', not 'published'),
-- but an EXPIRED published row (expires_at < now()) stayed readable via
-- direct PostgREST anon SELECT even where the app filters it (sitemap,
-- buy-sell list). News queries don't filter expires_at at all, so the wall
-- has to be RLS, not per-query discipline.
--
-- This migration redefines the public read policies to also require
-- (expires_at IS NULL OR expires_at > now()). Rows with NULL expires_at
-- (news, culture, most content) are unaffected. Staff policies untouched.
-- Notices enforce their own notices.expiry_date at the app layer; their
-- parent content_items.expires_at is NULL so this predicate is a no-op there.
--
-- Idempotent: safe to re-run via `supabase db push` or the dashboard.

-- content_items: public read now excludes expired rows.
drop policy if exists "Published content is readable by everyone" on public.content_items;
create policy "Published content is readable by everyone"
    on public.content_items for select
    using (
        status = 'published'
        and not is_archived
        and (expires_at is null or expires_at > now())
    );

-- content_translations: mirror the parent predicate so translations of an
-- expired story are not readable directly either.
drop policy if exists "Published content translations are readable" on public.content_translations;
create policy "Published content translations are readable"
    on public.content_translations for select
    using (
        exists (
            select 1 from public.content_items ci
            where ci.id = content_item_id
              and ci.status = 'published'
              and not ci.is_archived
              and (ci.expires_at is null or ci.expires_at > now())
        )
    );

-- media_assets: same mirror (content_item_id null = standalone upload stays readable).
drop policy if exists "Media of published content is readable" on public.media_assets;
create policy "Media of published content is readable"
    on public.media_assets for select
    using (
        content_item_id is null or exists (
            select 1 from public.content_items ci
            where ci.id = content_item_id
              and ci.status = 'published'
              and not ci.is_archived
              and (ci.expires_at is null or ci.expires_at > now())
        )
    );

-- Extension-row mirrors: listings / notices / events / fundraisers of
-- published content. Each gains the parent archived + expiry predicates so a
-- direct anon SELECT on the child cannot outlive the parent's visibility.
-- (Notices keep their own notices.expiry_date enforcement at the app layer;
-- this only aligns the parent side.)
drop policy if exists "Notices of published content are readable" on public.notices;
create policy "Notices of published content are readable"
    on public.notices for select
    using (
        exists (
            select 1 from public.content_items ci
            where ci.id = content_item_id
              and ci.status = 'published'
              and not ci.is_archived
              and (ci.expires_at is null or ci.expires_at > now())
        )
    );

drop policy if exists "Listings of published content are readable" on public.listings;
create policy "Listings of published content are readable"
    on public.listings for select
    using (
        exists (
            select 1 from public.content_items ci
            where ci.id = content_item_id
              and ci.status = 'published'
              and not ci.is_archived
              and (ci.expires_at is null or ci.expires_at > now())
        )
    );

drop policy if exists "Events of published content are readable" on public.events;
create policy "Events of published content are readable"
    on public.events for select
    using (
        exists (
            select 1 from public.content_items ci
            where ci.id = content_item_id
              and ci.status = 'published'
              and not ci.is_archived
              and (ci.expires_at is null or ci.expires_at > now())
        )
    );

drop policy if exists "Fundraisers of published content are readable" on public.fundraisers;
create policy "Fundraisers of published content are readable"
    on public.fundraisers for select
    using (
        exists (
            select 1 from public.content_items ci
            where ci.id = content_item_id
              and ci.status = 'published'
              and not ci.is_archived
              and (ci.expires_at is null or ci.expires_at > now())
        )
    );
