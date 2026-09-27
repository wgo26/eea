/**
 * The seed manifest — the record of what seeding wrote.
 *
 * It exists because the alternative (which this repo used until now) is a list
 * of hardcoded natural keys duplicated across three files: scripts/seed-demo.mjs,
 * scripts/teardown-demo.mjs, scripts/verify-clean.mjs and lib/admin/demo-data.ts.
 * Four copies of a list is one too many: the demo-poll slugs had already drifted
 * once (migration 20260902000000 shipped the rows, 20260926000001 deleted them,
 * and both teardown and the admin sweep still carry the old list).
 *
 * With a manifest, teardown removes exactly what was written — including rows
 * whose natural key an operator later edited — and verify-clean can answer
 * "is this database seeded?" from one file rather than pattern-matching slugs.
 *
 * Format (scripts/.demo-seed-manifest.json):
 *   {
 *     "version": 1,
 *     "updatedAt": ISO,
 *     "env": "local" | "staging" | "production",
 *     "packs": [{ "id", "marker", "appliedAt", "written", "skipped", "rows": [...] }],
 *     "rows": [{ "pack", "marker", "table", "pk": { col: val }, "undo", "note?" }]
 *   }
 *
 * `rows` is keyed by `${table}|${pk-values}` so merging repeated runs is O(1) and
 * a re-run replaces rather than duplicates an entry.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tableSpec } from "./tables.mjs";

export const MANIFEST_VERSION = 1;
export const MANIFEST_PATH = new URL("../../scripts/.demo-seed-manifest.json", import.meta.url);

/** Node's fs accepts both file paths and file: URLs; normalise for mkdir's sake. */
function toFsPath(path) {
    return typeof path === "string" ? path : fileURLToPath(path);
}


/** @typedef {{ table: string, pk: Record<string, unknown>, undo: "delete" | "clear" | "none", pack?: string, marker?: string, adopted?: boolean, note?: string }} ManifestRow */

/** @typedef {{ id: string, marker: string, appliedAt: string, written: number, skipped: number }} ManifestPack */

/**
 * The manifest document shape. Declared as a typedef rather than inferred from
 * `loadManifest`'s empty literals, which would type `rows`/`packs` as never[] and
 * make every legitimate caller (teardown, the tests) fail to compile.
 * @typedef {object} Manifest
 * @property {number} version
 * @property {string | null} updatedAt
 * @property {string | null} env
 * @property {ManifestPack[]} packs
 * @property {ManifestRow[]} rows
 */

/** Stable identity for a manifest row: table + PK values, in PK order. */
export function rowId(table, pk) {
    const { pk: columns } = tableSpec(table);
    return `${table}|${columns.map((c) => String(pk[c] ?? "")).join("\u0000")}`;
}



/**
 * Load the manifest, or a blank one. A missing file is normal (a never-seeded
 * database); a corrupt file is not, so it throws rather than silently losing the
 * record of what needs cleaning up.
 * @param {string|URL} [path]
 * @returns {Manifest}
 */
export function loadManifest(path = MANIFEST_PATH) {
    const file = toFsPath(path);
    if (!existsSync(file)) {
        return { version: MANIFEST_VERSION, updatedAt: null, env: null, packs: [], rows: [] };
    }
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (raw.version !== MANIFEST_VERSION) {
        throw new Error(`manifest version ${raw.version} is not supported (expected ${MANIFEST_VERSION})`);
    }
    return {
        version: MANIFEST_VERSION,
        updatedAt: raw.updatedAt ?? null,
        env: raw.env ?? null,
        packs: Array.isArray(raw.packs) ? raw.packs : [],
        rows: Array.isArray(raw.rows) ? raw.rows : [],
    };
}

/**
 * Persist the manifest (pretty-printed, trailing newline — it is a committed-
 * adjacent artifact people diff, not a machine-only blob).
 * @param {ReturnType<typeof loadManifest>} manifest
 * @param {string|URL} [path]
 */
export function saveManifest(manifest, path = MANIFEST_PATH) {
    const body = { ...manifest, updatedAt: new Date().toISOString() };
    const file = toFsPath(path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, "utf8");
    return body;
}

/**
 * Fold one pack's applied writes into the manifest. Existing entries for the
 * same row are replaced (a re-run refreshes the pack/marker attribution rather
 * than stacking duplicates).
 * @param {ReturnType<typeof loadManifest>} manifest
 * @param {{ id: string, marker: string, written: number, skipped: number, rows: ManifestRow[] }} pack
 */
export function mergePackResult(manifest, pack) {
    const index = new Map(manifest.rows.map((r) => [rowId(r.table, r.pk), r]));
    for (const row of pack.rows) {
        index.set(rowId(row.table, row.pk), {
            pack: pack.id,
            marker: pack.marker,
            table: row.table,
            pk: row.pk,
            undo: row.undo ?? tableSpec(row.table).undo,
            // Carried through explicitly: `adopted` is what tells teardown this
            // row existed before the seed and must not be deleted. Dropping it
            // here would silently turn a "leave it alone" into a delete.
            ...(row.adopted ? { adopted: true } : {}),
            ...(row.note ? { note: row.note } : {}),
        });
    }
    manifest.rows = [...index.values()].sort((a, b) => rowId(a.table, a.pk).localeCompare(rowId(b.table, b.pk)));

    const at = new Date().toISOString();
    const existing = manifest.packs.findIndex((p) => p.id === pack.id);
    const entry = { id: pack.id, marker: pack.marker, appliedAt: at, written: pack.written, skipped: pack.skipped };
    if (existing === -1) manifest.packs.push(entry);
    else manifest.packs[existing] = entry;
    manifest.packs.sort((a, b) => a.id.localeCompare(b.id));
    return manifest;
}

/**
 * Drop the manifest entries belonging to packs that were actually removed, so a
 * partial teardown (`--packs=x`) leaves an accurate record behind.
 * @param {ReturnType<typeof loadManifest>} manifest
 * @param {string[]} removedPackIds
 */
export function forgetPacks(manifest, removedPackIds) {
    const gone = new Set(removedPackIds);
    manifest.rows = manifest.rows.filter((r) => !gone.has(r.pack));
    manifest.packs = manifest.packs.filter((p) => !gone.has(p.id));
    return manifest;
}

/** Row count per table — what verify-clean and `--explain` report. */
export function manifestTableCounts(manifest) {
    const counts = new Map();
    for (const row of manifest.rows) counts.set(row.table, (counts.get(row.table) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** True when a manifest exists and still claims rows (i.e. "this DB is seeded"). */
export function manifestIsApplied(path = MANIFEST_PATH) {
    if (!existsSync(path)) return false;
    try {
        return loadManifest(path).rows.length > 0;
    } catch {
        return false;
    }
}
