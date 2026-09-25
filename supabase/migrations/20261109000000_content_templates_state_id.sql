-- ============================================================================
-- Migration: 20261109000000_content_templates_state_id.sql
-- Description: E6 — state-aware recap templates.
--
--   * content_templates.state_id — optional link to a system_state. When a
--     state is activated via state_schedules or the incident console, templates
--     whose state_id matches the newly active state are compiled (if their
--     cadence matches today). This lets editors prepare state-specific recaps
--     (e.g. "Back to School weekly recap") that only run during that season.
--   * When multiple states are active, the highest-priority state wins (per
--     the state engine). Templates with state_id = NULL are always compiled
--     (global/default templates).
--
-- Idempotent (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS); safe to re-run.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Add state_id to content_templates
-- ---------------------------------------------------------------------------
alter table if exists public.content_templates
    add column if not exists state_id text references public.system_states(id) on delete set null;

create index if not exists content_templates_state_id_idx
    on public.content_templates (state_id)
    where state_id is not null;

comment on column public.content_templates.state_id is
  'Optional system_state id. When this state is the highest-priority active state, the template is compiled. NULL = always compiled (global template).';

-- ---------------------------------------------------------------------------
-- 2. Update the cron trigger to consider state_id (done in app code)
-- ---------------------------------------------------------------------------
-- No DB changes needed here; the app's state-schedules cron will compile
-- matching templates when states activate/deactivate.