/**
 * Natural key → row id, for the tables a seed run touches.
 *
 * Why this exists: a pack wants to say "put this story in Bamenda" without
 * knowing whether the Bamenda row already exists, and whether its uuid came from
 * this run, a previous run, or the legacy scripts/seed-demo.mjs (which let
 * Postgres invent a random one). Resolving keys to ids up front means
 *
 *   - a re-run updates the existing row instead of duplicating it,
 *   - the pack can set its own primary key (so the id is known *before* the
 *     insert — which is what lets --dry-run report real PKs and lets a later
 *     pack reference an earlier pack's row in the same run), and
 *   - foreign keys never point at a uuid that the database has never seen.
 *
 * When no row holds the key, `id()` returns the deterministic uuid for it —
 * the same value the packs derive themselves — so both sides agree without
 * talking.
 */

import { naturalId } from "./ids.mjs";
import { tableSpec } from "./tables.mjs";

/** PostgREST hands back at most this many rows per request unless told otherwise. */
const PAGE = 1000;

/** Canonical string for a set of key columns on a row. */
function keyOf(columns, row) {
    return columns.map((c) => String(row[c] ?? "")).join("\u0000");
}

export class IdMap {
    /** @param {any} db service-role Supabase client */
    constructor(db) {
        this.db = db;
        /** @type {Map<string, Map<string, string>>} table -> key -> id */
        this.maps = new Map();
        /** @type {Map<string, readonly string[]>} table -> its key columns */
        this.cols = new Map();
        /** @type {Map<string, Record<string, unknown>>} "table\u0000key" -> full row */
        this.rows = new Map();
        /** @type {Set<string>} tables loaded with `withRows` */
        this.withRows = new Set();
        /** @type {Map<string, Set<string>>} table -> keys whose row was NOT created by this machinery */
        this.adopted = new Map();
    }

    /** The columns that identify a row naturally (unique key, else the PK). */
    keyColumns(table) {
        const spec = tableSpec(table);
        return spec.unique ?? spec.pk;
    }

    /**
     * Read the key→id map for a table, paged. Tables here are taxonomy, templates,
     * plans and config — hundreds of rows, not millions — so a full scan is
     * cheaper and safer than guessing which keys a pack will ask for. With
     * `withRows`, whole rows are kept too, so a pack can honour `ctx.current()`
     * and leave a human's edit alone instead of overwriting it.
     * @param {string} table
     * @param {{ withRows?: boolean }} [options]
     */
    async load(table, options = {}) {
        const wantRows = options.withRows === true;
        // Already loaded with rows? Done. Loaded id-only and now asked for rows?
        // Re-read with rows and merge — never drop what the first pass cached.
        if (this.maps.has(table) && (!wantRows || this.withRows.has(table))) return this.maps.get(table);
        const spec = tableSpec(table);
        const cols = this.keyColumns(table);
        const map = this.maps.get(table) ?? new Map();
        if (spec.pk.length === 1) {
            const idCol = spec.pk[0];
            const select = wantRows ? "*" : [...new Set([...cols, idCol])].join(", ");
            for (let from = 0; ; from += PAGE) {
                const { data, error } = await this.db
                    .from(table)
                    .select(select)
                    .range(from, from + PAGE - 1);
                if (error) throw new Error(`id lookup on ${table} failed: ${error.message}`);
                const rows = data ?? [];
                for (const row of rows) {
                    const key = keyOf(cols, row);
                    map.set(key, row[idCol]);
                    // ADOPTION, DERIVED — not remembered. The runner always keys a
                    // row it creates with naturalId(table, ...key), so a row whose
                    // id is NOT that value cannot have come from this machinery: it
                    // is an operator's or a legacy seeder's. Detecting adoption from
                    // the id rather than from the manifest makes it self-correcting:
                    // a stale or hand-edited manifest cannot mislabel someone else's
                    // row as ours (which teardown would then delete).
                    if (row[idCol] !== naturalId(table, ...cols.map((c) => row[c]))) {
                        if (!this.adopted.has(table)) this.adopted.set(table, new Set());
                        this.adopted.get(table).add(key);
                    }
                    if (wantRows) this.rows.set(`${table}\u0000${key}`, row);
                }
                if (rows.length < PAGE) break;
            }
        }
        if (wantRows) this.withRows.add(table);
        this.maps.set(table, map);
        this.cols.set(table, cols);
        return map;
    }

    /**
     * The row currently holding this key, or null. Synchronous after a
     * `load(table, { withRows: true })`. Packs use it for the "seed only what is
     * unset" pattern: an operator's value always wins over a preset.
     * @param {string} table
     * @param {...(string|number)} keyValues
     */
    current(table, ...keyValues) {
        const cols = this.cols.get(table);
        if (!cols) throw new Error(`current("${table}") before load("${table}")`);
        if (!this.withRows.has(table)) {
            throw new Error(`current("${table}") needs load("${table}", { withRows: true })`);
        }
        const row = Object.fromEntries(cols.map((c, i) => [c, keyValues[i]]));
        return this.rows.get(`${table}\u0000${keyOf(cols, row)}`) ?? null;
    }

    /**
     * The id of the row holding these key values — its real one if the row
     * exists, otherwise the deterministic id this run will give it.
     * Synchronous: call after `await ctx.load(table)`.
     * @param {string} table
     * @param {...(string|number)} keyValues one value per key column, in order
     */
    id(table, ...keyValues) {
        const spec = tableSpec(table);
        if (spec.pk.length !== 1) {
            throw new Error(
                `id("${table}"): its primary key is composite (${spec.pk.join(", ")}), so no other table can reference it`,
            );
        }
        const cols = this.cols.get(table);
        if (!cols) throw new Error(`id("${table}") before load("${table}")`);
        if (keyValues.length !== cols.length) {
            throw new Error(`id("${table}") needs ${cols.length} key value(s) [${cols.join(", ")}], got ${keyValues.length}`);
        }
        const row = Object.fromEntries(cols.map((c, i) => [c, keyValues[i]]));
        const key = keyOf(cols, row);
        const found = this.maps.get(table).get(key);
        return found !== undefined ? found : naturalId(table, ...keyValues);
    }

    /** True when a row with this key already exists in the database. */
    exists(table, ...keyValues) {
        const cols = this.cols.get(table);
        if (!cols) throw new Error(`exists("${table}") before load("${table}")`);
        if (keyValues.length !== cols.length) {
            throw new Error(`exists("${table}") needs ${cols.length} key value(s) [${cols.join(", ")}], got ${keyValues.length}`);
        }
        const row = Object.fromEntries(cols.map((c, i) => [c, keyValues[i]]));
        return this.maps.get(table).has(keyOf(cols, row));
    }

    /**
     * True when the row holding this key was created by somebody other than this
     * seed machinery (an operator, or the legacy scripts/seed-demo.mjs which let
     * Postgres invent the uuid). Detected from the id itself — see the note in
     * `load` — so it needs no manifest and cannot drift.
     * @param {string} table
     * @param {...(string|number)} keyValues
     */
    isAdopted(table, ...keyValues) {
        const cols = this.cols.get(table);
        if (!cols) throw new Error(`isAdopted("${table}") before load("${table}")`);
        const found = this.maps.get(table);
        if (!found) return false;
        const key = keyOf(cols, Object.fromEntries(cols.map((c, i) => [c, keyValues[i]])));
        return this.adopted.get(table)?.has(key) === true;
    }

    /** How many existing rows a table's map holds — what "seeded" looks like. */
    count(table) {
        return this.maps.get(table)?.size ?? 0;
    }

    /**
     * Record an id produced mid-run so later rows resolve it without a re-read.
     * The runner calls this after each successful write group.
     */
    remember(table, keyValues, id) {
        const cols = this.cols.get(table);
        if (!cols || !this.maps.has(table)) return;
        const row = Object.fromEntries(cols.map((c, i) => [c, keyValues[i]]));
        this.maps.get(table).set(keyOf(cols, row), id);
    }
}
