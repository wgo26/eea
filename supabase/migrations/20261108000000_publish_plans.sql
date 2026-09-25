-- ============================================================================
-- Migration: 20261108000000_publish_plans.sql
-- Description: Stream C (C1) + Stream E (E1/E2) groundwork, and the D2
-- escalation columns on the notification centre.
--
--   * publish_plans — editor-defined release schedules over recap templates
--     (C1/C2): when due, the publish-plans cron compiles the template into a
--     draft; `auto-schedule` plans additionally flip that draft to
--     status='scheduled' at run_time + lead_minutes, letting the existing
--     pg_cron publisher take it live. `draft-only` plans leave the draft for
--     human review (automation prepares, humans ship). Three consecutive
--     failures self-disable the plan and raise an escalation notification.
--   * app_flags — service-role-only key/value store for automation verdicts
--     (E2: the winning digest pitch variant). Same no-policy posture as
--     analytics_daily: only the admin client can touch it.
--   * cron_heartbeats — E1: every scheduled job stamps a row; /api/ready
--     reports staleness and the admin templates page shows a status strip.
--   * admin_notifications.escalation_key / .escalated_at — D2: critical
--     alerts sharing a key escalate to a "no response" follow-up once when
--     nobody in the whole roster has read any copy within the window.
--   * fundraisers.milestones_reached — E7: which 25/50/75/100 % notices have
--     already fired (idempotent milestone pushes).
--   * Two-person control: plans with auto-schedule need a second admin —
--     enforced in the action layer (TWO_PERSON_ACTIONS['content.autopublish']),
--     no schema change needed.
--
-- Idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS / ON CONFLICT); safe
-- to re-run. Applied migrations are immutable — repairs always append.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. publish_plans
-- ---------------------------------------------------------------------------
create table if not exists public.publish_plans (
    id            uuid primary key default gen_random_uuid(),
    name          text not null,
    template_id   uuid not null references public.content_templates (id) on delete cascade,
    horizon       text not null check (horizon in ('daily', 'weekly')),
    -- 0 = Sunday … 6 = Saturday; required when horizon = 'weekly', null daily.
    day_of_week   smallint check (day_of_week between 0 and 6),
    -- UTC wall-clock "HH:MM" the plan fires (compile; publish = + lead_minutes).
    run_time      text not null check (run_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
    lead_minutes  integer not null default 60 check (lead_minutes between 5 and 1440),
    review_mode   text not null default 'draft-only' check (review_mode in ('draft-only', 'auto-schedule')),
    enabled       boolean not null default true,
    next_run_at   timestamptz not null,
    last_run_at   timestamptz,
    last_status   text check (last_status in ('ok', 'empty', 'failed')),
    last_error    text,
    failure_count integer not null default 0,
    created_by    uuid references public.profiles (id) on delete set null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    check (horizon <> 'weekly' or day_of_week is not null)
);

create index if not exists publish_plans_due_idx
    on public.publish_plans (next_run_at)
    where enabled = true;

alter table public.publish_plans enable row level security;

drop policy if exists "Staff read publish plans" on public.publish_plans;
create policy "Staff read publish plans"
    on public.publish_plans for select
    using (public.is_staff());

drop policy if exists "Staff manage publish plans" on public.publish_plans;
create policy "Staff manage publish plans"
    on public.publish_plans for all
    using (public.is_staff()) with check (public.is_staff());

drop trigger if exists publish_plans_touch on public.publish_plans;
create trigger publish_plans_touch before update on public.publish_plans
    for each row execute function public.update_updated_at_column();

comment on table public.publish_plans is
  'Editor release plans over recap templates (C1): due rows compile a draft; auto-schedule plans queue it for the pg_cron publisher.';

-- ---------------------------------------------------------------------------
-- 2. app_flags — automation verdicts (service-role only, no policies)
-- ---------------------------------------------------------------------------
create table if not exists public.app_flags (
    key        text primary key,
    value      jsonb not null,
    updated_at timestamptz not null default now()
);

alter table public.app_flags enable row level security;
-- No SELECT policy by design: only the service role (cron, admin queries)
-- reads flags, same posture as analytics_daily (20261022000000).

comment on table public.app_flags is
  'Server-side automation verdicts (digest pitch default winner …). Service-role only by design — no anon/authenticated policies.';

-- ---------------------------------------------------------------------------
-- 3. cron_heartbeats — E1 scheduler visibility
-- ---------------------------------------------------------------------------
create table if not exists public.cron_heartbeats (
    job          text primary key,
    last_success timestamptz,
    last_run_at  timestamptz not null default now(),
    last_status  text not null default 'ok' check (last_status in ('ok', 'failed')),
    last_error   text,
    runs         bigint not null default 1
);

alter table public.cron_heartbeats enable row level security;
-- Service-role only: no policies for anon/authenticated. The admin status
-- strip reads through createAdminClient (lib/automation/heartbeat.ts).

create or replace function public.cron_heartbeat(p_job text, p_ok boolean, p_error text default null)
returns void
language sql
security definer
set search_path = public
as $$
    insert into public.cron_heartbeats (job, last_success, last_run_at, last_status, last_error, runs)
    values (p_job, case when p_ok then now() else null end, now(), case when p_ok then 'ok' else 'failed' end, left(p_error, 500), 1)
    on conflict (job) do update set
        last_success = case when p_ok then now() else cron_heartbeats.last_success end,
        last_run_at  = now(),
        last_status  = case when p_ok then 'ok' else 'failed' end,
        last_error   = case when p_ok then null else left(p_error, 500) end,
        runs         = cron_heartbeats.runs + 1;
$$;

revoke all on function public.cron_heartbeat(text, boolean, text) from public, anon, authenticated;
grant execute on function public.cron_heartbeat(text, boolean, text) to service_role;

comment on function public.cron_heartbeat(text, boolean, text) is
  'Stamp one scheduled-job heartbeat. Service-role only; called at the end of every cron route (E1).';

-- ---------------------------------------------------------------------------
-- 4. Notification centre escalation (D2)
-- ---------------------------------------------------------------------------
alter table public.admin_notifications
    add column if not exists escalation_key text,
    add column if not exists escalated_at   timestamptz;

create index if not exists admin_notifications_escalation_idx
    on public.admin_notifications (escalation_key)
    where category = 'critical' and escalation_key is not null and escalated_at is null;

-- Register the automation producer in the source registry (FK requires it).
insert into public.admin_notification_sources (key, label, description)
values
    ('automation', 'Automation', 'Digests, recap templates, release plans, and the auto-ops sweep.')
on conflict (key) do update set
    label = excluded.label,
    description = excluded.description;

-- ---------------------------------------------------------------------------
-- 5. Fundraiser milestone ledger (E7)
-- ---------------------------------------------------------------------------
alter table public.fundraisers
    add column if not exists milestones_reached text[] not null default '{}';

comment on column public.fundraisers.milestones_reached is
  'Threshold labels already notified ("25", "50", "75", "100") — idempotent milestone pushes (E7).';
