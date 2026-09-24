-- Profile avatars: public reads, members manage their own folder, staff manage all.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
    'avatars',
    'avatars',
    true,
    5242880,
    array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
    name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can read avatars" on storage.objects;
create policy "Public can read avatars"
    on storage.objects for select
    using (bucket_id = 'avatars');

drop policy if exists "Members manage own avatar" on storage.objects;
create policy "Members manage own avatar"
    on storage.objects for insert
    to authenticated
    with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Members update own avatar" on storage.objects;
create policy "Members update own avatar"
    on storage.objects for update
    to authenticated
    using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    )
    with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Members delete own avatar" on storage.objects;
create policy "Members delete own avatar"
    on storage.objects for delete
    to authenticated
    using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Staff manage avatars" on storage.objects;
create policy "Staff manage avatars"
    on storage.objects for all
    to authenticated
    using (bucket_id = 'avatars' and public.is_staff())
    with check (bucket_id = 'avatars' and public.is_staff());
