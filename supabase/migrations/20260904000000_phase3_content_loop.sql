-- ============================================================================
-- Eagle Eye Africa — Phase 3: close the content loop
--
-- 1. Scheduled publishing + listing expiry: due `scheduled` items flip to
--    `published` and overdue active listings flip to `expired` every 5
--    minutes via pg_cron when the extension is available (defensive: skipped
--    silently otherwise). The admin content page runs the same sweep on every
--    load as a code-level fallback.
-- 2. Session-client write grants: admin Server Functions run on the RLS-bound
--    session client. The staff policies in the init schema gate the rows, but
--    PostgREST also enforces table grants, so every table those functions
--    write to needs an explicit grant for `authenticated` (same pattern as
--    20260903000000_admin_polls_fundraisers.sql).
-- 3. Corrections get guest contact columns (mirroring submissions) so
--    anonymous correction requests can be followed up by the editorial team.
--
-- Run in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to run twice (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Guest contact columns on corrections
-- ---------------------------------------------------------------------------
alter table public.corrections
    add column if not exists reporter_name text,
    add column if not exists reporter_email citext;

-- ---------------------------------------------------------------------------
-- 2. Write grants for the staff session client
-- ---------------------------------------------------------------------------
grant update on public.submissions to authenticated;
grant insert on public.moderation_log to authenticated;
grant insert, update on public.content_items to authenticated;
grant insert, update, delete on public.content_translations to authenticated;
grant insert, update, delete on public.media_assets to authenticated;
grant insert, update on public.notices to authenticated;
grant insert, update on public.listings to authenticated;
grant update on public.reports to authenticated;
grant update on public.corrections to authenticated;

-- Queue indexes for the trust & safety lists
create index if not exists reports_status_idx on public.reports (status, created_at desc);
create index if not exists corrections_status_idx on public.corrections (status, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Scheduled publishing + listing expiry sweep (pg_cron, every 5 minutes)
-- ---------------------------------------------------------------------------
do $$
begin
    create extension if not exists pg_cron;
exception
    when others then
        raise notice 'pg_cron unavailable (%), skipping the scheduled-publishing job', sqlerrm;
end $$;

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
               and scheduled_for <= now();

            update public.listings
               set listing_status = 'expired'
             where listing_status = 'active'
               and exists (
                   select 1 from public.content_items c
                    where c.id = listings.content_item_id
                      and c.expires_at is not null
                      and c.expires_at <= now()
               );
        $job$
    );
exception
    when others then
        raise notice 'could not schedule eea-scheduled-content (%), skipping', sqlerrm;
end $$;