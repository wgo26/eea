/**
 * The seed pack contract: what a preset pack must declare and how packs order.
 *
 * Packs are plain data + a `rows(ctx)` factory (see presets/README.md). Nothing
 * here touches the network, so the whole catalogue can be validated — schema
 * conformance, dependency order, duplicate ids — before a single insert is
 * attempted. lib/seed/seed.test.ts runs these assertions in the normal vitest
 * gate, which is what keeps a 40-pack catalogue honest.
 */

import { tableSpec } from "./tables.mjs";

/** @typedef {"prod-safe" | "staging" | "local"} PackAudience */

/**
 * One declarative preset pack.
 *
 * @typedef {object} SeedPack
 * @property {string} id kebab-case, unique across the catalogue.
 * @property {string} family groups packs in --list/docs and in profile selection.
 * @property {string} title human-readable name (docs + --explain).
 * @property {string} titleFr French title — the catalogue is admin-visible in
 *   both locales, so a missing translation is a validation error, not a fallback.
 * @property {string} what one line on what the pack writes and why it matters.
 * @property {"prod-safe"|"staging"|"local"} audience gates the production
 *   guard in scripts/seed.mjs (see AUDIENCE_RANK below).
 * @property {number} [tier] ordering hint (0 = config … 11 = telemetry).
 * @property {string[]} [deps] pack ids that must be applied first.
 * @property {string[]} tables every table rows() may write (validated).
 * @property {string} [marker] groups a pack's rows in the manifest (defaults to id).
 * @property {number} [batch] rows per write request (defaults to 200).
 * @property {(ctx: any) => SeedRowSpec[]} rows factory producing write specs.
 */

/**
 * One row a pack wants written.
 *
 * @typedef {object} SeedRowSpec
 * @property {string} table must appear in the pack's tables[] and the registry.
 * @property {Record<string, any>} row the columns to write. The table's natural
 *   key columns are required — they are what the upsert dedupes on.
 * @property {"delete"|"clear"|"none"} [undo] overrides the registry's teardown
 *   behaviour for this row (rare; used where a pack writes only some columns).
 * @property {string} [note] why this row exists; lands in the manifest, which is
 *   what makes a 400-line manifest readable by a human reviewing a teardown.
 */


/** Audience ranks: higher = less safe to run against a live project. */
export const AUDIENCE_RANK = { "prod-safe": 0, staging: 1, local: 2 };

/** Tables the seed runner may never write, whatever a pack declares. */
export const FORBIDDEN_TABLES = new Set(["auth.users"]);

/**
 * Validate one pack. Returns error strings (empty = valid) instead of throwing,
 * so --list can report every problem in the catalogue in one pass.
 *
 * The parameter is deliberately NOT typed as SeedPack: this function's whole job
 * is to accept a malformed pack and describe what is wrong with it, so requiring
 * the full shape would make the type contradict the purpose (and force every
 * test fixture into a cast).
 * @param {Partial<SeedPack> & Record<string, any>} pack
 * @param {Set<string>} [knownIds]
 * @returns {string[]}
 */
export function validatePack(pack, knownIds = new Set()) {
    const errors = [];
    const at = pack && pack.id ? pack.id : "<missing id>";
    if (!pack || typeof pack !== "object") return ["pack is not an object"];

    if (typeof pack.id !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(pack.id)) {
        errors.push(`${at}: id must be kebab-case`);
    }
    if (typeof pack.family !== "string" || !pack.family) errors.push(`${at}: family is required`);
    if (typeof pack.title !== "string" || !pack.title) errors.push(`${at}: title is required`);
    if (typeof pack.titleFr !== "string" || !pack.titleFr) {
        errors.push(`${at}: titleFr is required (bilingual catalogue)`);
    }
    if (typeof pack.what !== "string" || !pack.what) errors.push(`${at}: what is required`);
    if (!(pack.audience in AUDIENCE_RANK)) {
        errors.push(`${at}: audience must be one of ${Object.keys(AUDIENCE_RANK).join(" | ")}`);
    }
    if (typeof pack.rows !== "function") errors.push(`${at}: rows must be a function`);

    if (!Array.isArray(pack.tables) || pack.tables.length === 0) {
        errors.push(`${at}: tables must list at least one target table`);
    } else {
        for (const table of pack.tables) {
            if (FORBIDDEN_TABLES.has(table)) {
                errors.push(`${at}: table "${table}" is off-limits to the seed runner`);
                continue;
            }
            try {
                tableSpec(table);
            } catch (e) {
                errors.push(`${at}: ${e.message}`);
            }
        }
    }

    for (const dep of pack.deps ?? []) {
        if (knownIds.size > 0 && !knownIds.has(dep)) errors.push(`${at}: unknown dep "${dep}"`);
        if (dep === pack.id) errors.push(`${at}: depends on itself`);
    }
    return errors;
}

/**
 * Validate the catalogue: unique ids, resolvable deps, acyclic graph.
 * @param {Array<Partial<SeedPack> & Record<string, any>>} packs
 * @returns {string[]}
 */
export function validateCatalogue(packs) {
    const errors = [];
    const seen = new Set();
    for (const pack of packs) {
        if (seen.has(pack.id)) errors.push(`duplicate pack id "${pack.id}"`);
        seen.add(pack.id);
    }
    for (const pack of packs) errors.push(...validatePack(pack, seen));
    const cycle = findCycle(packs);
    if (cycle) errors.push(`dependency cycle: ${cycle.join(" -> ")}`);
    return errors;
}

/**
 * Depth-first cycle detection over the dep graph.
 * @param {SeedPack[]} packs
 * @returns {string[] | null} the cycle path, or null when the graph is acyclic
 */
export function findCycle(packs) {
    const byId = new Map(packs.map((p) => [p.id, p]));
    const state = new Map(); // 0 = on stack, 1 = fully explored
    const stack = [];

    /** @param {string} id @returns {string[] | null} */
    const visit = (id) => {
        const mark = state.get(id);
        if (mark === 1) return null;
        if (mark === 0) return [...stack.slice(stack.indexOf(id)), id];
        state.set(id, 0);
        stack.push(id);
        for (const dep of byId.get(id)?.deps ?? []) {
            if (!byId.has(dep)) continue;
            const found = visit(dep);
            if (found) return found;
        }
        stack.pop();
        state.set(id, 1);
        return null;
    };

    for (const pack of packs) {
        const found = visit(pack.id);
        if (found) return found;
    }
    return null;
}
