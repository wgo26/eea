/**
 * The context object handed to every pack's `rows(ctx)`.
 *
 * It exists so packs stay pure data declarations: a pack describes what a row
 * should look like and never touches the network, the client, or a clock it does
 * not control. Everything impure the packs need — id resolution, "N days ago",
 * "did the operator already set this?" — is injected here, which is also what
 * lets the whole catalogue be exercised in a unit test with a fake db.
 *
 * @module
 */

import { IdMap } from "./idmap.mjs";
import { stableUuid, stableToken, isoOffset, dateOffset, demoSlug } from "./ids.mjs";

/**
 * @param {{
 *   db: any,
 *   now?: Date,
 *   dryRun?: boolean,
 *   env?: "local" | "staging" | "production",
 *   log?: (...a: unknown[]) => void,
 *   vars?: Record<string, unknown>,
 * }} options
 */
export function makeContext({ db, now = new Date(), dryRun = false, env = "local", log = () => {}, vars = {} }) {
    const ids = new IdMap(db);
    /** Tables already loaded, so a pack calling load() twice is cheap. */
    const loading = new Map();

    const ctx = {
        now,
        env,
        dryRun,
        /**
         * The one IdMap this run shares. The CLI passes it to planRows and
         * writePlans; packs reach it through load()/id()/exists()/current().
         * Exposed so there is never a second map that re-reads every table.
         */
        ids,
        /** Run-scoped values packs share (e.g. the demo author's profile id). */
        vars,
        /**
         * Prime the key→id map for a table. Call once per table before using
         * `id`/`exists`/`current` on it. Pass `{ withRows: true }` to also allow
         * `current()` (read-before-write, so a seed never clobbers an edit).
         * @param {string} table
         * @param {{ withRows?: boolean }} [options]
         */
        async load(table, options) {
            // Dedupe concurrent loads of the same table.
            const pending = loading.get(table);
            if (pending) return pending;
            const p = ids.load(table, options).finally(() => loading.delete(table));
            loading.set(table, p);
            return p;
        },

        /** The id of the row holding this natural key (real, or this run's deterministic one). */
        id: (table, ...keyValues) => ids.id(table, ...keyValues),
        /** The key columns a table dedupes on — so packs can assert before writing. */
        keyColumns: (table) => ids.keyColumns(table),
        /** Whether a row with this natural key already exists in the database. */
        exists: (table, ...keyValues) => ids.exists(table, ...keyValues),
        /** The existing row for this key (needs `load(table, { withRows: true })`). */
        current: (table, ...keyValues) => ids.current(table, ...keyValues),
        /** How many existing rows were found for a table — feeds "already seeded?" output. */
        count: (table) => ids.count(table),

        /** Derive a stable uuid from any seed string, for rows with no natural key. */
        uuid: (seed) => stableUuid(seed),
        /** Derive a stable opaque token (anonymous vote/session tokens). */
        token: (seed, length) => stableToken(seed, length),

        /** ISO timestamp `days` from `now` (negative = past). */
        iso: (days, opts) => isoOffset(days, { base: now, ...opts }),
        /** `YYYY-MM-DD` `days` from `now` (negative = past). */
        date: (days, opts) => dateOffset(days, { base: now, ...opts }),
        /** The same instant `hours` from `now`, for intraday schedules. */
        hoursFromNow: (hours, opts) =>
            new Date(now.getTime() + hours * 3_600_000 + (opts?.extraMs ?? 0)).toISOString(),

        /** Normalise a title into a URL slug, the way every seeder here has done. */
        slug: (name) => demoSlug(name),
        /** Report something worth a human's attention without failing the run. */
        warn: (message) => log(`    ~ ${message}`),
        info: (message) => log(`    · ${message}`),
    };
    return ctx;
}

/**
 * Prime the id maps a pack needs, so packs never have to manage loading and can
 * never hit a "before load" error: its own tables, plus every table an already-
 * applied pack wrote (which is where a template's `location_slug` or a plan's
 * `template_id` points).
 *
 * Loaded id-only (key columns + the PK), which stays cheap even on a table with
 * tens of thousands of rows. A pack that needs to READ an existing value — to
 * leave an operator's edit alone — calls `ctx.load(table, { withRows: true })`
 * itself; the maps merge, they do not replace.
 *
 * @param {ReturnType<typeof makeContext>} ctx
 * @param {{ tables: string[] }[]} applied packs that already wrote rows
 * @param {import("./contract.mjs").SeedPack} pack about to run
 */
export async function preloadFor(ctx, applied, pack) {
    const tables = new Set([...pack.tables, ...applied.flatMap((p) => p.tables)]);
    for (const table of tables) {
        try {
            await ctx.load(table);
        } catch (error) {
            // A table that does not exist yet (a migration not applied) must not
            // abort the run: the pack that writes it reports the real failure.
            ctx.warn(`preload skipped ${table}: ${error.message}`);
        }
    }
}


export { IdMap };
