-- Phase 3.1/3.2: backup lease + integrity columns (audit §5.1).
--
-- Problems fixed:
--   1. No lease/lock — concurrent cron invocations (Vercel retries, overlapping
--      schedules) could mirror the same media_assets row twice.
--   2. No checksum — a truncated R2 fetch or partial B2 PUT was marked done.
--
-- Design:
--   - public.backup_jobs: one row per named job (currently 'storage-mirror').
--     Workers acquire the lease with try_acquire_backup_lease() which only
--     succeeds when the lease is free or expired (atomic UPDATE ... WHERE).
--     Lease default: 10 minutes, heartbeat via acquired_at/expires_at.
--   - media_assets.backup_sha256 / backup_verified_at: SHA-256 of the exact
--     bytes pushed to B2 + when the verify job confirmed B2 matches.

-- 1. Integrity columns on media_assets (backed_up_at already exists in init schema).
alter table public.media_assets
  add column if not exists backup_sha256 text,
  add column if not exists backup_verified_at timestamptz;

-- 2. Named job lease table.
create table if not exists public.backup_jobs (
  job_name text primary key,
  locked_by text,
  locked_at timestamptz,
  lease_expires_at timestamptz,
  last_run_at timestamptz,
  last_run_result jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.backup_jobs enable row level security;

-- Service-role only: no public policies (cron uses service role). Revoke anon/authenticated.
revoke all on public.backup_jobs from anon, authenticated;

insert into public.backup_jobs (job_name)
values ('storage-mirror')
on conflict (job_name) do nothing;

-- 3. Atomic lease acquisition. Returns true iff this caller now holds the lease.
create or replace function public.try_acquire_backup_lease(
  p_job_name text,
  p_owner text,
  p_lease_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
begin
  update public.backup_jobs
  set locked_by = p_owner,
      locked_at = v_now,
      lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
      updated_at = v_now
  where job_name = p_job_name
    and (lease_expires_at is null or lease_expires_at <= v_now);
  return found;
end;
$$;

create or replace function public.release_backup_lease(
  p_job_name text,
  p_owner text,
  p_result jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.backup_jobs
  set locked_by = null,
      lease_expires_at = null,
      last_run_at = now(),
      last_run_result = coalesce(p_result, last_run_result),
      updated_at = now()
  where job_name = p_job_name
    and locked_by = p_owner;
end;
$$;

-- 4. Helpful indexes for the mirror + verify queries.
create index if not exists media_assets_backup_pending_idx
  on public.media_assets (created_at) where backed_up_at is null;
create index if not exists media_assets_backup_unverified_idx
  on public.media_assets (backed_up_at) where backed_up_at is not null and backup_verified_at is null;
