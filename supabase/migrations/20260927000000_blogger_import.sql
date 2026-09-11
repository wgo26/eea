-- Blogger post provenance.
-- The import keeps the source platform's publish dates in published_at
-- (drafts keep published_at NULL until a editor publishes them), so this
-- table only carries what the site otherwise cannot know.
alter table public.content_items
  add column if not exists import_source text,
  add column if not exists import_source_id text;

comment on column public.content_items.import_source is 'Origin of the row when imported (e.g. "blogger"); null for native content.';
comment on column public.content_items.import_source_id is 'Opaque id of the row in the source platform (e.g. the Blogger post id).';

-- One row per source post, whichever import run created it.
create unique index if not exists content_items_import_source_id_idx
  on public.content_items (import_source, import_source_id)
  where import_source is not null and import_source_id is not null;
