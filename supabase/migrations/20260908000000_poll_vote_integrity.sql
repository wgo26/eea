-- ============================================================================
-- Eagle Eye Africa — Poll vote integrity
--
-- The base "Anyone can cast a vote" INSERT policy (community_polls migration)
-- accepts any ballot: votes on closed/inactive polls and option_ids from a
-- different poll both pass. The unique (poll_id, voter_token) constraint stops
-- double-voting but not these. This trigger rejects invalid ballots at the
-- database layer, so poll tallies stay trustworthy even against direct
-- anon-key API writes.
--
-- Run in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to run twice (idempotent).
-- ============================================================================

create or replace function public.reject_invalid_poll_vote()
returns trigger
language plpgsql
as $$
declare
    v_poll_id uuid;
    v_active boolean;
    v_closes_at timestamptz;
begin
    select id, is_active, closes_at
      into v_poll_id, v_active, v_closes_at
      from public.polls
     where id = new.poll_id;

    if v_poll_id is null then
        raise exception 'Poll does not exist';
    end if;

    if not v_active then
        raise exception 'Poll is closed';
    end if;

    if v_closes_at is not null and v_closes_at <= now() then
        raise exception 'Poll voting has ended';
    end if;

    if not exists (
        select 1 from public.poll_options
         where id = new.option_id
           and poll_id = new.poll_id
    ) then
        raise exception 'Option does not belong to this poll';
    end if;

    return new;
end;
$$;

drop trigger if exists poll_votes_validate on public.poll_votes;
create trigger poll_votes_validate
    before insert on public.poll_votes
    for each row execute function public.reject_invalid_poll_vote();
