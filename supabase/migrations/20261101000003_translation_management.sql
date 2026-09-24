create table if not exists public.translation_jobs (
  id uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references public.content_items (id) on delete cascade,
  target_locale text not null check (target_locale in ('en', 'fr')),
  source_locale text not null check (source_locale in ('en', 'fr')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'failed')),
  translator_id uuid references public.profiles (id) on delete set null,
  reviewer_id uuid references public.profiles (id) on delete set null,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (content_item_id, target_locale)
);

create table if not exists public.translation_memory (
  id uuid primary key default gen_random_uuid(),
  source_text_hash text not null,
  source_locale text not null check (source_locale in ('en', 'fr')),
  target_locale text not null check (target_locale in ('en', 'fr')),
  source_text text not null,
  target_text text not null,
  created_at timestamptz not null default now(),
  unique (source_text_hash, source_locale, target_locale)
);

create index if not exists translation_jobs_status_created_idx
  on public.translation_jobs (status, created_at desc);
create index if not exists translation_jobs_content_idx
  on public.translation_jobs (content_item_id);
create index if not exists translation_memory_lookup_idx
  on public.translation_memory (source_text_hash, source_locale, target_locale);

alter table public.translation_jobs enable row level security;
alter table public.translation_memory enable row level security;

drop policy if exists "Staff read translation jobs" on public.translation_jobs;
create policy "Staff read translation jobs"
  on public.translation_jobs for select using (public.is_staff());

drop policy if exists "Staff read translation memory" on public.translation_memory;
create policy "Staff read translation memory"
  on public.translation_memory for select using (public.is_staff());
