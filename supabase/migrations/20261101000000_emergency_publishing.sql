create table if not exists public.emergency_publishing_presets (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  content_type public.content_type not null default 'notice',
  template jsonb not null default '{}'::jsonb,
  requires_two_person boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.emergency_publish_events (
  id uuid primary key default gen_random_uuid(),
  preset_id uuid references public.emergency_publishing_presets (id) on delete set null,
  content_item_id uuid not null references public.content_items (id) on delete restrict,
  actor_id uuid not null references public.profiles (id) on delete restrict,
  approval_id uuid references public.two_person_approvals (id) on delete set null,
  severity text not null check (severity in ('alert', 'critical')),
  created_at timestamptz not null default now()
);

create index if not exists emergency_publish_events_created_idx
  on public.emergency_publish_events (created_at desc);
create index if not exists emergency_publish_events_content_idx
  on public.emergency_publish_events (content_item_id);

alter table public.emergency_publishing_presets enable row level security;
alter table public.emergency_publish_events enable row level security;

drop policy if exists "Staff read emergency presets" on public.emergency_publishing_presets;
create policy "Staff read emergency presets"
  on public.emergency_publishing_presets for select using (public.is_staff());

drop policy if exists "Staff read emergency publish events" on public.emergency_publish_events;
create policy "Staff read emergency publish events"
  on public.emergency_publish_events for select using (public.is_staff());
