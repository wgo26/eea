-- Media assets: URL-pasted photos are link-only rows (no stored object).
--
-- The repo schema declares storage_key nullable, but the live database
-- enforces NOT NULL (drift applied outside migrations), so every post with
-- a pasted photo URL fails with "Could not save photos: null value in
-- column storage_key violates not-null constraint". Align the database with
-- the schema contract: link-only rows carry public_url with a null
-- storage_key (deleteStoredMedia + deleteMediaAsset already handle null
-- keys by skipping provider deletion).
--
-- Idempotent: dropping a not-null constraint that is already gone is an
-- error, so guard with a catalog check. Safe to re-run.
do $$
begin
    if exists (
        select 1
        from pg_attribute
        where attrelid = 'public.media_assets'::regclass
          and attname = 'storage_key'
          and attnotnull
    ) then
        alter table public.media_assets alter column storage_key drop not null;
    end if;
end
$$;
