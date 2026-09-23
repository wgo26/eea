-- ============================================================================
-- Fix: admin_delete_content_item is_admin() check fails with service-role client
--
-- Root cause: deleteContentItem (lib/admin/actions.ts) calls the RPC via
-- createAdminClient() (service-role). The RPC's is_admin() guard uses
-- auth.uid() which returns NULL under the service-role client, so the check
-- always fails and raises 'Admin permission required' — even for real admins.
--
-- Fix: use the p_actor_id parameter (already passed from the server action,
-- already verified by assertAdmin() in TypeScript) for the admin-exists check
-- instead of auth.uid(). The service-role client bypasses RLS via
-- SECURITY DEFINER, so the explicit admin check on p_actor_id is the only
-- authorization boundary and must be correct.
--
-- Safe to run twice. Idempotent: CREATE OR REPLACE.
-- ============================================================================

create or replace function public.admin_delete_content_item(
    p_content_item_id uuid,
    p_actor_id uuid,
    p_note text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    -- Validate the actor is an admin (replaces is_admin() which relies on
    -- auth.uid() — unavailable under the service-role client).
    if not (
        select exists (
            select 1 from public.user_roles
            where user_id = p_actor_id
              and role = 'admin'
        )
    ) then
        raise exception 'Admin permission required';
    end if;

    -- Guard: nothing to do if the actor happens to be null.
    if p_actor_id is null then
        raise exception 'Admin permission required';
    end if;

    -- History / nullable references: keep the audit trail, break the link.
    update public.submissions
       set content_item_id = null
     where content_item_id = p_content_item_id;

    update public.homepage_slots
       set content_item_id = null
     where content_item_id = p_content_item_id;

    update public.polls
       set content_item_id = null
     where content_item_id = p_content_item_id;

    update public.reports
       set content_item_id = null
     where content_item_id = p_content_item_id;

    update public.takedown_requests
       set content_item_id = null
     where content_item_id = p_content_item_id;

    update public.moderation_log
       set content_item_id = null
     where content_item_id = p_content_item_id;

    -- Engagement / join rows (no audit value once the item is gone).
    delete from public.saved_content where content_item_id = p_content_item_id;
    delete from public.content_tags where content_item_id = p_content_item_id;
    delete from public.content_relationships
     where source_content_id = p_content_item_id
        or target_content_id = p_content_item_id;
    delete from public.daily_brief_items where content_item_id = p_content_item_id;
    delete from public.corrections where content_item_id = p_content_item_id;
    delete from public.submission_media
     where media_id in (
        select id from public.media_assets where content_item_id = p_content_item_id
     );

    -- Type-extension + media rows (FKs would cascade these anyway; explicit
    -- deletes keep the order deterministic under the definer).
    delete from public.events where content_item_id = p_content_item_id;
    delete from public.listings where content_item_id = p_content_item_id;
    delete from public.notices where content_item_id = p_content_item_id;
    delete from public.fundraisers where content_item_id = p_content_item_id;
    delete from public.media_text_variants
     where media_id in (
        select id from public.media_assets where content_item_id = p_content_item_id
     );
    delete from public.media_assets where content_item_id = p_content_item_id;
    delete from public.content_translations where content_item_id = p_content_item_id;

    insert into public.moderation_log (
        action, actor_id, entity_type, entity_id, notes
    ) values (
        'content:delete', p_actor_id, 'content_item', p_content_item_id, p_note
    );

    delete from public.content_items where id = p_content_item_id;
    if not found then
        raise exception 'Content item not found';
    end if;
end;
$$;

-- Re-grant EXECUTE for authenticated callers (same as the original migration).
grant execute on function public.admin_delete_content_item(uuid, uuid, text) to authenticated;
