-- ============================================================================
-- Eagle Eye Africa — the public correction register
--
-- The product promise is a *record*, not a feed: /about says "Corrections,
-- guidelines and takedowns are public policy — trust is built in the open".
-- Until now that sentence was contradicted by the data layer. The correction
-- loop was fully built on the INPUT side (corrections table, inline form on
-- news/[slug], guest receipt, staff alert, trust & safety resolve queue with
-- a resolution note) and completely absent on the OUTPUT side: the only
-- SELECT policy was "Reviewable corrections" for is_staff(), and no file
-- under lib/queries/ read the table at all. Corrections were collected,
-- adjudicated, then sealed.
--
-- This migration opens exactly one door: RESOLVED corrections become public,
-- PII-free, and joinable to the story they fix.
--
-- Design — a view, not a new policy on the table. This is the established
-- pattern here (poll_results in 20260902000000, content_reaction_counts in
-- 20261026000000): raw rows stay private, and readers get a projection that
-- cannot leak what it does not select. corrections carries reporter_email and
-- reporter_name (20260904000000) and reporter_id — none of which may ever
-- reach an anonymous reader. A column-level grant on the table would leave
-- that to discipline; the view makes it structurally impossible.
--
-- Decisions recorded here:
--   * status = 'resolved' only. 'dismissed' rows stay private — publishing
--     "we looked and disagreed" ships no `resolution` reasoning and turns a
--     correction trail into a disputes trail. Staff still see everything via
--     the existing is_staff() policy.
--   * Only corrections on live content appear (published + not archived), so
--     the register never advertises a story that no longer exists.
--   * correction_text IS published: a record that says "we changed it"
--     without saying what was wrong is a silent edit wearing a badge. The
--     text is what makes the trail accountable rather than cosmetic.
--
-- Run in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Safe to run twice (idempotent).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The public projection
-- ---------------------------------------------------------------------------
create or replace view public.published_corrections with (security_invoker = false) as
select
    c.id,
    c.content_item_id,
    ci.slug                        as content_slug,
    ci.type                        as content_type,
    -- English title preferred, any locale as fallback: the register is a
    -- list of links, and a blank row is worse than a cross-locale title.
    coalesce(
        (select nullif(btrim(en.title), '')
           from public.content_translations en
          where en.content_item_id = c.content_item_id
            and en.locale = 'en'
          limit 1),
        (select nullif(btrim(any_l.title), '')
           from public.content_translations any_l
          where any_l.content_item_id = c.content_item_id
          limit 1)
    )                              as content_title,
    c.correction_text,
    c.resolution,
    c.created_at                   as reported_at,
    c.resolved_at
from public.corrections c
join public.content_items ci on ci.id = c.content_item_id
where c.status = 'resolved'
  and c.resolved_at is not null
  and ci.status = 'published'
  and ci.is_archived = false;

comment on view public.published_corrections is
  'Reader-facing correction register: resolved corrections on live content, PII-free by construction (reporter_id/name/email are never selected). Backs /about/corrections and the per-story corrections block.';

-- The view is security_invoker = false, so it reads through its owner's
-- privileges and anon/authenticated need only SELECT on the view itself.
-- (Same shape as poll_results / content_reaction_counts.)
--
-- NOTE on the read path: lib/queries/corrections.ts reads the BASE table
-- through the service-role client and selects the same PII-free columns this
-- view declares. That is the house pattern, not an oversight — see
-- getContentReactionState() in lib/public/actions.ts: generated view types
-- only exist when the generator runs against a live schema, so a view read
-- would break `tsc` on DDL-only regeneration. The view is the machine-
-- checkable public contract (asserted in tests/integration/rls.test.ts);
-- the query layer is the caller. Keep the two column lists in step.
grant select on public.published_corrections to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Register read path
-- ---------------------------------------------------------------------------
-- Every register query filters status='resolved' and orders by resolved_at,
-- and the per-story block filters by content_item_id. The existing
-- corrections_status_idx (status, created_at desc) serves neither well.
create index if not exists corrections_resolved_idx
    on public.corrections (resolved_at desc)
    where status = 'resolved';

create index if not exists corrections_content_item_idx
    on public.corrections (content_item_id)
    where status = 'resolved';

-- ---------------------------------------------------------------------------
-- 3. Retire the "loop" About-section override
-- ---------------------------------------------------------------------------
-- The /about index no longer renders its own 8-step loop strip: it narrated
-- the same sighting->published journey as the 4-step verification pipeline,
-- from two angles, on one page. The pipeline (which carries the trust claim)
-- stays. about_sections has no FK or check constraint on section_key, so the
-- orphan rows are inert — but they are dead weight in the admin editor's
-- override list, so they go. Re-adding the key later restores dictionary
-- defaults, which is the same fallback an empty table already gives.
delete from public.about_sections where section_key = 'loop';

-- ---------------------------------------------------------------------------
-- 4. community_record_stats(): the About page's "record so far" numbers
-- ---------------------------------------------------------------------------
-- The service-role query in lib/queries/about.ts used to count raw inventory:
-- every row in `profiles` labelled "Contributors", every row in `locations`
-- (not even is_active-filtered) labelled "covered", and every fundraiser's
-- raised_amount fused into one number wearing whichever currency the last row
-- carried. Three of the four credibility figures were not evidence.
--
-- The RPC answers the questions the labels actually ask, in one round trip:
--   * contributors  — distinct authors of live, published content
--     (submitted_by OR author_id, so guest-migrated rows and staff rows
--     count, readers never do);
--   * places        — active locations that actually hold published content;
--   * stories       — published, unarchived, due items;
--   * corrections_30d — resolved corrections in the trailing window
--     (the accountability number /about now promotes);
--   * raised        — one total per currency (jsonb map); the app renders the
--     largest bucket and names it, instead of fusing FCFA with anything else.
--
-- SECURITY: stable + security definer + fixed search_path; execute is
-- revoked from everyone except service_role (same posture as the content
-- counter and maintenance RPCs). The app calls .rpc() with the admin client,
-- so nothing here changes the anon/authed privilege surface.
create or replace function public.community_record_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
    select jsonb_build_object(
        'stories_published', (
            select count(*)::integer from public.content_items
            where status = 'published'
              and not is_archived
              and published_at is not null
              and published_at <= now()
        ),
        'contributors', (
            select count(distinct author)::integer from (
                select submitted_by as author from public.content_items
                where status = 'published' and not is_archived and submitted_by is not null
                union
                select author_id as author from public.content_items
                where status = 'published' and not is_archived and author_id is not null
            ) authors
        ),
        'places_covered', (
            select count(distinct l.id)::integer
            from public.locations l
            join public.content_items ci on ci.location_id = l.id
            where l.is_active
              and ci.status = 'published'
              and not ci.is_archived
        ),
        'corrections_30d', (
            select count(*)::integer from public.corrections
            where status = 'resolved'
              and resolved_at >= now() - interval '30 days'
        ),
        'raised_by_currency', (
            select coalesce(jsonb_object_agg(currency, total), '{}'::jsonb)
            from (
                select upper(currency) as currency, sum(raised_amount)::numeric as total
                from public.fundraisers
                where raised_amount > 0
                group by upper(currency)
            ) per_currency
        )
    );
$$;

revoke all on function public.community_record_stats() from public, anon, authenticated;
grant execute on function public.community_record_stats() to service_role;

comment on function public.community_record_stats() is
  'Single-round-trip proof numbers for the /about record band: authors of live content, places holding live content, due published stories, resolved corrections in the trailing 30 days, and raised amounts grouped by currency (never fused). Service-role only.';
