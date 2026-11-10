-- ============================================================================
-- Eagle Eye Africa — Location depth & path maintenance trigger
--
-- Auto-maintains `depth` and `path` on locations when rows are inserted or
-- parent_id changes. The materialized path is what makes ancestor / descendant
-- queries fast without recursive CTEs.
--
-- Safe to run twice.
-- ============================================================================

create or replace function public.recalculate_location_depth_path()
returns trigger language plpgsql as $$
declare
    v_parent_depth integer;
    v_parent_path uuid[];
begin
    -- Root location: depth 0, path = [self]
    if new.parent_id is null then
        new.depth := 0;
        new.path := array[new.id];
    else
        -- Look up parent's depth + path
        select depth, path into v_parent_depth, v_parent_path
        from public.locations
        where id = new.parent_id;

        if not found then
            -- Parent doesn't exist (shouldn't happen due to FK, but be safe)
            new.depth := 0;
            new.path := array[new.id];
        else
            new.depth := v_parent_depth + 1;
            new.path := v_parent_path || new.id;
        end if;
    end if;

    return new;
end
$$;

create trigger trg_locations_depth_path
    before insert or update of parent_id, id on public.locations
    for each row
    execute function public.recalculate_location_depth_path();

-- Backfill any rows that might have null depth/path (e.g. created before the
-- trigger existed, or where the earlier migration's backfill missed edge cases).
update public.locations
set depth = 0,
    path = array[id]
where parent_id is null and (depth is null or path is null or array_length(path, 1) is null);

do $$
begin
    -- Single pass: propagate depth/path down the tree via recursive CTE.
    update public.locations l
    set depth = w.d,
        path = w.p
    from (
        with recursive walk as (
            select id, parent_id, 0 as d, array[id] as p
            from public.locations
            where parent_id is null
            union all
            select l.id, l.parent_id, w.d + 1, w.p || l.id
            from public.locations l
            join walk w on l.parent_id = w.id
        )
        select id, d, p from walk
    ) w
    where l.id = w.id;
end $$;
