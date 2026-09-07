-- ============================================================================
-- Eagle Eye Africa — Content hard-delete (Phase 2 command center)
--
-- Every admin write already goes through the user-scoped client
-- (lib/admin/actions.ts), so RLS genuinely gates these actions. The base
-- schema gives staff FOR ALL on all content tables; this splits hard-delete
-- to admin-only so that deleteContentItem (and only admins) can fully remove
-- content items, translations, media, and type-specific rows. Editors keep
-- create/update. Service-role reads (lib/admin/queries.ts) are unaffected.
--
-- Run in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to run twice (idempotent).
-- ============================================================================

-- Content items ------------------------------------------------------------
drop policy if exists "Staff manage content" on public.content_items;
drop policy if exists "Staff read all content items" on public.content_items;
create policy "Staff read all content items"
    on public.content_items for select using (public.is_staff());
drop policy if exists "Staff insert content items" on public.content_items;
create policy "Staff insert content items"
    on public.content_items for insert with check (public.is_staff());
drop policy if exists "Staff update content items" on public.content_items;
create policy "Staff update content items"
    on public.content_items for update using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Admin delete content items" on public.content_items;
create policy "Admin delete content items"
    on public.content_items for delete using (public.is_admin());

-- Translations -------------------------------------------------------------
drop policy if exists "Staff manage translations" on public.content_translations;
drop policy if exists "Staff read all translations" on public.content_translations;
create policy "Staff read all translations"
    on public.content_translations for select using (public.is_staff());
drop policy if exists "Staff insert translations" on public.content_translations;
create policy "Staff insert translations"
    on public.content_translations for insert with check (public.is_staff());
drop policy if exists "Staff update translations" on public.content_translations;
create policy "Staff update translations"
    on public.content_translations for update using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Admin delete translations" on public.content_translations;
create policy "Admin delete translations"
    on public.content_translations for delete using (public.is_admin());

-- Media assets -------------------------------------------------------------
drop policy if exists "Staff manage media" on public.media_assets;
drop policy if exists "Staff read all media" on public.media_assets;
create policy "Staff read all media"
    on public.media_assets for select using (public.is_staff());
drop policy if exists "Staff insert media" on public.media_assets;
create policy "Staff insert media"
    on public.media_assets for insert with check (public.is_staff());
drop policy if exists "Staff update media" on public.media_assets;
create policy "Staff update media"
    on public.media_assets for update using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Admin delete media" on public.media_assets;
create policy "Admin delete media"
    on public.media_assets for delete using (public.is_admin());

-- Listings -----------------------------------------------------------------
drop policy if exists "Staff manage listings" on public.listings;
drop policy if exists "Staff read all listings" on public.listings;
create policy "Staff read all listings"
    on public.listings for select using (public.is_staff());
drop policy if exists "Staff insert listings" on public.listings;
create policy "Staff insert listings"
    on public.listings for insert with check (public.is_staff());
drop policy if exists "Staff update listings" on public.listings;
create policy "Staff update listings"
    on public.listings for update using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Admin delete listings" on public.listings;
create policy "Admin delete listings"
    on public.listings for delete using (public.is_admin());

-- Notices ------------------------------------------------------------------
drop policy if exists "Staff manage notices" on public.notices;
drop policy if exists "Staff read all notices" on public.notices;
create policy "Staff read all notices"
    on public.notices for select using (public.is_staff());
drop policy if exists "Staff insert notices" on public.notices;
create policy "Staff insert notices"
    on public.notices for insert with check (public.is_staff());
drop policy if exists "Staff update notices" on public.notices;
create policy "Staff update notices"
    on public.notices for update using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Admin delete notices" on public.notices;
create policy "Admin delete notices"
    on public.notices for delete using (public.is_admin());

-- Events -------------------------------------------------------------------
drop policy if exists "Staff manage events" on public.events;
drop policy if exists "Staff read all events" on public.events;
create policy "Staff read all events"
    on public.events for select using (public.is_staff());
drop policy if exists "Staff insert events" on public.events;
create policy "Staff insert events"
    on public.events for insert with check (public.is_staff());
drop policy if exists "Staff update events" on public.events;
create policy "Staff update events"
    on public.events for update using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Admin delete events" on public.events;
create policy "Admin delete events"
    on public.events for delete using (public.is_admin());
