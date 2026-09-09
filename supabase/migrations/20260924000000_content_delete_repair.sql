-- ============================================================================
-- Eagle Eye Africa — Content hard-delete repair
--
-- Why this exists (admin "can't delete the dummy content"):
--  1. admin_delete_content_item was SECURITY INVOKER, so every explicit
--     DELETE inside it was still subject to the caller's RLS policies.
--     Tables like saved_content (owner-only ALL), reports / corrections /
--     takedowns (staff UPDATE-only, no DELETE policy) made the RPC fail with
--     "new row violates row-level security policy" as soon as an item had a
--     save, a report, or similar activity — the exact state demo/seeded items
--     accumulate. FK cascades would have handled most children on their own
--     (cascades bypass RLS), but the explicit RLS-gated deletes ran first and
--     aborted the transaction.
--  2. The function never touched polls.content_item_id (SET NULL FK),
--     reports / takedown_requests history, daily_brief_items or
--     content_relationships explicitly, leaving behavior to implicit FK
--     actions per table.
--
-- Fix: run the cleanup as SECURITY DEFINER (owner bypasses RLS) with an
-- explicit is_admin() guard inside, nullify audit/history FKs (submissions,
-- homepage_slots, polls, reports, takedowns, moderation history stays), and
-- let true CASCADE children (translations, media, type rows, tags, saves,
-- corrections, brief items, relationships) delete via explicit statements
-- that now succeed regardless of caller RLS.
--
-- Safe to run twice (idempotent: CREATE OR REPLACE + grants).
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
    if not public.is_admin() then
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

-- The session client calls this via supabase.rpc(); it needs EXECUTE.
grant execute on function public.admin_delete_content_item(uuid, uuid, text) to authenticated;

-- Session-client table grants for the pre-RPC storage cleanup in
-- deleteContentItem (media_assets read/delete already granted; keep the
-- delete grant explicit so the R2 bookkeeping read never 403s).
grant select, delete on public.media_assets to authenticated;
grant select on public.content_items to authenticated;
