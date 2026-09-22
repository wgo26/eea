-- Phase 2: close the ad-beacon live-check-then-write race.
--
-- The beacon route (app/api/ads/event/route.ts) SELECTs the campaign status
-- then RPCs the increment — a status flip between the two round-trips could
-- accrue events to a paused/ended campaign. The SELECT stays as a fast-path
-- (stale pages get 202 without a write), but the RPC is now the source of
-- truth: it re-checks `status = 'active'` inside the same function and
-- no-ops when the campaign is not live. Single statement, no new tables.
-- Idempotent via CREATE OR REPLACE.

create or replace function public.increment_ad_event(
    p_campaign_id uuid,
    p_event_type text,
    p_session_hash text default null,
    p_metadata jsonb default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if p_event_type not in ('impression', 'click') then raise exception 'Invalid ad event'; end if;
    -- Atomic live guard: only active campaigns accrue rows + counters.
    -- Ended/paused/inquiry rows are acknowledged without a write.
    if not exists (
        select 1 from public.ad_campaigns where id = p_campaign_id and status = 'active'
    ) then
        return;
    end if;
    insert into public.ad_events(campaign_id, event_type, session_hash, metadata)
    values (p_campaign_id, p_event_type, p_session_hash, p_metadata);
    if p_event_type = 'impression' then
        update public.ad_campaigns set impressions_count = impressions_count + 1 where id = p_campaign_id;
    else
        update public.ad_campaigns set clicks_count = clicks_count + 1 where id = p_campaign_id;
    end if;
end;
$$;
