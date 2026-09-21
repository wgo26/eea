-- Phase 5 — Legacy URL redirects (audit A14).
-- Blogger-era URLs (/YYYY/MM/slug.html) need to resolve to their new canonical
-- localized paths. The blogger import stores the original path; we surface it
-- via a dedicated column and a lightweight redirect table for O(1) lookup.

-- 1. Column on content_items to store the original Blogger path.
--    Nullable because native content has no legacy URL.
alter table public.content_items
  add column if not exists legacy_path text;

-- Helpful index for the proxy lookup (only ~1-2k rows will have a value).
create index if not exists content_items_legacy_path_idx
  on public.content_items (legacy_path) where legacy_path is not null;

-- 2. A dedicated redirect table for O(1) proxy lookup without joins.
--    Mirrors the LEGACY_REDIRECTS map in proxy.ts but sourced from DB.
create table if not exists public.legacy_redirects (
  from_path text primary key,      -- e.g. /2020/10/my-post.html
  to_path   text not null,         -- e.g. /news/my-post  (locale-free)
  created_at timestamptz not null default now()
);

-- RLS: public read for the proxy (service role writes).
alter table public.legacy_redirects enable row level security;
create policy "public read legacy redirects"
  on public.legacy_redirects for select
  to anon, authenticated
  using (true);

-- 3. Backfill from existing blogger imports stored in moderation_log.notes.
--    The import stores: "source=/2020/10/post-title.html" in notes.
--    We extract the path and upsert into legacy_redirects.
--    This is idempotent; safe to re-run.
do $$
declare
  v_rec record;
begin
  for v_rec in
    select
      ci.id,
      ci.slug,
      ci.type,
      regexp_replace(ml.notes, '^.*source=([^ ]+).*$', '\1') as legacy
    from public.content_items ci
    join public.moderation_log ml on ml.content_item_id = ci.id
    where ml.action = 'content:import'
      and ml.notes like '%source=%'
      and ci.legacy_path is null
  loop
    -- Only proceed if the extracted legacy path looks like a blogger URL
    if v_rec.legacy ~ '^/\d{4}/\d{2}/.+\.html?$' then
      update public.content_items
      set legacy_path = v_rec.legacy
      where id = v_rec.id;

      -- Map to the new canonical path (locale-free, proxy will add locale)
      -- news → /news/{slug}, photo_story → /photo-stories/{slug}, etc.
      declare
        v_target text;
      begin
        case v_rec.type
          when 'news'        then v_target := '/news/' || v_rec.slug;
          when 'photo_story' then v_target := '/photo-stories/' || v_rec.slug;
          when 'culture'     then v_target := '/culture/' || v_rec.slug;
          when 'notice'      then v_target := '/notices/' || v_rec.slug;
          when 'listing'     then v_target := '/buy-sell/' || v_rec.slug;
          else v_target := '/news/' || v_rec.slug;
        end case;

        insert into public.legacy_redirects (from_path, to_path)
        values (v_rec.legacy, v_target)
        on conflict (from_path) do update set to_path = excluded.to_path;
      end;
    end if;
  end loop;
end $$;