-- Command-center foundations for monetization, people, and operations.

alter table public.profiles
    add column if not exists is_suspended boolean not null default false,
    add column if not exists is_banned boolean not null default false,
    add column if not exists contributor_featured boolean not null default false,
    add column if not exists contributor_bio_override text;

alter table public.ad_campaigns
    add column if not exists impressions_count bigint not null default 0,
    add column if not exists clicks_count bigint not null default 0,
    add column if not exists rejection_reason text,
    add column if not exists approved_at timestamptz,
    add column if not exists approved_by uuid references public.profiles (id) on delete set null;

alter table public.moderation_log
    add column if not exists request_id text,
    add column if not exists ip_hash text;

create table if not exists public.ad_inquiry_events (
    id uuid primary key default gen_random_uuid(),
    campaign_id uuid not null references public.ad_campaigns (id) on delete cascade,
    actor_id uuid references public.profiles (id) on delete set null,
    event_type text not null check (event_type in ('received', 'approved', 'rejected', 'updated')),
    reason text,
    created_at timestamptz not null default now()
);

create index if not exists ad_inquiry_events_campaign_idx on public.ad_inquiry_events (campaign_id, created_at desc);
create index if not exists ad_campaigns_status_dates_idx on public.ad_campaigns (status, starts_at, ends_at);

alter table public.ad_inquiry_events enable row level security;
drop policy if exists "Admins read ad inquiry events" on public.ad_inquiry_events;
create policy "Admins read ad inquiry events" on public.ad_inquiry_events for select using (public.is_admin());
drop policy if exists "Admins write ad inquiry events" on public.ad_inquiry_events;
create policy "Admins write ad inquiry events" on public.ad_inquiry_events for all using (public.is_admin()) with check (public.is_admin());

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
    insert into public.ad_events(campaign_id, event_type, session_hash, metadata)
    values (p_campaign_id, p_event_type, p_session_hash, p_metadata);
    if p_event_type = 'impression' then
        update public.ad_campaigns set impressions_count = impressions_count + 1 where id = p_campaign_id;
    else
        update public.ad_campaigns set clicks_count = clicks_count + 1 where id = p_campaign_id;
    end if;
end;
$$;

create or replace function public.expire_ad_campaigns()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
    update public.ad_campaigns
       set status = 'ended', updated_at = now()
     where status = 'active'
       and ((ends_at is not null and ends_at <= now()));
    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

create index if not exists media_assets_storage_key_idx on public.media_assets (storage_key);
