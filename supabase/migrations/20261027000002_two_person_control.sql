-- ============================================================================
-- Migration: 20261027000002_two_person_control.sql
-- Description: Two-person control approvals (plan Phase 2.3, spec §44).
--
--   Sensitive operations (production secret revocation, global branding
--   changes, critical-mode activation, destructive data operations,
--   permission escalation, authentication configuration) require a second
--   administrator's signature. A request is created by the acting admin
--   (actor_id) and recorded as `pending`; a DIFFERENT admin approves or
--   rejects it, and only then may the gated action proceed.
--
--   `action` is the gated operation key (see lib/admin/two-person-control.ts
--   TWO_PERSON_ACTIONS), `resource_type`/`resource_id` point at the target,
--   `expires_at` bounds how long a pending request may sit before it is
--   treated as expired (requests must not become standing authorizations).
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS); safe to re-run.
-- Rules: applied migrations are immutable — repairs always append new files.
-- ============================================================================

create table if not exists public.two_person_approvals (
    id            uuid primary key default gen_random_uuid(),
    action        text not null,
    actor_id      uuid not null references public.profiles (id) on delete cascade,
    resource_type text not null,
    resource_id   text,
    reason        text,
    approver_id   uuid references public.profiles (id) on delete set null,
    status        text not null default 'pending',
    created_at    timestamptz not null default now(),
    expires_at    timestamptz not null,
    responded_at  timestamptz
);

create index if not exists two_person_approvals_pending_idx
    on public.two_person_approvals (status, created_at desc);

alter table public.two_person_approvals enable row level security;

-- Only the two involved admins see a row. Unassigned pending requests are
-- visible to admins at large — that is what makes the shared approval queue
-- (spec §44) discoverable; once an approver responds, the row narrows back to
-- the two participants.
drop policy if exists "Participants read approvals" on public.two_person_approvals;
create policy "Participants read approvals"
    on public.two_person_approvals for select
    using (
        actor_id = auth.uid()
        or approver_id = auth.uid()
        or (approver_id is null and status = 'pending' and public.is_admin())
    );
