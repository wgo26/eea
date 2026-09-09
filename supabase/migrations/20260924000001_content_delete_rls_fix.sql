-- Admin hard-delete RLS fix — the admin_delete_content_item RPC
-- (security invoker, migrations/20260915000000) also deletes from
-- public.reports and public.saved_content, but those tables had no
-- admin delete policy, so the RPC failed with an RLS violation
-- ("new row violates row-level security policy") whenever seeded/dummy
-- content had reports or saves by other users. Idempotent; safe to re-run.

-- Reports: admins may remove reports attached to deleted content.
drop policy if exists "Admin delete reports" on public.reports;
create policy "Admin delete reports"
    on public.reports for delete
    using (public.is_admin());

-- Saved content: admins may clear saves referencing deleted content
-- (the "Own saved content" policy only lets each user delete their own rows).
drop policy if exists "Admin delete saved content" on public.saved_content;
create policy "Admin delete saved content"
    on public.saved_content for delete
    using (public.is_admin());