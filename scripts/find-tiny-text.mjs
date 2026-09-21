/**
 * Phase 3 — legibility-floor gate (U1).
 *
 * The design-token floor for meaningful text is 12px (`text-xs` / the
 * `text-floor` token in app/globals.css). Anything smaller (text-[10px],
 * text-[11px] is tolerated but text-[10px] is banned) is unreadable on
 * low-end Android screens for the audience this product targets.
 *
 * Fails when `text-[10px]` (or any text-[<12px] arbitrary value) appears in
 * app/, components/ or lib/. Hierarchy must come from uppercase + tracking,
 * not shrinking type.
 *
 * Run: node scripts/find-tiny-text.mjs (wired into `npm run check`)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["app", "components", "lib"];

function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            walk(full, out);
        } else if (/\.(tsx|ts|css)$/.test(entry)) {
            out.push(full);
        }
    }
    return out;
}

const tinyRe = /text-\[(\d+(?:\.\d+)?)px\]/g;
let failures = 0;

for (const rel of ROOTS) {
    for (const file of walk(join(root, rel))) {
        const src = readFileSync(file, "utf8");
        let match;
        while ((match = tinyRe.exec(src)) !== null) {
            if (Number(match[1]) < 12) {
                const line = src.slice(0, match.index).split("\n").length;
                console.error(`  X ${file}:${line} uses ${match[0]} (floor is text-xs / 12px)`);
                failures += 1;
            }
        }
    }
}

if (failures > 0) {
    console.error(`RESULT: ${failures} sub-floor type usage(s) — use text-xs with tracking instead.`);
    process.exit(1);
}
console.log("No sub-12px text utilities found.");
