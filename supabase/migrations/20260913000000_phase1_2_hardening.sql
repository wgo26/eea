-- Hardening migration for taxonomy redirects and content relation integrity.

-- 1. Staff may maintain redirect metadata, but only admins may remove it.
drop policy if exists "Staff can update location slug redirects" on public.location_slug_redirects;
create policy "Staff can update location slug redirects"
    on public.location_slug_redirects for update
    using (public.is_staff());

drop policy if exists "Staff can delete location slug redirects" on public.location_slug_redirects;
drop policy if exists "Admin can delete location slug redirects" on public.location_slug_redirects;
create policy "Admin can delete location slug redirects"
    on public.location_slug_redirects for delete
    using (public.is_admin());

-- 2. Indexes for performance on key foreign keys
create index if not exists content_items_category_id_idx
    on public.content_items (category_id);

create index if not exists content_items_location_id_idx
    on public.content_items (location_id);

create index if not exists location_slug_redirects_old_slug_idx
    on public.location_slug_redirects (old_slug);
