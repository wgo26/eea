-- ============================================================================
-- Repair: content_translations voice column + triple unique constraint
--
-- Why this exists ("Could not save the en translation: there is no unique or
-- exclusion constraint matching the ON CONFLICT specification"):
--   The app upserts translations with onConflict 'content_item_id,locale,voice'
--   (lib/admin/actions.ts upsertTranslations, lib/admin/actions-import.ts),
--   which requires a UNIQUE constraint on exactly those three columns.
--   The repo's init schema declares unique (content_item_id, locale, voice),
--   but the remote database was built from an older revision of the init file
--   (edited in place instead of appended — see 20260920000001 drift repair),
--   so the remote still has the pre-voice shape: no voice column and/or only
--   unique (content_item_id, locale). Every publish / approve / save-content
--   call therefore fails on the translation upsert.
--
-- What this does (idempotent, safe to re-run on any revision of the remote):
--   1. Ensures the voice column exists with default 'formal' (the enum label
--      itself was backfilled by 20260920000001_remote_drift_repair.sql, so no
--      ALTER TYPE here — adding AND using an enum value in one transaction
--      is forbidden).
--   2. Backfills NULL voices and enforces NOT NULL + default.
--   3. Drops the legacy double unique so pidgin/camfranglais variants can
--      coexist with the formal row (the triple constraint still prevents two
--      formal rows per locale).
--   4. De-duplicates rows that would violate the triple unique (keeps the
--      most recently updated row per group).
--   5. Adds the triple unique constraint when missing.
-- ============================================================================

-- 1. Voice column (no-op when the remote already has it).
alter table public.content_translations
    add column if not exists voice public.voice_type not null default 'formal';

-- 2. Backfill + enforce (no-ops on a healthy database).
update public.content_translations set voice = 'formal' where voice is null;

alter table public.content_translations alter column voice set default 'formal';

do $$
begin
    begin
        alter table public.content_translations alter column voice set not null;
    exception when others then
        -- NULLs remain (unexpected) — leave the column nullable rather than
        -- aborting the whole migration; the upsert path still works.
        raise notice 'content_translations.voice kept nullable: %', SQLERRM;
    end;
end $$;

-- 3. Drop the legacy double unique (auto-name from the old inline declaration).
--    Kept rows stay unique per (item, locale) for the formal voice via the
--    triple constraint added below; other voices may now coexist.
alter table public.content_translations
    drop constraint if exists content_translations_content_item_id_locale_key;

-- 4. De-duplicate (keeps the most recently updated row per group).
delete from public.content_translations a
using public.content_translations b
where a.id <> b.id
  and a.content_item_id = b.content_item_id
  and a.locale = b.locale
  and a.voice = b.voice
  and (a.updated_at < b.updated_at
       or (a.updated_at = b.updated_at and a.id < b.id));

-- 5. Triple unique matching the app's onConflict specification.
do $$
begin
    if not exists (
        select 1 from pg_constraint
        where conname = 'content_translations_content_item_id_locale_voice_key'
    ) then
        alter table public.content_translations
            add constraint content_translations_content_item_id_locale_voice_key
            unique (content_item_id, locale, voice);
    end if;
end $$;
