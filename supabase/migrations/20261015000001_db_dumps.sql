-- Phase 5 — Database dump tracking (audit A12).
-- Records each nightly pg_dump run for audit trail and retention policy.

create table if not exists public.db_dumps (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  sha256 text not null,
  size_bytes bigint not null,
  created_at timestamptz not null default now(),
  correlation_id text,
  -- Retention: 30 days by default; the cleanup job deletes older rows + B2 objects.
  expires_at timestamptz not null default (now() + interval '30 days')
);

create index if not exists db_dumps_created_at_idx
  on public.db_dumps (created_at);

alter table public.db_dumps enable row level security;
-- Service role only (cron job uses service role). No public read.
revoke all on public.db_dumps from anon, authenticated;