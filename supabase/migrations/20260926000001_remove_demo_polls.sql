-- ============================================================================
-- Eagle Eye Africa — Remove the legacy demo polls
--
-- 20260902000000_community_polls.sql originally seeded 3 hardcoded demo polls
-- ('mankon-market-priority', 'rainy-season-readiness', 'what-to-cover-next').
-- They were demo content, never editorial: the news page rendered them as
-- if they were real community polls. Polls are now created by staff from
-- /admin/polls and published through the normal workflow, so this migration
-- deletes the demo rows (options/votes cascade from poll_id) from databases
-- that already ran the old seeder. Idempotent: no rows matching the slugs →
-- no-op. Anything NOT matching these exact slugs is never touched.
-- ============================================================================

delete from public.polls
where slug in ('mankon-market-priority', 'rainy-season-readiness', 'what-to-cover-next');