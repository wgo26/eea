-- ============================================================================
-- Eagle Eye Africa — Admin polls & fundraisers management (Phase 2)
--
-- Staff (admin/editor) manage polls and fundraiser campaigns from the admin
-- command center. Admin Server Functions run on the RLS-bound session client
-- (defense in depth: page guard → action check → RLS), so they need:
--   • staff policies on polls + poll_options (read all rows, not just active)
--   • write grants for the authenticated role on polls/poll_options
--   • the missing UPDATE grant on fundraisers (policy exists, grant did not)
--
-- Run in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to run twice (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Staff policies on polls
--
-- RLS permissive policies are OR-combined, so the existing anon policies
-- ("read active polls") keep working for readers; staff simply see more.
-- ---------------------------------------------------------------------------
drop policy if exists "Staff manage polls" on public.polls;
create policy "Staff manage polls"
    on public.polls for all
    using (public.is_staff()) with check (public.is_staff());

drop policy if exists "Staff manage poll options" on public.poll_options;
create policy "Staff manage poll options"
    on public.poll_options for all
    using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------------
-- 2. Grants for the staff session client
--
-- Service-role reads bypass grants; the session client (authenticated) needs
-- them explicitly. RLS above still gates every write to staff.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.polls to authenticated;
grant select, insert, update, delete on public.poll_options to authenticated;

-- The init schema shipped the "Staff manage fundraisers" policy and a SELECT
-- grant, but no UPDATE grant — the session client cannot save campaign edits.
grant update on public.fundraisers to authenticated;