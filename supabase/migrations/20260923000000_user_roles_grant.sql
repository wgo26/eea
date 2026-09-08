-- Fix admin staying on Members Dashboard: allow the authenticated role to
-- read user_roles. The RLS policy "User roles are readable by staff"
-- (user_id = auth.uid() OR is_staff()) already permits self-read, but without
-- a GRANT the anon-key server/browser client gets "permission denied", so
-- getUserRoles() returns [] and every user looks like a member.
-- Safe to run twice (idempotent).
grant select on public.user_roles to authenticated;
