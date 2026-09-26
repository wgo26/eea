-- ============================================================================
-- Location publish integrity (Tier-3 floor for the place taxonomy)
-- ----------------------------------------------------------------------------
-- The public site promises place hubs, location facets and the Near You rail;
-- all of them are only honest when published content carries a location_id.
-- This migration makes the location a hard precondition of the *transition
-- into* the published state, enforced at the database level, which closes
-- every write path at once (admin drawer, status dropdown, moderation
-- approve, owner renew, seeds, direct SQL):
--
--   * BEFORE INSERT/UPDATE guard on content_items rejects rows that newly
--     enter status 'published' with location_id IS NULL. Transition-only:
--     edits that keep a row published (e.g. a typo fix on a legacy row from
--     before this rule) never trip it, so the guard cannot deadlock the
--     edit path.
--
-- Two documented exemptions — shapes that are deliberately NOT place
-- coverage and must publish even with location_id NULL:
--   * official emergency alerts (notices.is_official): region-wide by
--     design, rendered in the global emergency band;
--   * fundraisers (fundraisers row): funding campaigns shown in the news
--     sidebar rail, keyed by goal/progress, never by place.
-- The exemption checks run against already-existing extension rows, so both
-- write paths must create the detail row BEFORE flipping status to
-- published (emergency.publish already does; createFundraiser is reordered
-- to match in this same change).
--
-- Application-layer guards (validateContentDraft, setContentStatus,
-- saveContentItem) produce friendly errors ahead of this; the trigger is the
-- invariant, not the UX.
--
-- The scheduled-publish cron (20260904000000) is rescheduled with a
-- `location_id is not null` guard so a locationless scheduled row stays
-- scheduled (and visible in the admin queue) instead of erroring the job.
--
-- Idempotent (CREATE OR REPLACE / DROP TRIGGER IF NOT EXISTS / re-unschedule
-- + schedule). Applied migrations are immutable — this file repairs forward.
-- ============================================================================

create or replace function public.enforce_location_on_publish()
returns trigger
language plpgsql
-- security definer: the exemption checks read notices/fundraisers, which a
-- session client may not see under RLS (same pattern as the digest trigger,
-- 20261105000000_digest_slots.sql).
security definer
set search_path = public
as $$
begin
    if new.status = 'published'
       and new.location_id is null
       and not coalesce(new.is_archived, false)
       and (
           tg_op = 'INSERT'
           or old.status is distinct from new.status
           -- Stripping the location off a live published row is also a
           -- violation (legacy locationless rows stay editable: null→null).
           or old.location_id is not null
       )
    then
        -- Exempted shapes: official emergency alerts and fundraisers.
        if not exists (
            select 1
            from public.notices n
            where n.content_item_id = new.id
              and n.is_official
        ) and not exists (
            select 1
            from public.fundraisers f
            where f.content_item_id = new.id
        ) then
            raise exception
                'Content item % cannot be published without a location (place pages and filters depend on it)',
                coalesce(new.slug, new.id::text);
        end if;
    end if;
    return new;
end;
$$;

drop trigger if exists content_items_location_publish_guard on public.content_items;
create trigger content_items_location_publish_guard
    before insert or update of status, location_id on public.content_items
    for each row
    execute function public.enforce_location_on_publish();

comment on function public.enforce_location_on_publish() is
  'DB invariant: newly-published content must carry location_id. Exempt: official emergency notices (region-wide by design). Transition-only so legacy rows stay editable. App-layer validation gives friendly errors first.';

-- ---------------------------------------------------------------------------
-- Reschedule the publish sweep with the same invariant: flip scheduled →
-- published ONLY for rows that can pass the trigger. Locationless scheduled
-- rows are left in place (admin sees them in the scheduled queue with a
-- validation error if they try to force-publish).
-- ---------------------------------------------------------------------------
do $$
  begin
    perform cron.unschedule('eea-scheduled-content');
  exception
      when others then null;
  end $$;

do $$
begin
    perform cron.schedule(
        'eea-scheduled-content',
        '*/5 * * * *',
        $job$
            update public.content_items
               set status = 'published',
                   published_at = coalesce(published_at, now()),
                   updated_at = now()
             where status = 'scheduled'
               and scheduled_for is not null
               and scheduled_for <= now()
               and location_id is not null;

            update public.listings
               set listing_status = 'expired'
             where listing_status = 'active'
               and exists (
                   select 1
                     from public.content_items c
                    where c.id = listings.content_item_id
                      and c.expires_at is not null
                      and c.expires_at <= now()
               );
        $job$
    );
exception
    when others then
        raise notice 'could not reschedule eea-scheduled-content (%), skipping', sqlerrm;
end $$;
