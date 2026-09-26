-- ============================================================================
-- Migration: 20261009000002_locations_slug_unique_repair.sql
-- Description: Restore the repo's `locations.slug` uniqueness contract.
--
-- Why this exists:
--   The repository contract (20260901000000_init_schema.sql) declares
--   `locations.slug text not null unique`. This live project was migrated
--   from an older revision of that file (see architecture-checklist.md §"Remote
--   migration drift repaired"), so it carries UNIQUE (slug, locale) instead —
--   `locations_slug_locale_key`.
--
--   Nothing noticed until 20261010000000_phase4_differentiators.sql tried to
--   declare its first cross-table key reference:
--     place_slug text not null references public.locations (slug)
--   A foreign key needs a UNIQUE *on exactly those columns*; (slug, locale)
--   does not qualify, so the whole Phase 4 migration aborted with
--     ERROR: there is no unique constraint matching given keys for referenced
--            table "locations" (SQLSTATE 42830)
--   and every migration after it (engagement tables, notifications centre,
--   profile avatars, content counters, templates, publish plans) rolled back
--   with it. A single drifted constraint therefore blocked the entire queue.
--
-- What this does:
--   Adds UNIQUE (slug). UNIQUE (slug, locale) is deliberately LEFT in place:
--   it becomes logically redundant once slug alone is unique, and dropping a
--   constraint that other tooling may reference is a bigger risk than the
--   leftover index.
--
-- Numbering:
--   20261009000002 sorts after the newest version recorded on this project
--   (20261009000001), so `db push` accepts it without --include-all, and
--   before 20261010000000, so it repairs the table in time for the Phase 4
--   foreign key.
--
-- Rules:
--   * Applied migrations are immutable — repairs always append new files.
--   * Idempotent, so it is a no-op on fresh databases built from
--     20260901000000_init_schema.sql (which already creates locations_slug_key).
-- ============================================================================

-- Guard first: a bare `create unique index` on a table with duplicate slugs
-- fails with an opaque 23505. Fail loudly with the reason instead.
do $$
begin
    if exists (
        select slug
        from public.locations
        group by slug
        having count(*) > 1
    ) then
        raise exception
            'locations.slug uniqueness repair aborted: duplicate slugs exist. '
            'Deduplicate public.locations before pushing, otherwise the Phase 4 '
            'user_place_preferences foreign key cannot be created.';
    end if;
end
$$;

-- `if not exists` matches the constraint name the init schema uses, so a
-- fresh database skips cleanly and both shapes end up with the same name.
create unique index if not exists locations_slug_key
    on public.locations (slug);

-- Document the leftover constraint, but only where it exists: COMMENT has no
-- IF NOT EXISTS, so an unconditional statement would abort this migration on a
-- fresh database built from 20260901000000_init_schema.sql (which never had it).
do $$
begin
    if exists (
        select 1 from pg_constraint
        where conrelid = 'public.locations'::regclass
          and conname = 'locations_slug_locale_key'
    ) then
        comment on constraint locations_slug_locale_key on public.locations is
            'Legacy (slug, locale) uniqueness from an older init_schema revision. '
            'Superseded by UNIQUE (slug) (20261009000002); kept because dropping it '
            'is riskier than the redundancy.';
    end if;
end
$$;
