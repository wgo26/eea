/**
 * The seed runner: turns declarative pack rows into upserts, and records what it
 * wrote so teardown can undo exactly that.
 *
 * Two rules make a 40-pack catalogue safe:
 *
 *  1. A pack never chooses its own conflict target. The runner derives it from
 *     the table registry (lib/seed/tables.mjs), so "which row is this one?" is
 *     decided in one place and cannot drift between packs.
 *  2. A row whose primary key is a generated uuid gets that key set explicitly,
 *     derived from its natural key (naturalId / ctx.id). That is what lets the
 *     runner know the PK *before* the write — so --dry-run reports the ids a run
 *     would create, the manifest holds real keys, and a later pack in the same
 *     run can point a foreign key at an earlier pack's row with no re-read.
 *
 * The runner never deletes. Packs that must remove rows say so in their own
 * source, so destructive acts stay visible where they are reviewed.
 */

import { tableSpec } from "./tables.mjs";

/** Rows per write request; PostgREST handles this many comfortably. */
const DEFAULT_BATCH = 200;

/**
 * @typedef {object} WritePlan
 * @property {string} table
 * @property {Record<string, unknown>} row columns exactly as they go to PostgREST
 * @property {string[]} conflict the columns the upsert dedupes on
 * @property {boolean} nullableConflict true when `conflict` contains a null, so
 *   the row must be written insert-if-absent instead of upserted
 * @property {boolean} adopted true when the row already existed and this run only
 *   updated it — which forces `undo: "none"` so teardown cannot delete a row the
 *   seed did not create
 * @property {"delete"|"clear"|"none"} undo what teardown does with this row
 * @property {Record<string, unknown>} pk primary-key values, for the manifest
 * @property {string} [note]
 */

/**
 * Validate and normalise one pack's row specs into write plans. Pure — no
 * network — so tests can exercise the whole contract without a database.
 *
 * @param {import("./contract.mjs").SeedPack} pack
 * @param {Array<Record<string, any>>} specs what rows() returned
 * @param {import("./idmap.mjs").IdMap} ids
 * @returns {WritePlan[]}
 */
export function planRows(pack, specs, ids) {
    if (!Array.isArray(specs)) throw new Error(`${pack.id}: rows() must return an array`);
    const plans = [];
    const seen = new Set();

    for (const spec of specs) {
        const table = spec?.table;
        if (!table) throw new Error(`${pack.id}: a row spec is missing "table"`);
        if (!pack.tables.includes(table)) {
            throw new Error(`${pack.id}: writes to "${table}" but does not declare it in tables[]`);
        }
        const row = spec.row;
        if (!row || typeof row !== "object") {
            throw new Error(`${pack.id}: ${table} spec "${spec.note ?? "?"}" is missing "row"`);
        }
        const tspec = tableSpec(table);
        const natural = ids.keyColumns(table);
        const singleUuidPk = tspec.pk.length === 1 && !tspec.requiresPk;

        // Primary key resolution. Two rules, and they pull in opposite directions:
        //
        //   - An existing row must never be sent a DIFFERENT id. Rewriting a
        //     primary key fails as soon as any child row references it.
        //   - Every row in one batch must carry the SAME set of columns. PostgREST
        //     builds a single INSERT for the array, so an `id` missing from the
        //     first record arrives as NULL for every record — which is how a
        //     mixed batch of new and adopted rows dies with
        //     "null value in column \"id\" violates not-null constraint".
        //
        // ctx.id() returns the database's own id when the row exists and the
        // deterministic one when it does not, so always writing it satisfies both:
        // an adopt sends its existing id (the update sets id = id, a no-op that
        // cannot break a child's foreign key), and a new row arrives keyed.
        const filled = { ...row };
        let pkValue;
        let adopted = false;
        if (singleUuidPk) {
            const keyValues = natural.map((c) => filled[c]);
            pkValue = ids.id(table, ...keyValues);
            // Adoption comes from the id, not from a remembered list: a row whose
            // primary key is not the value this machinery would have derived was
            // made by someone else, so this run only updated it. Teardown then
            // leaves it — deleting an operator's "bamenda" would detach every
            // story filed under it through the SET NULL foreign key.
            adopted = ids.isAdopted(table, ...keyValues);
            filled[tspec.pk[0]] = pkValue;
        } else {
            // Composite or caller-chosen PK: the pack must supply every key column,
            // except those the registry declares nullable (content_follows).
            for (const column of tspec.pk) {
                if (filled[column] === undefined) {
                    throw new Error(
                        `${pack.id}: ${table}'s primary key column "${column}" has no generated default — ` +
                            `the pack must supply it (use ctx.uuid("<stable seed>") for a uuid key)`,
                    );
                }
                if (filled[column] === null && !tspec.nullable?.includes(column)) {
                    throw new Error(
                        `${pack.id}: ${table} primary key column "${column}" is null, which cannot key a row. ` +
                            `Mark it nullable in lib/seed/tables.mjs only if the table truly allows it.`,
                    );
                }
            }
            pkValue = filled[tspec.pk[0]];
        }

        // Every natural-key column must be PRESENT. It may be null only where the
        // registry declares the column nullable (content_follows' optional
        // category/location): an absent column cannot be deduped on at all, and a
        // null in an undeclared column is almost always a pack bug.
        for (const column of natural) {
            if (filled[column] === undefined) {
                throw new Error(
                    `${pack.id}: ${table} row is missing natural-key column "${column}" ` +
                        `(${natural.join(", ")}) — the runner cannot dedupe it`,
                );
            }
            if (filled[column] === null && !tspec.nullable?.includes(column)) {
                throw new Error(
                    `${pack.id}: ${table} natural-key column "${column}" is null. A unique index never ` +
                        `matches a null, so a re-run could not update this row. Give it a value, or mark ` +
                        `the column nullable in lib/seed/tables.mjs if null is genuinely meaningful.`,
                );
            }
        }

        // The conflict target is ALWAYS the primary key, never the natural key —
        // and that is deliberate, for two reasons.
        //
        //   1. Robustness against schema drift. This project's live database has
        //      before now carried an older revision of the init schema than the
        //      repo (20261009000002 had to restore locations.slug uniqueness after
        //      a drifted UNIQUE (slug, locale) broke a later foreign key). Postgres
        //      rejects an ON CONFLICT target with no matching constraint, so a seed
        //      run keyed on natural unique keys fails on any project whose
        //      constraints differ. Every table has a primary key; only some have
        //      the natural key we hope for.
        //   2. It is already correct. The PK was resolved through the live key→id
        //      map above, so "the row with this slug" and "the row with this id" are
        //      the same row by construction. The natural key still does the work —
        //      in IdMap, in JavaScript, where a missing constraint cannot hurt.
        const conflict = [...tspec.pk];
        // Postgres treats NULLs as distinct in unique indexes, so ON CONFLICT can
        // never match a row whose conflict target contains a null — and
        // content_follows' primary key legitimately holds nullable category_id
        // and location_id. Those rows are written insert-if-absent instead, which
        // the runner decides from this flag rather than the pack remembering.
        const nullableConflict = conflict.some((c) => filled[c] === null);
        const identity = `${table}|${conflict.map((c) => String(filled[c] ?? null)).join("\u0000")}`;
        if (seen.has(identity)) {
            throw new Error(
                `${pack.id}: two rows() entries claim the same ${table} row (${identity}). ` +
                    `One would silently overwrite the other, so this is always a bug.`,
            );
        }
        seen.add(identity);

        // ADOPTION IS A DIFFERENT UNDO. If the row already existed before this run,
        // seeding only *updated* it — it did not create it. Deleting it on teardown
        // would destroy an operator's own taxonomy entry, and worse, the FKs are
        // mostly `on delete set null` here, so removing an adopted "bamenda" would
        // silently detach every real story filed under it from its place.
        // So an adopted row is recorded as undo:"none": teardown leaves it and says
        // so, rather than quietly unmaking something the seed never made.
        const effectiveUndo = adopted && (spec.undo ?? tspec.undo) === "delete" ? "none" : (spec.undo ?? tspec.undo);

        plans.push({
            table,
            row: filled,
            conflict,
            nullableConflict,
            adopted,
            undo: effectiveUndo,
            note: spec.note,
            // The manifest always records the *settled* PK, which for an adopted
            // row is the database's own id — not one this run invented.
            pk: Object.fromEntries(tspec.pk.map((c) => [c, filled[c] ?? pkValue])),
        });
    }
    return plans;
}


/**
 * The manifest entry for one planned write.
 * @param {import("./contract.mjs").SeedPack} pack
 * @param {WritePlan} plan
 */
function manifestRow(pack, plan) {
    const entry = {
        pack: pack.id,
        marker: pack.marker ?? pack.id,
        table: plan.table,
        pk: plan.pk,
        undo: plan.undo,
    };
    // Recorded so teardown can say "left in place: this row existed before the
    // seed" instead of a bare count that reads like nothing was done.
    if (plan.adopted) entry.adopted = true;
    if (plan.note) entry.note = plan.note;
    return entry;
}

/**
 * Execute write plans, batched and grouped by (table, conflict target) so each
 * group needs exactly one upsert shape.
 *
 * @param {{
 *   db: any,
 *   pack: import("./contract.mjs").SeedPack,
 *   plans: WritePlan[],
 *   ids: import("./idmap.mjs").IdMap,
 *   dryRun?: boolean,
 *   log?: (...a: unknown[]) => void,
 * }} options
 * @returns {Promise<{ written: number, failed: number, errors: string[], manifestRows: Array<Record<string, unknown>> }>}
 */
export async function writePlans({ db, pack, plans, ids, dryRun = false, log = () => {} }) {
    const result = { written: 0, failed: 0, errors: [], manifestRows: [] };

    // Dry run: planRows already resolved every primary key, so the manifest a
    // dry run produces has the same shape as a real one's. That is the point —
    // --dry-run output is reviewable against what teardown will later do.
    if (dryRun) {
        for (const plan of plans) result.manifestRows.push(manifestRow(pack, plan));
        result.written = plans.length;
        return result;
    }

    // Rows whose key contains a null cannot be upserted (ON CONFLICT never matches
    // them), so they go one at a time through an existence check. There are few of
    // them in practice — section-wide content follows — so the extra round trips
    // are not worth a bulk strategy, and getting this wrong would duplicate a
    // reader's follow on every re-run.
    const nullable = plans.filter((p) => p.nullableConflict);
    const upsertable = plans.filter((p) => !p.nullableConflict);

    for (const plan of nullable) {
        const tspec = tableSpec(plan.table);
        let query = db.from(plan.table).select(tspec.pk.join(","), { head: true, count: "exact" });
        for (const column of plan.conflict) {
            const value = plan.row[column];
            query = value === null ? query.is(column, null) : query.eq(column, value);
        }
        const { count, error } = await query;
        if (error) {
            result.failed += 1;
            result.errors.push(`${pack.id}: ${plan.table} — ${error.message}`);
            continue;
        }
        if ((count ?? 0) > 0) continue; // already the case; nothing to add
        const { error: insertError } = await db.from(plan.table).insert(plan.row);
        if (insertError) {
            result.failed += 1;
            result.errors.push(`${pack.id}: ${plan.table} — ${insertError.message}`);
            continue;
        }
        result.written += 1;
        result.manifestRows.push(manifestRow(pack, plan));
    }

    /** @type {Map<string, WritePlan[]>} */
    const groups = new Map();
    for (const plan of upsertable) {
        const g = `${plan.table}|${plan.conflict.join(",")}`;
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(plan);
    }

    for (const group of groups.values()) {
        const { table, conflict } = group[0];
        const idCol = tableSpec(table).pk[0];
        const batch = pack.batch ?? DEFAULT_BATCH;
        for (let i = 0; i < group.length; i += batch) {
            const chunk = group.slice(i, i + batch);
            const { error } = await db
                .from(table)
                .upsert(chunk.map((p) => p.row), { onConflict: conflict.join(",") });
            if (error) {
                result.failed += chunk.length;
                const message = `${pack.id}: ${table} — ${error.message}`;
                result.errors.push(message);
                log(`    ! ${table} (${chunk.length} row(s)): ${error.message}`);
                continue;
            }
            result.written += chunk.length;
            for (const plan of chunk) {
                ids.remember(table, conflict.map((c) => plan.row[c]), plan.row[idCol]);
                result.manifestRows.push(manifestRow(pack, plan));
            }
        }
    }
    return result;
}

