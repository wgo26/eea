-- ============================================================================
-- Migration: 20261107000000_digest_personalization.sql
-- Description: Stream A (A6) + B (B2) groundwork appended after the digest
-- slots + templates migrations:
--
--   * digest_slots.location_id / .category_id — the publish trigger now also
--     snapshots the item's taxonomy so follow-based personalized briefs can
--     filter accumulated slots per reader without joining back to (possibly
--     edited) content. The trigger function is replaced to populate them;
--     the slot table + freeze RPCs are unchanged shape-wise.
--   * content_items.template_ledger — for living recap drafts (B2): the
--     source item ids already compiled into this draft. The compiler appends
--     only blocks whose id is NOT in the ledger, so an editor deleting a
--     block is a permanent editorial decision (never resurrected), while new
--     content in the window keeps flowing in. jsonb default '[]'; the column
--     is service-role-written (compiler) and staff-readable (RLS unchanged —
--     it rides the existing "Staff manage content" policies).
--
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER); safe to
-- re-run. Applied migrations are immutable — this file only appends.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Slot taxonomy snapshot for personal briefs (A6)
-- ---------------------------------------------------------------------------
alter table public.digest_slots
    add column if not exists location_id uuid references public.locations (id) on delete set null,
    add column if not exists category_id uuid references public.categories (id) on delete set null;

create or replace function public.digest_slot_for_item(p_item public.content_items)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_section text;
    v_segment text;
    v_date    date := (coalesce(p_item.published_at, now()) at time zone 'utc')::date;
    v_tx      record;
begin
    if p_item.is_archived then
        return;
    end if;

    v_section := case p_item.type
        when 'photo_story' then 'visual'
        when 'notice'      then 'notices'
        when 'listing'     then 'listings'
        when 'culture'     then 'culture'
        else 'community'   -- news, micro_story
    end;
    v_segment := case p_item.type
        when 'photo_story' then 'photo-stories'
        when 'notice'      then 'notices'
        when 'listing'     then 'buy-sell'
        when 'culture'     then 'culture'
        else 'news'
    end;

    for v_tx in
        select ct.locale,
               ct.title,
               nullif(ct.share_text, '') as share_text
          from public.content_translations ct
         where ct.content_item_id = p_item.id
           and nullif(ct.title, '') is not null
         order by ct.voice = 'formal' desc
    loop
        insert into public.digest_slots
            (issue_date, locale, content_item_id, item_type, section, path,
             title, share_text, rank_hint, location_id, category_id)
        values
            (v_date, v_tx.locale, p_item.id, p_item.type::text, v_section,
             '/' || v_segment || '/' || p_item.slug,
             left(v_tx.title, 120), v_tx.share_text,
             case when p_item.is_featured then 100 else 0 end,
             p_item.location_id, p_item.category_id)
        on conflict (issue_date, locale, content_item_id) do nothing;
    end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Living-recap compiled-id ledger (B2)
-- ---------------------------------------------------------------------------
alter table public.content_items
    add column if not exists template_ledger jsonb not null default '[]'::jsonb;

comment on column public.content_items.template_ledger is
  'Source content ids already compiled into a living recap draft (lib/content/templates-run.ts append-only guard). Empty for every non-draft row.';
