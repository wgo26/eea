/**
 * Pack ordering + named profiles. Split out of contract.mjs so each module
 * stays small enough to read in one sitting.
 */

import { findCycle } from "./contract.mjs";

/**
 * Order packs so every pack runs after its deps, ties broken by tier then id.
 * The order must be deterministic: it is what makes a re-run idempotent and the
 * manifest comparable between runs.
 * @param {import("./contract.mjs").SeedPack[]} packs
 * @returns {import("./contract.mjs").SeedPack[]}
 */
export function topoOrder(packs) {
    const byId = new Map(packs.map((p) => [p.id, p]));
    const picked = [];
    const done = new Set();
    const candidates = [...packs].sort(
        (a, b) => (a.tier ?? 50) - (b.tier ?? 50) || a.id.localeCompare(b.id),
    );

    /** @param {import("./contract.mjs").SeedPack} pack @param {Set<string>} path */
    const resolve = (pack, path) => {
        if (done.has(pack.id)) return true;
        if (path.has(pack.id)) return false; // cycle; findCycle already reported it
        path.add(pack.id);
        for (const dep of pack.deps ?? []) {
            const depPack = byId.get(dep);
            if (!depPack) continue; // unknown deps fail validation, not the walk
            if (!resolve(depPack, path)) return false;
        }
        path.delete(pack.id);
        done.add(pack.id);
        picked.push(pack);
        return true;
    };

    for (const pack of candidates) resolve(pack, new Set());
    return picked;
}

/**
 * Named profiles — curated pack sets for the situations people actually seed
 * for. `--profile=help` prints them.
 *
 * Deliberately NOT one giant "everything" flag per family: reader-facing packs
 * (editorial content, polls, demo users) stay grouped so a profile has to opt in
 * explicitly. That mirrors why migration 20260902000000's demo polls were
 * removed — anything a real reader can see is created by staff through the
 * normal workflow, so seeded visibility is always a decision, never a default.
 *
 * An entry beginning with `@` selects a whole family; a bare id selects one pack.
 * @type {Record<string, { title: string, titleFr: string, what: string, include: string[], exclude?: string[], unbuiltFamilies?: string[] }>}
 */
export const PROFILES = {
    reference: {
        title: "Reference data only",
        titleFr: "Données de référence",
        what: "Taxonomy and site configuration. Safe to run alongside real editorial data; writes nothing a reader can see.",
        include: ["@config", "@taxonomy"],
    },
    "minimum-live": {
        title: "Minimum viable public site",
        titleFr: "Site public minimal",
        what: "Reference data plus enough editorial and marketplace content that every public section renders. Includes the demo contributor profiles needed for business owner attribution.",
        include: ["@config", "@taxonomy", "@editorial", "@marketplace", "@people", "@brand-state"],
    },
    "full-demo": {
        title: "Full demo install",
        titleFr: "Démo complète",
        what: "Everything reader-facing and operational: content in all shapes and voices, the participation and moderation loop, trust and safety queues, polls and saves, branding and states, the automation library and the notifications it exercises, ads, dashboards. Includes demo accounts, because every queue row is authored or reported by one.",
        include: [
            "@config", "@taxonomy", "@editorial", "@marketplace", "@people",
            "@participation", "@trust", "@engagement", "@brand-state",
            "@automation", "@notify", "@ads", "@admin-ux",
        ],
    },
    automation: {
        title: "Advanced preset library",
        titleFr: "Bibliothèque de préréglages",
        what: "The automation library: recap templates, release plans, emergency presets, digest and brief packs, and state-aware templates — plus the content they need to compile from.",
        include: ["@config", "@taxonomy", "@editorial", "@automation", "@brand-state"],
    },
    "load-test": {
        title: "Volume fixture",
        titleFr: "Jeu de données volumineux",
        what: "Reference plus multiplied editorial and marketplace rows for pagination and query-performance work. Local only.",
        include: ["@config", "@taxonomy", "@editorial", "@marketplace", "@people", "@volume"],
    },
};

/** Profile names in display order. */
export const PROFILE_NAMES = Object.keys(PROFILES);

/**
 * Expand a profile name into an ordered pack list.
 * @param {string} name
 * @param {import("./contract.mjs").SeedPack[]} packs
 * @returns {import("./contract.mjs").SeedPack[]}
 */
export function resolveProfile(name, packs) {
    const profile = PROFILES[name];
    if (!profile) {
        throw new Error(`unknown profile "${name}" — known: ${PROFILE_NAMES.join(", ")}`);
    }
    const chosen = selectPacks(profile, packs);
    const ordered = topoOrder(chosen);
    if (ordered.length !== chosen.length) {
        throw new Error(`profile "${name}" has an unresolvable dep graph (cycle: ${findCycle(packs)?.join(" -> ") ?? "?"})`);
    }
    return ordered;
}

/**
 * @param {{ include: string[], exclude?: string[], unbuiltFamilies?: string[] }} profile
 * @param {import("./contract.mjs").SeedPack[]} packs
 * @returns {import("./contract.mjs").SeedPack[]}
 */
function selectPacks(profile, packs) {
    const byFamily = new Map();
    for (const pack of packs) {
        if (!byFamily.has(pack.family)) byFamily.set(pack.family, []);
        byFamily.get(pack.family).push(pack);
    }
    const picked = new Map();
    /** @type {string[]} families the profile asks for that no pack implements. */
    const unbuilt = [];
    for (const entry of profile.include) {
        if (entry.startsWith("@")) {
            const family = entry.slice(1);
            const members = byFamily.get(family);
            // An unbuilt family is REPORTED, not fatal: profiles describe the whole
            // target catalogue and packs land incrementally, so `--profile=full-demo`
            // must still work (and say what is missing) before every pack exists.
            // Dropping it silently is the failure to avoid — the profile would
            // promise thirty packs, seed three, and look correct in the docs.
            if (!members) {
                unbuilt.push(family);
                continue;
            }
            for (const pack of members) picked.set(pack.id, pack);
            continue;
        }
        // A bare pack id is unambiguous: if it is missing, the profile is wrong.
        const pack = packs.find((p) => p.id === entry);
        if (!pack) throw new Error(`profile references unknown pack "${entry}"`);
        picked.set(pack.id, pack);
    }
    for (const id of profile.exclude ?? []) picked.delete(id);
    if (unbuilt.length) profile.unbuiltFamilies = [...new Set(unbuilt)];
    else delete profile.unbuiltFamilies;
    return [...picked.values()];
}

/**
 * Families named by any profile that no pack implements yet, across the whole
 * catalogue. The CLI prints this after a run so "seeded 4 packs" is never
 * mistaken for "the full demo is installed".
 * @param {import("./contract.mjs").SeedPack[]} packs
 */
export function unbuiltFamilies(packs) {
    const families = new Set(packs.map((p) => p.family));
    const missing = new Set();
    for (const profile of Object.values(PROFILES)) {
        for (const entry of profile.include) {
            if (entry.startsWith("@") && !families.has(entry.slice(1))) missing.add(entry.slice(1));
        }
    }
    return [...missing].sort();
}
