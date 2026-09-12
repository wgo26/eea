-- ============================================================================
-- Migration: 20260929000000_content_translations_byline.sql
-- Description: Author byline for content translations.
--
-- Why this exists:
--   Imported posts (Blogger) and wire-style stories carry a human byline
--   ("By Wirngo Peter") that is not a site profile — content_items.author_id
--   stays null, so the public byline rendered nothing. The byline is
--   editorial text, so it lives on the translation row like title/excerpt.
-- ============================================================================

alter table public.content_translations
  add column if not exists byline text;

comment on column public.content_translations.byline is 'Human byline shown when the item has no profile author (imported posts). Null = fall back to author_id → profiles.display_name.';