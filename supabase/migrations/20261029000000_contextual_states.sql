-- ============================================================================
-- Migration: 20261029000000_contextual_states.sql
-- Description: Contextual states — Back to School plugin row + scheduled
--              activation (plan Phase 4.1/4.2, spec §22/§23/§28/§64).
--
--   * system_states row for the BACK_TO_SCHOOL plugin state (spec §64). The
--     eight ladder states from spec §20 ship in 20261027000000; this is the
--     first *installable* state, registered by lib/platform/back-to-school.ts
--     and seeded here inactive so the cron (or an operator) turns it on.
--   * state_schedules — spec §28 scheduled activation. A recurring month/day
--     window per state; the `state-schedules` cron evaluates it and is the
--     only writer, recording what it did in last_action so an operator's
--     manual activation outside the window is never silently reverted.
--
-- DELIBERATE DEVIATION from docs/admin-project-plan.md Phase 4.1: the plan
-- lists a second `state_activations` table. Spec §27 already defines the store
-- of record — `system_states.active` + `precedence` — and
-- `system_state_events` already holds the activation history with actor and
-- reason. A third table would be a second source of truth for "what is on",
-- so it is intentionally not created; `state_schedules` covers the only
-- genuinely missing capability (scheduled entry/exit, spec §28).
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS / ON CONFLICT); safe to
-- re-run. Rules: applied migrations are immutable — repairs always append.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- BACK_TO_SCHOOL (spec §22/§23/§64)
-- ---------------------------------------------------------------------------
-- Config columns only: `active`, `activated_at/by` and `expires_at` are
-- runtime state, so re-running this file must never light the season up.
insert into public.system_states (
    id, name, severity, active, precedence, visual_profile,
    affected_modules, behavior_profile, accessibility_profile
)
values (
    'BACK_TO_SCHOOL',
    'Back to School',
    'info',
    false,
    12,
    'education-season',
    '{home,news,notices,listings}',
    '{"navigation":"standard","notifications":"elevated","contentPriority":"education-season","motion":"subtle"}'::jsonb,
    'standard'
)
on conflict (id) do update set
    name = excluded.name,
    severity = excluded.severity,
    precedence = excluded.precedence,
    visual_profile = excluded.visual_profile,
    affected_modules = excluded.affected_modules,
    behavior_profile = excluded.behavior_profile,
    accessibility_profile = excluded.accessibility_profile,
    updated_at = now();

-- ---------------------------------------------------------------------------
-- state_schedules (spec §28 scheduled activation)
-- ---------------------------------------------------------------------------
create table if not exists public.state_schedules (
    id            uuid primary key default gen_random_uuid(),
    state_id      text not null references public.system_states (id) on delete cascade,
    label         text not null,
    -- Month/day (not dates) so the window recurs annually without an edit;
    -- start > end wraps the new year (e.g. Dec 20 – Jan 10).
    start_month   smallint not null check (start_month between 1 and 12),
    start_day     smallint not null check (start_day between 1 and 31),
    end_month     smallint not null check (end_month between 1 and 12),
    end_day       smallint not null check (end_day between 1 and 31),
    enabled       boolean not null default true,
    -- Set by the cron only: `activated` is what lets the same cron later
    -- deactivate the season it started (and never one an operator started).
    last_action   text check (last_action in ('activated', 'deactivated')),
    last_run_at   timestamptz,
    created_by    uuid references public.profiles (id) on delete set null,
    created_at    timestamptz not null default now(),
    updated_at    timestamptz not null default now(),
    -- One window per state per shape: the seed below can re-run cleanly and a
    -- duplicate schedule cannot double-fire.
    unique (state_id, start_month, start_day, end_month, end_day)
);

create index if not exists state_schedules_state_idx
    on public.state_schedules (state_id, enabled);

alter table public.state_schedules enable row level security;

-- Reads are staff-visible (the operational-controls page lists them); writes
-- go through the service-role client behind `system.configure` (spec §28).
drop policy if exists "Staff read state schedules" on public.state_schedules;
create policy "Staff read state schedules"
    on public.state_schedules for select using (public.is_staff());

-- ---------------------------------------------------------------------------
-- Seed: the Back to School window, 1–30 September (spec §22)
-- ---------------------------------------------------------------------------
insert into public.state_schedules (state_id, label, start_month, start_day, end_month, end_day, enabled)
values ('BACK_TO_SCHOOL', 'Back to School season (1–30 September)', 9, 1, 9, 30, true)
on conflict (state_id, start_month, start_day, end_month, end_day) do nothing;
