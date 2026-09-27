-- ============================================================================
-- Migration: 20261114000000_intelligence_layer.sql
-- Description: Intelligence layer foundation + digest duplicate-proof.
--
--   * content_items.first_published_at — immutable first-go-live stamp.
--     published_at stays the display date (imports keep their source date);
--     first_published_at is what weekly/digest dedupe uses, so an EDIT to
--     an already-published row can never re-queue it as "today/this week".
--     Set once on the first transition INTO published, never overwritten.
--   * llm_calls — best-effort usage log for budget caps + evals
--     (action, model, tokens_in/out, latency_ms, status, content_item_id).
--     Service-role write, staff read. Missing table must never break
--     editorial actions (callers catch).
--   * digest_slots — add content_item_id covering index for the weekly
--     already-sent exclusion (no behavior change to the freeze RPC).
--
-- Idempotent; safe to re-run. Applied migrations are immutable — repairs
-- always append.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. first_published_at (immutable)
-- ---------------------------------------------------------------------------
alter table public.content_items
  add column if not exists first_published_at timestamptz;

-- Backfill: first go-live = current published_at where published.
update public.content_items
   set first_published_at = published_at
 where first_published_at is null
   and status = 'published'
   and published_at is not null;

create or replace function public.content_items_stamp_first_published()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- First transition INTO published stamps it; later edits (status stays
  -- published) and republishes never overwrite it.
  if new.status = 'published'
     and (old.status is distinct from new.status)
     and old.first_published_at is null
     and new.first_published_at is null then
    new.first_published_at := coalesce(new.published_at, now());
  end if;
  -- Guard: an edit must not clear or move the stamp.
  if old.first_published_at is not null
     and new.first_published_at is distinct from old.first_published_at then
    new.first_published_at := old.first_published_at;
  end if;
  return new;
end;
$$;

drop trigger if exists content_items_stamp_first_published on public.content_items;
create trigger content_items_stamp_first_published
  before insert or update of status, published_at, first_published_at on public.content_items
  for each row
  execute function public.content_items_stamp_first_published();

revoke all on function public.content_items_stamp_first_published() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. llm_calls usage log
-- ---------------------------------------------------------------------------
create table if not exists public.llm_calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  action text not null,
  model text not null,
  tokens_in integer,
  tokens_out integer,
  latency_ms integer,
  status text not null default 'ok',
  content_item_id uuid references public.content_items (id) on delete set null
);

create index if not exists llm_calls_day_idx on public.llm_calls (created_at desc);

alter table public.llm_calls enable row level security;

drop policy if exists "Staff read llm usage" on public.llm_calls;
create policy "Staff read llm usage"
  on public.llm_calls for select
  using (public.is_staff());

comment on table public.llm_calls is
  'Best-effort intelligence-layer usage log for daily budget caps and prompt evals. Writers catch failures — a missing table never blocks editorial work.';

-- ---------------------------------------------------------------------------
-- 3. digest_slots covering index for weekly already-sent exclusion
-- ---------------------------------------------------------------------------
create index if not exists digest_slots_item_sent_idx
  on public.digest_slots (content_item_id, sent_at)
  where removed = false;

-- ---------------------------------------------------------------------------
-- 4. Freeze RPC v2 — include content_item_id so callers can dedupe.
--    Old callers ignore the extra key (parseDigestFreeze tolerates it).
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
                       'shareText', s.share_text,
                       'contentItemId', s.content_item_id
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

revoke all on function public.digest_freeze(date) from public, anon, authenticated;
grant execute on function public.digest_freeze(date) to service_role;

-- ---------------------------------------------------------------------------
-- 5. AI kill-switch defaults (advisory — getAppFlag falls back when absent)
-- ---------------------------------------------------------------------------
insert into public.app_flags (key, value)
values
  ('ai.content_draft', 'true'),
  ('ai.translate', 'true'),
  ('ai.digest_intro', 'true'),
  ('ai.moderation_triage', 'false'),
  ('ai.media_qa', 'true')
on conflict (key) do nothing;
