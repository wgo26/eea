-- ============================================================================
-- Eagle Eye Africa — Taxonomy admin (Phase 1 command center)
--
-- Splits the staff FOR ALL policies on categories / category_translations /
-- locations so that deletes are admin-only, while staff keep read (including
-- inactive rows, which the back office must list) + insert + update. The
-- public read policies are untouched. Admin writes go through the user-scoped
-- client in lib/admin/actions.ts, so these policies genuinely gate the new
-- taxonomy actions; deleteCategory/deleteLocation additionally assertAdmin()
-- at the action layer (defense in depth).
--
-- Run in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to run twice (idempotent).
-- ============================================================================

-- Categories ---------------------------------------------------------------
drop policy if exists "Staff manage categories" on public.categories;
drop policy if exists "Staff read all categories" on public.categories;
create policy "Staff read all categories"
    on public.categories for select
    using (public.is_staff());
drop policy if exists "Staff insert categories" on public.categories;
create policy "Staff insert categories"
    on public.categories for insert
    with check (public.is_staff());
drop policy if exists "Staff update categories" on public.categories;
create policy "Staff update categories"
    on public.categories for update
    using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Admin delete categories" on public.categories;
create policy "Admin delete categories"
    on public.categories for delete
    using (public.is_admin());

-- Category translations ----------------------------------------------------
drop policy if exists "Staff manage category translations" on public.category_translations;
drop policy if exists "Staff read all category translations" on public.category_translations;
create policy "Staff read all category translations"
    on public.category_translations for select
    using (public.is_staff());
drop policy if exists "Staff insert category translations" on public.category_translations;
create policy "Staff insert category translations"
    on public.category_translations for insert
    with check (public.is_staff());
drop policy if exists "Staff update category translations" on public.category_translations;
create policy "Staff update category translations"
    on public.category_translations for update
    using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Admin delete category translations" on public.category_translations;
create policy "Admin delete category translations"
    on public.category_translations for delete
    using (public.is_admin());

-- Locations ----------------------------------------------------------------
drop policy if exists "Staff manage locations" on public.locations;
drop policy if exists "Staff read all locations" on public.locations;
create policy "Staff read all locations"
    on public.locations for select
    using (public.is_staff());
drop policy if exists "Staff insert locations" on public.locations;
create policy "Staff insert locations"
    on public.locations for insert
    with check (public.is_staff());
drop policy if exists "Staff update locations" on public.locations;
create policy "Staff update locations"
    on public.locations for update
    using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Admin delete locations" on public.locations;
create policy "Admin delete locations"
    on public.locations for delete
    using (public.is_admin());
