/**
 * Shared .env reader for the seed/teardown/verify scripts.
 *
 * The project has no dotenv dependency, so every seeder used to hand-roll the
 * same four lines of regex parsing (seed-demo, seed-notify, seed-fundraisers,
 * teardown-demo, verify-clean). This is that helper — plus an override map so
 * `--set KEY=VALUE` can stand in for editing .env during a one-off run.
 *
 * Resolution order: explicit overrides → process.env → .env → .env.local.
 * (`loadEnvFiles` deliberately prefers `.env` because that is what every
 * existing seed script in this repo reads.)
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));

/** Parse a dotenv-ish file into a plain object (last value wins). */
export function parseEnvFile(text) {
    const out = {};
    for (const line of text.split(/\r?\n/)) {
        if (!line || /^\s*#/.test(line)) continue;
        const i = line.indexOf("=");
        if (i === -1) continue;
        const key = line.slice(0, i).trim();
        if (!key) continue;
        let value = line.slice(i + 1).trim();
        // Strip matching surrounding quotes ("KEY=va"l"ue" keeps its content).
        if (value.length > 1 && /^"[\s\S]*"$/.test(value)) value = value.slice(1, -1);
        out[key] = value;
    }
    return out;
}

/** Read .env then .env.local from the repo root (.env wins). */
export function loadEnvFiles() {
    const merged = {};
    for (const name of [".env.local", ".env"]) {
        const abs = ROOT + name;
        if (!existsSync(abs)) continue;
        Object.assign(merged, parseEnvFile(readFileSync(abs, "utf8")));
    }
    return merged;
}

/**
 * Build an env accessor. `overrides` (from `--set`) beats real environment
 * variables, which beat the files.
 */
export function makeGetEnv(overrides = {}) {
    const files = loadEnvFiles();
    return (key) => {
        if (overrides[key] != null && overrides[key] !== "") return overrides[key];
        const fromProc = process.env[key];
        if (fromProc != null && fromProc !== "") return fromProc;
        const fromFile = files[key];
        return fromFile == null || fromFile === "" ? undefined : fromFile;
    };
}

/**
 * True when the Supabase URL points at the local dev instance. Used to decide
 * whether a seed run may touch packs gated to the `local` audience without an
 * explicit --env flag.
 */
export function isLocalProject(url) {
    return /127\.0\.0\.1|localhost/i.test(String(url ?? ""));
}

export { ROOT as REPO_ROOT };
