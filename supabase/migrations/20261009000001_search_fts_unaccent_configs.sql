-- ============================================================================
-- Eagle Eye Africa — A5 FTS fix: unaccent-aware configs (2026-09-19)
--
-- Follow-up to 20261009000000: stock english/french configs do not unaccent,
-- so ts_headline() re-parsing the raw title/excerpt never highlighted an
-- accented term ("ecole" matched "école" but produced no <mark>). These
-- copies route tokens through the unaccent dictionary first; the vector
-- column and search_content() are rebuilt on top of them so matching,
-- ranking AND highlighting all agree on accents.
-- ============================================================================

create text search dictionary public.unaccent_dict (
    template = unaccent,
    rules = 'unaccent'
);

create text search configuration public.en_unaccent (copy = english);
alter text search configuration public.en_unaccent
    alter mapping for asciiword, asciihword, hword_asciipart, hword, hword_part, word
    with public.unaccent_dict, english_stem;

create text search configuration public.fr_unaccent (copy = french);
alter text search configuration public.fr_unaccent
    alter mapping for asciiword, asciihword, hword_asciipart, hword, hword_part, word
    with public.unaccent_dict, french_stem;

-- Generated expressions cannot be altered in place: drop + re-add. The table
-- rewrite also backfills every existing row under the new config.
alter table public.content_translations drop column if exists search_vector;
alter table public.content_translations
    add column search_vector tsvector generated always as (
        to_tsvector(
            case when locale = 'fr' then 'public.fr_unaccent'::regconfig else 'public.en_unaccent'::regconfig end,
            coalesce(title, '') || ' ' || coalesce(excerpt, '')
        )
    ) stored;

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
            case when p_locale = 'fr' then 'public.fr_unaccent'::regconfig else 'public.en_unaccent'::regconfig end,
            coalesce(p_q, '')
        ) as q
    )
    select
        ci.id as item_id,
        ts_rank_cd(ct.search_vector, tsq.q)::real as rank,
        ts_headline(
            case when p_locale = 'fr' then 'public.fr_unaccent'::regconfig else 'public.en_unaccent'::regconfig end,
            coalesce(ct.title, ''),
            tsq.q,
            'StartSel=<mark>, StopSel=</mark>, MaxWords=12, MinWords=4'
        ) as headline_title,
        ts_headline(
            case when p_locale = 'fr' then 'public.fr_unaccent'::regconfig else 'public.en_unaccent'::regconfig end,
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

grant execute on function public.search_content(text, text, text[], text, text, timestamptz, timestamptz, int) to anon, authenticated, service_role;
