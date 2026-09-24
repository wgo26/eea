-- ============================================================================
-- Migration: 20261027000001_admin_roles.sql
-- Description: Fine-grained admin role assignments (plan Phase 2.1, spec §17).
--
--   user_admin_roles layers the spec §17 role model (super_admin,
--   platform_admin, editorial_admin, senior_editor, moderator,
--   marketplace_admin, media_admin, analyst, support_operator) on top of the
--   legacy public.app_role enum. The enum stays the coarse gate that decides
--   *whether* someone is staff (existing guards, RLS is_staff()/is_admin());
--   this table decides *what* within the admin area they may do.
--
--   Roles are stored as text rather than a new enum so the set can grow
--   (spec §17: "permissions should ultimately be capability-based") without
--   an enum migration. `expires_at` supports time-boxed grants (contractors,
--   incident rotation) — expired rows are ignored by getAdminRoles().
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS); safe to re-run.
-- Rules: applied migrations are immutable — repairs always append new files.
-- ============================================================================

create table if not exists public.user_admin_roles (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.profiles (id) on delete cascade,
    role        text not null,
    assigned_by uuid references public.profiles (id) on delete set null,
    assigned_at timestamptz not null default now(),
    expires_at  timestamptz,
    unique (user_id, role)
);

create index if not exists user_admin_roles_user_idx on public.user_admin_roles (user_id);

alter table public.user_admin_roles enable row level security;

-- Admins read the assignments (the users admin screen renders them); the
-- assignee may read their own rows so the UI can show "your role".
drop policy if exists "Admins read admin roles" on public.user_admin_roles;
create policy "Admins read admin roles"
    on public.user_admin_roles for select using (public.is_admin());

drop policy if exists "Users read own admin roles" on public.user_admin_roles;
create policy "Users read own admin roles"
    on public.user_admin_roles for select using (user_id = auth.uid());
