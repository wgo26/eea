-- ============================================================================
-- Migration: 20261030000000_admin_widget_layouts.sql
-- Description: Per-user dashboard widget layout (plan Phase 4.4, spec §35).
--
--   Spec §35 asks for a modular dashboard: widgets can be added, removed and
--   reordered, and the arrangement survives a reload. Widgets themselves are
--   implemented in code (components/admin/widget-system.tsx registry) because a
--   widget is a query + a render, not data — what has to persist is only the
--   *arrangement*: which widget ids a user keeps, and in what order.
--
--   One row per user (unique user_id). No row = the role defaults from
--   DEFAULT_WIDGET_LAYOUTS, so a new admin inherits a sensible dashboard and
--   "reset" is a DELETE rather than a re-seed.
--
--   `role` records the legacy app_role the layout was composed under. It is
--   not authorization: it lets the reader notice a role change and fall back to
--   the new role's defaults instead of serving an editor's layout to an
--   advertiser. Widget ids are NOT validated by a constraint — the registry
--   owns the vocabulary, and an id that no longer exists is dropped at read
--   time (a widget removed from the code must not make a saved layout invalid).
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS); safe to re-run.
-- Rules: applied migrations are immutable — repairs always append new files.
-- ============================================================================

create table if not exists public.admin_widget_layouts (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references public.profiles (id) on delete cascade,
    role       text not null check (role in ('admin', 'editor', 'contributor', 'advertiser')),
    -- Ordered array of widget ids, e.g. ["operational-alerts","pending-submissions"].
    widgets    jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id)
);

create index if not exists admin_widget_layouts_user_idx
    on public.admin_widget_layouts (user_id);

alter table public.admin_widget_layouts enable row level security;

-- A dashboard layout is personal configuration, not shared operational state:
-- a user reads their own row. Every write goes through the service-role client
-- in lib/admin/actions/widgets.ts, which derives the user from the session —
-- there is no INSERT/UPDATE policy, so a cookie-scoped client cannot write one
-- user's layout on another's behalf.
drop policy if exists "Users read own widget layout" on public.admin_widget_layouts;
create policy "Users read own widget layout"
    on public.admin_widget_layouts for select using (user_id = auth.uid());
