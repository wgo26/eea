-- Hardening for monetization, people, and operations.

alter table public.ad_slots
    add column if not exists capacity integer not null default 1,
    add constraint ad_slots_capacity_positive check (capacity > 0);

alter table public.ad_campaigns
    add column if not exists budget_limit numeric,
    add column if not exists impression_limit bigint,
    add column if not exists click_limit bigint,
    add column if not exists creative_status text not null default 'pending',
    add column if not exists creative_rejection_reason text,
    add column if not exists expired_at timestamptz,
    add constraint ad_campaigns_budget_nonnegative check (budget_limit is null or budget_limit >= 0),
    add constraint ad_campaigns_impression_limit_positive check (impression_limit is null or impression_limit > 0),
    add constraint ad_campaigns_click_limit_positive check (click_limit is null or click_limit > 0),
    add constraint ad_campaigns_creative_status_valid check (creative_status in ('pending', 'approved', 'rejected'));

alter table public.profiles
    add column if not exists contributor_handle text,
    add column if not exists contributor_consent_at timestamptz,
    add column if not exists deleted_at timestamptz;

create unique index if not exists profiles_contributor_handle_idx
    on public.profiles (lower(contributor_handle))
    where contributor_handle is not null;

alter table public.media_assets
    add column if not exists checksum text,
    add column if not exists verification_status text not null default 'pending',
    add column if not exists verification_error text,
    add constraint media_assets_verification_status_valid check (verification_status in ('pending', 'verified', 'failed'));

alter table public.moderation_log
    add column if not exists entity_type text,
    add column if not exists entity_id uuid;

create table if not exists public.storage_tasks (
    id uuid primary key default gen_random_uuid(),
    media_id uuid references public.media_assets (id) on delete cascade,
    task_type text not null check (task_type in ('verify', 'backup', 'delete', 'orphan_scan')),
    status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
    attempts integer not null default 0 check (attempts >= 0),
    last_error text,
    created_at timestamptz not null default now(),
    completed_at timestamptz
);

create index if not exists storage_tasks_pending_idx on public.storage_tasks (status, created_at);

-- Prevent overlapping active campaigns beyond a slot's configured capacity.
create or replace function public.validate_ad_campaign_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    slot_capacity integer;
    concurrent_count integer;
begin
    if new.status <> 'active' or new.ad_slot_id is null then return new; end if;
    select capacity into slot_capacity from public.ad_slots where id = new.ad_slot_id;
    if slot_capacity is null then raise exception 'Ad slot does not exist'; end if;
    select count(*) into concurrent_count
      from public.ad_campaigns c
     where c.ad_slot_id = new.ad_slot_id
       and c.status = 'active'
       and c.id <> new.id
       and (new.starts_at is null or c.ends_at is null or c.ends_at > new.starts_at)
       and (new.ends_at is null or c.starts_at is null or c.starts_at < new.ends_at);
    if concurrent_count >= slot_capacity then
        raise exception 'Ad slot capacity exceeded for the selected dates';
    end if;
    return new;
end;
$$;

drop trigger if exists ad_campaign_capacity_trigger on public.ad_campaigns;
create trigger ad_campaign_capacity_trigger
before insert or update of ad_slot_id, status, starts_at, ends_at on public.ad_campaigns
for each row execute function public.validate_ad_campaign_capacity();

create or replace function public.expire_ad_campaigns()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer;
begin
    update public.ad_campaigns
       set status = 'ended', expired_at = now(), updated_at = now()
     where status = 'active'
       and ((ends_at is not null and ends_at <= now())
         or (impression_limit is not null and impressions_count >= impression_limit)
         or (click_limit is not null and clicks_count >= click_limit));
    get diagnostics v_count = row_count;
    return v_count;
end;
$$;

alter table public.storage_tasks enable row level security;
drop policy if exists "Admins manage storage tasks" on public.storage_tasks;
create policy "Admins manage storage tasks" on public.storage_tasks
    for all using (public.is_admin()) with check (public.is_admin());

-- Audit entries are append-only: staff may insert, nobody may update or delete.
drop policy if exists "Staff can write moderation log" on public.moderation_log;
create policy "Staff can write moderation log" on public.moderation_log
    for insert with check (public.is_staff());
drop policy if exists "Admins can modify moderation log" on public.moderation_log;