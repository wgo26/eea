-- ============================================================================
-- Migration: 20261002000001_homepage_slots_slot_key_multi.sql
-- Description: Allow multiple homepage_slots rows per slot_key.
--
-- Why this exists:
--   The application data model treats slot_key as a *group* key, not a
--   unique key: the homepage (lib/queries/home.ts) reads ALL active rows
--   with slot_key in ('hero', 'secondary') and renders every 'secondary'
--   row as an entry of the featured carousel, ordered by sort_order.
--   setContentFeatured() inserts one 'secondary' row per featured item, and
--   the homepage-curation UI lets staff create several slots sharing a key.
--   The repository init schema (20260901000000) correctly declares slot_key
--   as plain `text not null` (no unique constraint).
--
--   However, at least one production database carries a UNIQUE constraint
--   named homepage_slots_slot_key_key on that column (likely added by hand
--   in the dashboard), so featuring a second story fails with:
--     duplicate key value violates unique constraint
--     "homepage_slots_slot_key_key"
--   ...while the first feature keeps working, which makes the failure look
--   intermittent.
--
-- What this does:
--   Drops the stray unique constraint (and, defensively, a standalone
--   unique index of the same name if the constraint form is absent).
--   Idempotent and safe to re-run; a no-op where the constraint was never
--   added.
--
-- Rules:
--   * Applied migrations are immutable — repairs always append new files.
-- ============================================================================

alter table public.homepage_slots
    drop constraint if exists homepage_slots_slot_key_key;

drop index if exists public.homepage_slots_slot_key_key;
