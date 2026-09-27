/**
 * The seed CLI — one door to the preset catalogue in presets/.
 *
 *   node scripts/seed.mjs --list                      catalogue, by family
 *   node scripts/seed.mjs --profile=reference         apply a named pack set
 *   node scripts/seed.mjs --packs=tax-locations       apply named packs (+ deps)
 *   node scripts/seed.mjs --profile=full-demo --dry-run
 *   node scripts/seed.mjs --explain tax-categories    print a pack's intent
 *   node scripts/seed.mjs --status                    what the manifest holds
 *
 * Like every other seed script here, this reads .env directly (the project has no
 * dotenv dependency) through scripts/lib/env.mjs, and it is plain .mjs because
 * the runtime is pinned to Node 22, where `node scripts/x.mjs` cannot import a
 * .ts file — which is why the shared modules in lib/seed are .mjs with JSDoc
 * types rather than TypeScript.
 *
 * PRODUCTION GUARD
 *   Packs declare an audience: prod-safe, staging, or local. A project URL that is
 *   not the local Supabase instance is treated as staging unless --env=production
 *   says otherwise, and production then requires --allow-prod AND refuses every
 *   pack that is not prod-safe. The reason is this project's own history: seed
 *   scripts written for a laptop were later run against the hosted project, and
 *   the cleanup cost of that is exactly why verify-clean.mjs and the "Remove demo
 *   data" card exist.
 *
 * Exit code 0 = every pack applied cleanly; 1 = a pack errored or the guard
 * refused, so CI can call this and trust the result.
 */

import { pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { makeGetEnv, isLocalProject } from "./lib/env.mjs";
import { PACKS, PACKS_BY_ID, selectPackIds, FAMILIES } from "../presets/index.mjs";
import { validateCatalogue, AUDIENCE_RANK } from "../lib/seed/contract.mjs";
import { resolveProfile, topoOrder, PROFILES, PROFILE_NAMES, unbuiltFamilies } from "../lib/seed/profiles.mjs";
import { makeContext, preloadFor } from "../lib/seed/context.mjs";
import { planRows, writePlans } from "../lib/seed/runner.mjs";
import {
    loadManifest,
    saveManifest,
    mergePackResult,
    manifestTableCounts,
    MANIFEST_PATH,
} from "../lib/seed/manifest.mjs";

const log = (...a) => console.log(...a);

/* ------------------------------------------------------------------ */
/* args                                                                */
/* ------------------------------------------------------------------ */

const KNOWN_OPTIONS = new Set([
    "profile", "packs", "list", "explain", "status", "dry-run",
    "allow-prod", "env", "set", "force",
]);

/** Parse `--key=value`, `--key value` and bare `--flag`; collect --set overrides. */
export function parseArgs(argv) {
    const flags = {};
    const overrides = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (!arg.startsWith("--")) throw new Error(`unexpected argument "${arg}" (expected a --flag)`);
        const eq = arg.indexOf("=");
        const key = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
        if (!KNOWN_OPTIONS.has(key)) throw new Error(`unknown option --${key} (try --list)`);
        let value;
        if (eq !== -1) value = arg.slice(eq + 1);
        else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) value = argv[(i += 1)];
        else value = true;
        flags[key] = value;
        if (key === "set") {
            for (const pair of String(value).split(";")) {
                const j = pair.indexOf("=");
                if (j > 0) overrides[pair.slice(0, j).trim()] = pair.slice(j + 1).trim();
            }
        }
    }
    return { flags, overrides };
}

/**
 * The packs an invocation selected, in deterministic apply order.
 * @returns {import("../lib/seed/contract.mjs").SeedPack[] | null} null = no selection given
 */
export function selectedPacks(flags) {
    if (flags.packs) return topoOrder([...selectPackIds(String(flags.packs)).values()]);
    if (flags.profile) return resolveProfile(String(flags.profile), PACKS);
    return null;
}


/* ------------------------------------------------------------------ */
/* audience guard                                                      */
/* ------------------------------------------------------------------ */

/**
 * Decide what this run may touch.
 * @param {Record<string, string | boolean>} flags
 * @param {string} projectUrl NEXT_PUBLIC_SUPABASE_URL
 * @param {import("../lib/seed/contract.mjs").SeedPack[]} packs
 */
export function applyAudienceGuard(flags, projectUrl, packs) {
    const local = isLocalProject(projectUrl);
    const declared = typeof flags.env === "string" ? flags.env : null;
    // Default: the local instance is "local"; anything else is a real deployment.
    // --env is the ONLY way to name production, so a forgotten flag can never
    // lower the bar by accident.
    const env = declared ?? (local ? "local" : "staging");
    if (!["local", "staging", "production"].includes(env)) {
        throw new Error(`--env must be local | staging | production (got "${env}")`);
    }

    if (env === "production" && flags["allow-prod"] !== true) {
        throw new Error(
            "refusing to seed a production project without --allow-prod.\n" +
                "  Demo content in a live database is a debt this project has already paid\n" +
                "  once (see scripts/verify-clean.mjs). If you mean it, add --allow-prod;\n" +
                "  prod-safe packs are the only ones that will then run.",
        );
    }

    const ceiling = env === "production" ? AUDIENCE_RANK["prod-safe"] : AUDIENCE_RANK.staging;
    const allowed = packs.filter((p) => AUDIENCE_RANK[p.audience] <= ceiling);
    const blocked = packs.filter((p) => AUDIENCE_RANK[p.audience] > ceiling);
    if (allowed.length === 0) {
        throw new Error(
            `every selected pack is blocked in ${env} (skipped: ${blocked.map((p) => p.id).join(", ")})\n` +
                "  --list shows each pack's audience.",
        );
    }
    return { env, allowed, blocked };
}

/* ------------------------------------------------------------------ */
/* reporting                                                           */
/* ------------------------------------------------------------------ */

export function printCatalogue() {
    log("Preset packs — by family (select with --packs=id,id or --profile=name)\n");
    for (const family of FAMILIES) {
        const inFamily = PACKS.filter((p) => p.family === family);
        log(`  ${family} (${inFamily.length})`);
        for (const pack of inFamily) {
            log(`    ${pack.id.padEnd(22)} ${pack.audience.padEnd(10)} ${pack.title}`);
        }
        log("");
    }
    log("Profiles:");
    for (const name of PROFILE_NAMES) {
        const profile = PROFILES[name];
        const count = resolveProfile(name, PACKS).length;
        log(`  ${name.padEnd(15)} ${String(count).padStart(3)} packs  ${profile.title}`);
        log(`  ${" ".repeat(21)}${profile.what}`);
    }
}

export function printExplain(id) {
    const pack = PACKS_BY_ID.get(String(id));
    if (!pack) throw new Error(`unknown pack "${id}" (try --list)`);
    log(`${pack.id}  [${pack.family}]  audience=${pack.audience}  tier=${pack.tier ?? 50}`);
    log(`  ${pack.title} / ${pack.titleFr}`);
    log(`  ${pack.what}`);
    if (pack.deps?.length) log(`  depends on: ${pack.deps.join(", ")}`);
    log(`  writes:     ${pack.tables.join(", ")}`);
}

/** What the manifest currently claims is applied. Read-only. */
export function printStatus() {
    const manifest = loadManifest(MANIFEST_PATH);
    if (!manifest.rows.length) {
        log("Nothing recorded as seeded (scripts/.demo-seed-manifest.json is empty or absent).");
        log("Preview a run with: node scripts/seed.mjs --profile=reference --dry-run");
        return;
    }
    log(`${manifest.rows.length} seeded row(s) from ${manifest.packs.length} pack(s)`);
    log(`  env=${manifest.env ?? "unknown"}  last applied=${manifest.updatedAt ?? "unknown"}`);
    for (const [table, count] of manifestTableCounts(manifest)) {
        log(`  ${table.padEnd(26)} ${count}`);
    }
    log("\nApplied packs:");
    for (const pack of manifest.packs) {
        log(`  ${pack.id.padEnd(22)} ${String(pack.written).padStart(4)} written  ${pack.appliedAt}`);
    }
}

/* ------------------------------------------------------------------ */
/* main                                                                */
/* ------------------------------------------------------------------ */

export async function seed({ flags, overrides }) {
    // The catalogue must be sound before a connection is even opened: a typo in a
    // pack's tables[] is a load-time failure, not a half-written database.
    const catalogueErrors = validateCatalogue(PACKS);
    if (catalogueErrors.length) {
        for (const problem of catalogueErrors) console.error(`CATALOGUE ERROR: ${problem}`);
        return 1;
    }

    const packs = selectedPacks(flags);
    if (!packs) {
        console.error("Nothing selected. Use --profile=<name> or --packs=<id,id> (see --list).");
        return 1;
    }

    const get = makeGetEnv(overrides);
    const url = get("NEXT_PUBLIC_SUPABASE_URL");
    const key = get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) {
        console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");
        return 1;
    }

    const dryRun = flags["dry-run"] === true;
    const { env, allowed, blocked } = applyAudienceGuard(flags, url, packs);

    log(`Eagle Eye Africa seed — ${allowed.length} pack(s), env=${env}${dryRun ? " (dry run)" : ""}`);
    log(`  ${url}`);
    if (blocked.length) log(`  ${blocked.length} pack(s) below this environment's audience ceiling: ${blocked.map((p) => p.id).join(", ")}`);

    const db = createClient(url, key, { auth: { persistSession: false } });
    const ctx = makeContext({ db, env, dryRun, log });
    const manifest = loadManifest(MANIFEST_PATH);
    manifest.env = env;

    const applied = [];
    let errors = 0;
    let plannedRows = 0;
    for (const pack of allowed) {
        log(`\n▸ ${pack.id} — ${pack.title}`);
        await preloadFor(ctx, applied, pack);
        const specs = await pack.rows(ctx);
        // planRows is where a pack's intent becomes a validated write: unknown
        // tables, missing natural keys and an unsafe PK all throw here, before
        // anything is sent. A throw aborts the run on purpose — a pack that is
        // half-applied is harder to reason about than one that did not start.
        const plans = planRows(pack, specs, ctx.ids);
        const result = await writePlans({ db, pack, plans, ids: ctx.ids, dryRun, log });
        mergePackResult(manifest, {
            id: pack.id,
            marker: pack.marker ?? pack.id,
            written: result.written,
            skipped: result.failed,
            rows: result.manifestRows,
        });
        plannedRows += result.manifestRows.length;
        log(`  ${result.written} row(s)${result.failed ? ` — ${result.failed} FAILED` : ""}${dryRun ? "  [would write]" : ""}`);
        errors += result.errors.length;
        applied.push(pack);
    }

    if (dryRun) {
        // Counted from this run's plans, not the manifest, which still holds rows
        // a previous real run recorded.
        log(`\nDry run: ${applied.length} pack(s), ${plannedRows} row(s) would be written.`);
        log("Nothing written and the manifest is unchanged.");
    } else {
        saveManifest(manifest);
        log(`\nSeeded ${applied.length} pack(s) — ${plannedRows} row(s). Manifest: scripts/.demo-seed-manifest.json`);
        log("Undo with: node scripts/teardown-demo.mjs");
    }

    // Say out loud what a selection could not deliver. Without this, "full-demo
    // seeded 4 pack(s)" reads as complete when most of the catalogue is unwritten.
    const askedFor = flags.profile ? PROFILES[String(flags.profile)]?.unbuiltFamilies : unbuiltFamilies(PACKS);
    if (askedFor?.length) {
        log(`\nNot yet implemented (families this selection asked for): ${askedFor.join(", ")}`);
        log("The catalogue grows pack by pack; see docs/seeding.md for what exists.");
    }

    if (errors) {
        console.error(
            `\n${errors} write error(s) above. Fix the pack and re-run — every write is an`,
        );
        console.error("upsert against a unique key, so repeating a partial run is safe.");
        return 1;
    }
    return 0;
}

export async function main(argv = process.argv.slice(2)) {
    const { flags, overrides } = parseArgs(argv);
    if (flags.list) return printCatalogue(), 0;
    if (flags.explain) return printExplain(flags.explain), 0;
    if (flags.status) return printStatus(), 0;
    return seed({ flags, overrides });
}

// Direct invocation only — lib/seed/seed.test.ts imports the functions above.
// The exit code is the contract CI depends on, so a rejection must not print a
// stack and still leave the process succeeding.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().then(
        (code) => {
            process.exitCode = code ?? 0;
        },
        (error) => {
            console.error(`\nSEED FAILED: ${error instanceof Error ? error.message : error}`);
            process.exitCode = 1;
        },
    );
}


