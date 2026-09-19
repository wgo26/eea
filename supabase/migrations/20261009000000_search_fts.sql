-- ============================================================================
-- Eagle Eye Africa — A5 full-text search (2026-09-19)
--
-- Replaces ilike-substring matching (lib/queries/search.ts + the per-section
-- searchIds helpers) with ranked, accent-insensitive Postgres FTS plus
-- trigram typo tolerance:
--
--   1. pg_trgm + unaccent extensions.
--   2. public.immutable_unaccent() — unaccent() is only STABLE (it reads the
--      unaccent rules table), so a plain call cannot back a GENERATED column
--      or an index expression. This SQL wrapper is IMMUTABLE and safe.
--   3. content_translations.search_vector — GENERATED tsvector over
--      title + excerpt, unaccented, with the french config for fr rows and
--      english otherwise. Backfilled automatically (generated columns compute
--      on write; ALTER TABLE rewrites existing rows).
--   4. GIN indexes: search_vector (FTS), unaccented title trgm (typo
--      tolerance + suggest), locations name trgm (place suggest).
--   5. search_content() RPC — single ranked query (ts_rank_cd) with
--      ts_headline snippets, published-only, optional type filter.
--   6. suggest_content() RPC — prefix + trigram title matches for the
--      /api/search/suggest autocomplete (typo-tolerant, accent-insensitive).
--
-- "ecole" matches "école" (unaccent on both sides); "Bamenda 2026
-- infrastructure" ranks by term coverage instead of substring luck.
--
-- NOTE: the headline path here re-parses raw text with the stock configs,
-- which do not unaccent — accented terms match but do not highlight. Fixed
-- by 20261009000001 (unaccent-aware configs for vector + query + headline).
-- Idempotent (IF NOT EXISTS / CREATE OR REPLACE) so re-runs are safe.
-- ============================================================================

create extension if not exists "pg_trgm";
create extension if not exists "unaccent";

-- Immutable unaccent wrapper (see header note). Used by the trigram paths
-- (ILIKE / similarity), which have no text-search-config equivalent.
create or replace function public.immutable_unaccent(value text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
    select public.unaccent(value);
$$;

-- Generated FTS vector on translations (title + excerpt, unaccented,
-- locale-correct config). Rewrites the table once; thereafter maintained.
alter table public.content_translations
    add column if not exists search_vector tsvector generated always as (
        to_tsvector(
            case when locale = 'fr' then 'french'::regconfig else 'english'::regconfig end,
            public.immutable_unaccent(coalesce(title, '') || ' ' || coalesce(excerpt, ''))
        )
    ) stored;

create index if not exists content_translations_search_vector_idx
    on public.content_translations using gin (search_vector);

create index if not exists content_translations_title_trgm_idx
    on public.content_translations using gin (public.immutable_unaccent(title) gin_trgm_ops);

create index if not exists locations_name_trgm_idx
    on public.locations using gin (public.immutable_unaccent(name) gin_trgm_ops);

-- Ranked full-text search over published content. Called with the
-- service-role client (RLS bypass); grants below also expose it to the
-- PostgREST roles for future anon use.
create or replace function public.search_content(
    p_q text,
    p_locale text default 'en',
    p_types text[] default null,
    p_location text default null,
    p_category text default null,
    p_from timestamptz default null,
    p_to timestamptz default null,
    p_limit int default 60
)
returns table (
    item_id uuid,
    rank real,
    headline_title text,
    headline_excerpt text
)
language sql
stable
parallel safe
set search_path = public
as $$
    with tsq as (
        select plainto_tsquery(
            case when p_locale = 'fr' then 'french'::regconfig else 'english'::regconfig end,
            public.immutable_unaccent(coalesce(p_q, ''))
        ) as q
    )
    select
        ci.id as item_id,
        ts_rank_cd(ct.search_vector, tsq.q)::real as rank,
        ts_headline(
            case when p_locale = 'fr' then 'french'::regconfig else 'english'::regconfig end,
            coalesce(ct.title, ''),
            tsq.q,
            'StartSel=<mark>, StopSel=</mark>, MaxWords=12, MinWords=4'
        ) as headline_title,
        ts_headline(
            case when p_locale = 'fr' then 'french'::regconfig else 'english'::regconfig end,
            coalesce(ct.excerpt, ''),
            tsq.q,
            'StartSel=<mark>, StopSel=</mark>, MaxWords=24, MinWords=8'
        ) as headline_excerpt
    from public.content_translations ct
    join public.content_items ci on ci.id = ct.content_item_id
    cross join tsq
    where ct.locale = p_locale
      and ct.search_vector @@ tsq.q
      and ci.status = 'published'
      and ci.is_archived = false
      and ci.published_at is not null
      and (p_types is null or ci.type::text = any (p_types))
      and (p_location is null or exists (
              select 1 from public.locations loc
              where loc.id = ci.location_id and loc.slug = p_location
          ))
      and (p_category is null or exists (
              select 1 from public.categories cat
              where cat.id = ci.category_id and cat.slug = p_category
          ))
      and (p_from is null or ci.published_at >= p_from)
      and (p_to is null or ci.published_at <= p_to)
    order by rank desc, ci.published_at desc nulls last
    limit least(greatest(coalesce(p_limit, 60), 1), 200)
$$;

-- Typo-tolerant, accent-insensitive title autocomplete.
create or replace function public.suggest_content(
    p_q text,
    p_locale text default 'en',
    p_limit int default 8
)
returns table (
    item_id uuid,
    title text,
    item_type text,
    slug text
)
language sql
stable
parallel safe
set search_path = public
as $$
    with norm as (
        select public.immutable_unaccent(coalesce(p_q, '')) as nq
    )
    select
        ci.id as item_id,
        ct.title as title,
        ci.type::text as item_type,
        ci.slug as slug
    from public.content_translations ct
    join public.content_items ci on ci.id = ct.content_item_id
    cross join norm
    where ct.locale = p_locale
      and ct.title is not null
      and (
        public.immutable_unaccent(ct.title) ilike norm.nq || '%'
        or public.immutable_unaccent(ct.title) % norm.nq
      )
      and ci.status = 'published'
      and ci.is_archived = false
      and ci.published_at is not null
    order by
      (public.immutable_unaccent(ct.title) ilike norm.nq || '%') desc,
      similarity(public.immutable_unaccent(ct.title), norm.nq) desc,
      ci.published_at desc nulls last
    limit least(greatest(coalesce(p_limit, 8), 1), 20)
$$;

grant execute on function public.search_content(text, text, text[], text, text, timestamptz, timestamptz, int) to anon, authenticated, service_role;
grant execute on function public.suggest_content(text, text, int) to anon, authenticated, service_role;
grant execute on function public.immutable_unaccent(text) to anon, authenticated, service_role;
