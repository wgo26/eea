-- Eagle Eye Africa: admin asset storage
--
-- The application stores small public-facing admin assets (avatars, ad
-- creatives, and similar files) in this bucket. Public reads are intentional:
-- the application returns getPublicUrl() values for these assets. Writes and
-- deletes remain staff-only through Storage RLS.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'admin-asset',
    'admin-asset',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/quicktime',
          'audio/mpeg', 'audio/mp4', 'audio/wav', 'application/pdf']
)
on conflict (id) do update set
    name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read admin assets" on storage.objects;
create policy "Public can read admin assets"
    on storage.objects for select
    using (bucket_id = 'admin-asset');

drop policy if exists "Staff can upload admin assets" on storage.objects;
create policy "Staff can upload admin assets"
    on storage.objects for insert
    to authenticated
    with check (
        bucket_id = 'admin-asset'
        and name like 'admin_asset/%'
        and public.is_staff()
    );

drop policy if exists "Staff can update admin assets" on storage.objects;
create policy "Staff can update admin assets"
    on storage.objects for update
    to authenticated
    using (bucket_id = 'admin-asset' and public.is_staff())
    with check (bucket_id = 'admin-asset' and public.is_staff());

drop policy if exists "Staff can delete admin assets" on storage.objects;
create policy "Staff can delete admin assets"
    on storage.objects for delete
    to authenticated
    using (bucket_id = 'admin-asset' and public.is_staff());