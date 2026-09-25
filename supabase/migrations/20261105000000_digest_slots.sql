-- ============================================================================
-- Migration: 20261105000000_digest_slots.sql
-- Description: Stream A (A1/A2) — accumulating daily digest.
--
--   * digest_slots — a staging row per (content item, locale) created the
--     moment an item becomes published, by a DB trigger. The trigger fires
--     inside EVERY publish path at once — the pg_cron `eea-scheduled-content`
--     publisher (20260904000000, raw SQL UPDATE), manual publishes in
--     lib/admin/actions/content.ts, and moderation approvals — so no app
--     code can miss an accumulation.
--   * Titles/share text are snapshotted at slot time from
--     content_translations (formal voice wins per locale, other voices as
--     fallback), so a later un-publiced or edited item still renders what
--     actually went live that day.
--   * digest_freeze(p_issue_date) — the RPC the 06:00 cron calls: returns the
--     ranked story snapshots per locale (pinned first, then rank_hint — a
--     featured item gets 100 at slot time — then oldest slot) for every slot
--     still open (sent_at null, not dropped). digest_mark_sent(p_issue_date)
--     stamps them after a successful fan-out so a re-run never re-sends;
--     failed deliveries leave slots open to roll into the next issue.
--   * digest_issues.cadence — groundwork for weekly recaps (A5): every daily
--     issue keeps 'daily'; the weekly job will insert 'weekly' rows. The
--     archive (public select RLS) may filter on it later.
--
--   * digest_slots is staff-visible/pin/drop only (is_staff() policies); the
--     public never reads slots, only the frozen digest_issues rows.
--   * The freeze RPC is service-role only (same posture as content_view_bump
--     in 20261104000000) — it runs as definer so the cron's admin client can
--     read/stamp slots regardless of RLS.
--
-- Idempotent (IF NOT EXISTS / DROP POLICY IF EXISTS / CREATE OR REPLACE /
-- ON CONFLICT DO NOTHING); safe to re-run. Rules: applied migrations are
-- immutable — repairs always append.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. digest_slots
-- ---------------------------------------------------------------------------
create table if not exists public.digest_slots (
    id              uuid primary key default gen_random_uuid(),
    issue_date      date not null,
    locale          text not null check (locale in ('en', 'fr')),
    content_item_id uuid not null references public.content_items (id) on delete cascade,
    item_type       text not null,
    -- Brief section key (lib/digest/brief.ts): visual | community | notices |
    -- listings | culture — computed from the content type at slot time.
    section         text not null check (section in ('visual', 'community', 'notices', 'listings', 'culture')),
    -- Locale-free section path (route's BRIEF_SEGMENT shape), e.g. '/news/slug'.
    path            text not null,
    title           text not null,
    share_text      text,
    -- Featured items rank above the rest; editors override with pinnings.
    rank_hint       integer not null default 0,
    pinned          boolean not null default false,
    removed         boolean not null default false,
    sent_at         timestamptz,
    created_at      timestamptz not null default now(),
    unique (issue_date, locale, content_item_id)
);

create index if not exists digest_slots_open_idx
    on public.digest_slots (issue_date, locale)
    where sent_at is null and removed = false;

alter table public.digest_slots enable row level security;

drop policy if exists "Staff read digest slots" on public.digest_slots;
create policy "Staff read digest slots"
    on public.digest_slots for select
    using (public.is_staff());

drop policy if exists "Staff pin or drop digest slots" on public.digest_slots;
create policy "Staff pin or drop digest slots"
    on public.digest_slots for update
    using (public.is_staff()) with check (public.is_staff());

comment on table public.digest_slots is
  'Accumulating daily-digest staging rows, one per (item, locale), written by the publish trigger; frozen into digest_issues by digest_freeze.';

-- ---------------------------------------------------------------------------
-- 2. Publish trigger — A2 append hook
-- ---------------------------------------------------------------------------
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
             title, share_text, rank_hint)
        values
            (v_date, v_tx.locale, p_item.id, p_item.type::text, v_section,
             '/' || v_segment || '/' || p_item.slug,
             left(v_tx.title, 120), v_tx.share_text,
             case when p_item.is_featured then 100 else 0 end)
        on conflict (issue_date, locale, content_item_id) do nothing;
    end loop;
end;
$$;

create or replace function public.digest_slot_on_publish()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if tg_op = 'INSERT' then
        if new.status = 'published' then
            perform public.digest_slot_for_item(new);
        end if;
    elsif new.status = 'published' and old.status is distinct from new.status then
        perform public.digest_slot_for_item(new);
    end if;
    return coalesce(new, old);
end;
$$;

drop trigger if exists digest_slot_on_publish on public.content_items;
create trigger digest_slot_on_publish
    after insert or update of status on public.content_items
    for each row
    execute function public.digest_slot_on_publish();

revoke all on function public.digest_slot_for_item(public.content_items) from public, anon, authenticated;
revoke all on function public.digest_slot_on_publish() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. digest_issues.cadence — weekly-recap groundwork (A5)
-- ---------------------------------------------------------------------------
alter table public.digest_issues
    add column if not exists cadence text not null default 'daily'
    check (cadence in ('daily', 'weekly'));

-- ---------------------------------------------------------------------------
-- 4. Freeze RPC — the 06:00 job's intake
-- ---------------------------------------------------------------------------
create or replace function public.digest_freeze(p_issue_date date)
returns jsonb
language sql
security definer
set search_path = public
as $$
    select coalesce(
        jsonb_object_agg(x.locale, x.stories),
        '{}'::jsonb
    )
    from (
        select s.locale,
               jsonb_agg(
                   jsonb_build_object(
                       'title', s.title,
                       'type', s.item_type,
                       'path', s.path,
                       'shareText', s.share_text
                   )
                   order by s.pinned desc, s.rank_hint desc, s.created_at asc
               ) as stories
          from public.digest_slots s
         where s.issue_date <= p_issue_date
           and s.sent_at is null
           and s.removed = false
         group by s.locale
    ) x;
$$;

create or replace function public.digest_mark_sent(p_issue_date date)
returns integer
language sql
security definer
set search_path = public
as $$
    with marked as (
        update public.digest_slots
           set sent_at = now()
         where issue_date <= p_issue_date
           and sent_at is null
           and removed = false
        returning 1
    )
    select count(*) from marked;
$$;

revoke all on function public.digest_freeze(date) from public, anon, authenticated;
revoke all on function public.digest_mark_sent(date) from public, anon, authenticated;
grant execute on function public.digest_freeze(date) to service_role;
grant execute on function public.digest_mark_sent(date) to service_role;

comment on function public.digest_freeze(date) is
  'Ranked unsent digest slot snapshots per locale as JSONB ({en:[{title,type,path,shareText}],fr:[...]}). Service-role only; called by the 06:00 ops-digest cron before delivery.';
comment on function public.digest_mark_sent(date) is
  'Stamps sent_at on the day''s unsent open slots after a successful fan-out so a re-run never re-sends. Returns marked row count. Service-role only.';

-- ---------------------------------------------------------------------------
-- 5. Backfill — the last 7 days of already-published items
-- ---------------------------------------------------------------------------
select public.digest_slot_for_item(c)
  from public.content_items c
 where c.status = 'published'
   and c.published_at >= now() - interval '7 days';
