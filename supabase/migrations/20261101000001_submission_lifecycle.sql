alter type public.submission_status add value if not exists 'automated_checks';
alter type public.submission_status add value if not exists 'editorial_review';
alter type public.submission_status add value if not exists 'escalated';
alter type public.submission_status add value if not exists 'scheduled';

alter table public.submissions
  add column if not exists assigned_editor_id uuid references public.profiles (id) on delete set null;

create index if not exists submissions_assigned_editor_idx
  on public.submissions (assigned_editor_id, submitted_at desc)
  where assigned_editor_id is not null;

create table if not exists public.submission_reviews (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  reviewer_id uuid references public.profiles (id) on delete set null,
  status_from public.submission_status,
  status_to public.submission_status not null,
  notes text,
  review_type text not null check (review_type in ('automated', 'editorial')),
  created_at timestamptz not null default now()
);

create table if not exists public.submission_escalations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references public.submissions (id) on delete cascade,
  reason text not null,
  escalated_by uuid not null references public.profiles (id) on delete restrict,
  assigned_to uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists submission_reviews_submission_created_idx
  on public.submission_reviews (submission_id, created_at desc);
create index if not exists submission_escalations_open_idx
  on public.submission_escalations (assigned_to, created_at desc)
  where resolved_at is null;

alter table public.submission_reviews enable row level security;
alter table public.submission_escalations enable row level security;

drop policy if exists "Staff read submission reviews" on public.submission_reviews;
create policy "Staff read submission reviews"
  on public.submission_reviews for select using (public.is_staff());

drop policy if exists "Staff read submission escalations" on public.submission_escalations;
create policy "Staff read submission escalations"
  on public.submission_escalations for select using (public.is_staff());
