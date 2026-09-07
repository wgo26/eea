-- Admin integrity additions for taxonomy redirects and durable entity audits.

alter table public.moderation_log
    add column if not exists entity_type text,
    add column if not exists entity_id uuid;

create table if not exists public.location_slug_redirects (
    id uuid primary key default gen_random_uuid(),
    location_id uuid references public.locations (id) on delete cascade,
    old_slug text not null unique,
    created_by uuid references public.profiles (id) on delete set null,
    created_at timestamptz not null default now()
);

create index if not exists location_slug_redirects_location_idx
    on public.location_slug_redirects (location_id);

alter table public.location_slug_redirects enable row level security;

drop policy if exists "Public can read location slug redirects" on public.location_slug_redirects;
create policy "Public can read location slug redirects"
    on public.location_slug_redirects for select using (true);

drop policy if exists "Staff can create location slug redirects" on public.location_slug_redirects;
create policy "Staff can create location slug redirects"
    on public.location_slug_redirects for insert
    with check (public.is_staff());

drop policy if exists "Admin can delete location slug redirects" on public.location_slug_redirects;
create policy "Admin can delete location slug redirects"
    on public.location_slug_redirects for delete
    using (public.is_admin());