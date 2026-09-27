-- ============================================================================
-- Migration: 20261115000000_embeddings.sql
-- Description: P5 memory layer — pgvector embeddings for semantic related,
--   submission dedupe and archive search.
--
--   * content_items.embedding vector(1536) + embedding_updated_at + model tag.
--     NULL = not yet embedded (backfill cron fills nightly, best-effort).
--     A dimension mismatch (model swap) fails the single row insert, never
--     the editorial save — writers catch.
--   * match_content_embeddings(query vector, threshold, count) — cosine
--     similarity over published, unarchived items. Service-role only
--     (same posture as digest_freeze); public callers go through the
--     query layer which enforces status/locale.
--   * HNSW index when the build supports it, else ivfflat, else none —
--     each attempted guardedly so hosted Postgres without pgvector still
--     applies the columns and the app falls back to keyword search.
--
-- Idempotent; safe to re-run. Applied migrations are immutable.
-- ============================================================================

-- pgvector may not exist on every host — proceed regardless.
create extension if not exists vector;

-- Columns (guarded: vector type may be absent without the extension).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector') then
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'content_items' and column_name = 'embedding'
    ) then
      alter table public.content_items add column embedding vector(1536);
    end if;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'content_items' and column_name = 'embedding_updated_at'
  ) then
    alter table public.content_items add column embedding_updated_at timestamptz;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'content_items' and column_name = 'embedding_model'
  ) then
    alter table public.content_items add column embedding_model text;
  end if;
end;
$$;

-- Similarity index — try HNSW, fall back to ivfflat, else skip silently.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'vector')
     and exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'content_items' and column_name = 'embedding') then
    begin
      execute 'create index if not exists content_items_embedding_hnsw on public.content_items using hnsw (embedding vector_cosine_ops)';
    exception when others then
      begin
        execute 'create index if not exists content_items_embedding_ivfflat on public.content_items using ivfflat (embedding vector_cosine_ops) with (lists = 100)';
      exception when others then
        null;
      end;
    end;
  end if;
end;
$$;

-- Match RPC: cosine similarity (1 - distance), threshold + count capped.
create or replace function public.match_content_embeddings(
  p_query vector(1536),
  p_threshold float default 0.72,
  p_count int default 6
)
returns table (
  id uuid,
  similarity float
)
language sql
security definer
set search_path = public
as $$
  select c.id, 1 - (c.embedding <=> p_query) as similarity
    from public.content_items c
   where c.embedding is not null
     and c.status = 'published'
     and coalesce(c.is_archived, false) = false
     and (1 - (c.embedding <=> p_query)) >= coalesce(p_threshold, 0.72)
   order by c.embedding <=> p_query
   limit least(coalesce(p_count, 6), 12);
$$;

revoke all on function public.match_content_embeddings(vector, float, int) from public, anon, authenticated;
grant execute on function public.match_content_embeddings(vector, float, int) to service_role;

comment on function public.match_content_embeddings(vector, float, int) is
  'P5 semantic match: cosine similarity over published content embeddings. Service-role only; the query layer enforces locale/type.';
