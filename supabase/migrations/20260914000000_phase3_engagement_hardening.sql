-- Phase 3 Engagement hardening: RLS policies and performance indexes for polls and fundraisers.

-- 1. Ensure RLS policies for polls and poll_options
drop policy if exists "Staff can update polls" on public.polls;
create policy "Staff can update polls"
    on public.polls for update
    using (public.is_staff());

drop policy if exists "Admin can delete polls" on public.polls;
create policy "Admin can delete polls"
    on public.polls for delete
    using (public.is_admin());

drop policy if exists "Staff manage poll options" on public.poll_options;
drop policy if exists "Staff read poll options" on public.poll_options;
create policy "Staff read poll options"
    on public.poll_options for select
    using (public.is_staff());
drop policy if exists "Staff insert poll options" on public.poll_options;
create policy "Staff insert poll options"
    on public.poll_options for insert
    with check (public.is_staff());
drop policy if exists "Staff update poll options" on public.poll_options;
create policy "Staff update poll options"
    on public.poll_options for update
    using (public.is_staff()) with check (public.is_staff());
drop policy if exists "Staff delete poll options" on public.poll_options;
create policy "Staff delete poll options"
    on public.poll_options for delete
    using (public.is_staff());

-- Poll options remain addressable after draft reordering and labels are unique
-- within each poll, case-insensitively.
create unique index if not exists poll_options_poll_label_unique
    on public.poll_options (poll_id, lower(label));

-- Fundraiser amounts are monotonic and supported currencies are explicit.
do $$ begin
    alter table public.fundraisers add constraint fundraisers_amounts_nonnegative
        check (coalesce(goal_amount, 0) >= 0 and raised_amount >= 0);
exception when duplicate_object then null; end $$;
do $$ begin
    alter table public.fundraisers add constraint fundraisers_currency_supported
        check (currency in ('XAF', 'EUR', 'USD', 'GBP'));
exception when duplicate_object then null; end $$;

alter table public.fundraisers
    add column if not exists payout_method text,
    add column if not exists payout_account text,
    add column if not exists payout_account_name text;

do $$ begin
    alter table public.fundraisers add constraint fundraisers_payout_method_valid
        check (payout_method is null or payout_method in ('momo', 'bank'));
exception when duplicate_object then null; end $$;

create or replace function public.complete_fundraiser_when_goal_reached()
returns trigger
language plpgsql
as $$
begin
    if new.goal_amount is not null and new.raised_amount >= new.goal_amount then
        new.closed_at = coalesce(new.closed_at, now());
    end if;
    return new;
end;
$$;

drop trigger if exists fundraiser_goal_reached on public.fundraisers;
create trigger fundraiser_goal_reached
    before insert or update of goal_amount, raised_amount on public.fundraisers
    for each row execute function public.complete_fundraiser_when_goal_reached();

-- 2. Indexes for poll votes and fundraiser lookups
create index if not exists poll_votes_poll_id_idx
    on public.poll_votes (poll_id);

create index if not exists poll_votes_option_id_idx
    on public.poll_votes (option_id);

create index if not exists fundraisers_content_item_id_idx
    on public.fundraisers (content_item_id);
