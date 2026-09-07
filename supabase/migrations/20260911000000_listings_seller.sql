-- ============================================================================
-- Eagle Eye Africa — Listings seller columns (missing on live DB)
--
-- Live listings table lacks seller_name / seller_is_verified (init_schema
-- has them, but the hosted DB was seeded before they existed). Add them
-- idempotently so createContentItem / saveContentItem can persist the seller
-- name again after this ships.
--
-- Run in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- Safe to run twice (idempotent).
-- ============================================================================

alter table public.listings
  add column if not exists seller_name text,
  add column if not exists seller_is_verified boolean not null default false;
