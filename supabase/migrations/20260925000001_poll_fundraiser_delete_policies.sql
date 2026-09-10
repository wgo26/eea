-- ============================================================================
-- Eagle Eye Africa — Poll & fundraiser delete policies (admin command center)
--
-- Why this exists (admin "can't delete the dummy content" / polls deleted
-- from the command center keep reappearing):
--  1. `poll_votes` never had a staff SELECT or DELETE policy, so the
--     session-client ballot count in `deletePoll` always undercounted to 0
--     (the admin-override guard never fired) and the explicit vote cleanup
--     was RLS-blocked. The server action now deletes through the
--     service-role client, but the session-client path is hardened here too
--     (defense in depth: page guard → action check → RLS).
--  2. `fundraisers` shipped a "Staff manage fundraisers" FOR ALL policy but
--     only SELECT (+ later UPDATE) grants — the session client could never
--     DELETE a campaign row directly.
--
-- Separate from the public demo-poll fallback removal (lib/queries/polls.ts
-- no longer renders hardcoded polls when the table is empty): that fixed
-- the "deleted polls still show up" half; this fixes the "cannot delete"
-- half.
--
-- Safe to run twice (idempotent: DROP POLICY IF EXISTS + grants).
-- ============================================================================

-- Staff can read ballots (needed for counts/exports); only admins delete them.
drop policy if exists "Staff read poll votes" on public.poll_votes;
create policy "Staff read poll votes"
    on public.poll_votes for select
    using (public.is_staff());

drop policy if exists "Admin delete poll votes" on public.poll_votes;
create policy "Admin delete poll votes"
    on public.poll_votes for delete
    using (public.is_admin());

-- The session client needs explicit grants; RLS above still gates every row.
grant select, delete on public.poll_votes to authenticated;

-- Close the fundraisers grant gap (policy already allows staff FOR ALL).
grant delete on public.fundraisers to authenticated;
