-- ============================================================================
-- Migration: 20261110000000_plugin_state_seeds.sql
-- Description: Install the remaining plugin states — HOLIDAY and
--              ELECTION_PERIOD rows (mirroring lib/platform/states/*.ts) plus
--              the annual Holiday window schedule (20 Dec – 5 Jan).
--
--   * The manifests exist in code but were never seeded and
--     `ensurePluginStatesRegistered()` had no call-site, so both states were
--     effectively commented out. The rows below match the manifests exactly
--     (precedence 11/14, `seasonal` profile, manual+scheduled activation);
--     re-runs update config columns only and never touch `active`.
--   * Election dates vary per cycle, so ELECTION_PERIOD ships with NO
--     schedule: the chief creates one per election from /admin/states
--     (see docs/system/states.md).
--
-- Idempotent (ON CONFLICT); safe to re-run. Applied migrations are
-- immutable — repairs always append.
-- ============================================================================

insert into public.system_states (
    id, name, severity, active, precedence, visual_profile,
    affected_modules, behavior_profile, accessibility_profile
)
values
(
    'HOLIDAY',
    'Holiday season',
    'info',
    false,
    11,
    'seasonal',
    '{home,culture,listings}',
    '{"navigation":"standard","notifications":"standard","contentPriority":"community","motion":"subtle"}'::jsonb,
    'standard'
),
(
    'ELECTION_PERIOD',
    'Election period',
    'info',
    false,
    14,
    'seasonal',
    '{home,news,notices,polls}',
    '{"navigation":"standard","notifications":"elevated","contentPriority":"civic","motion":"subtle"}'::jsonb,
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

-- The Holiday window, 20 December – 5 January (wraps the new year; the
-- `state-schedules` cron evaluates wrap windows, see seasonal-window.ts).
insert into public.state_schedules (state_id, label, start_month, start_day, end_month, end_day, enabled)
values ('HOLIDAY', 'Holiday season (20 Dec – 5 Jan)', 12, 20, 1, 5, true)
on conflict (state_id, start_month, start_day, end_month, end_day) do nothing;
