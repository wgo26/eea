/**
 * A2 — client dictionary leak gate.
 *
 * The anonymous client bundle must not contain the full EN+FR dictionaries
 * (and their ~147 KB of `*-app.ts` admin vocabulary). The every-page chrome
 * (header, footer, theme toggle, command palette, language switcher,
 * mobile nav, contrast toggle) receives a small chrome string slice as props
 * from the server shell and imports only `lib/i18n/chrome.ts` + types.
 *
 * Checks (static, no build needed):
 *   1. Every-page client files never runtime-import `@/lib/i18n`,
 *      `getDictionary`, or `*-app` (type-only imports are erased — allowed).
 *   2. `chrome-en.ts` / `chrome-fr.ts` / `chrome.ts` never import the full
 *      dictionaries or `*-app` (or the split is defeated transitively).
 *   3. Advisory scan: any OTHER "use client" file runtime-importing the full
 *      dictionary is reported but does not fail (per-page usage such as the
 *      error boundary is tolerated; every-page usage is not).
 *
 * Chrome en<->fr key parity lives in lib/i18n/chrome.test.ts (vitest is
 * TS-aware; this script is not).
 *
 * Exit code: 0 when clean, 1 otherwise.
 *
 * Run: node scripts/verify-client-dictionary.mjs (wired into `npm run check`)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), "utf8");

// --- 1. every-page client chrome: no full-dictionary runtime imports ---
const EVERY_PAGE_CLIENTS = [
    "components/site-header.tsx",
    "components/site-footer.tsx",
    "components/theme-toggle.tsx",
    "components/system/command-palette.tsx",
    "components/language-switcher.tsx",
    "components/mobile-nav.tsx",
    "components/system/contrast-toggle.tsx",
];

const FORBIDDEN_RUNTIME = [/from\s+["']@\/lib\/i18n["']/, /\bgetDictionary\b/, /en-app|fr-app|appStrings/];

let failures = 0;
const fail = (msg) => {
    console.error(`  X ${msg}`);
    failures += 1;
};
const ok = (msg) => console.log(`  ok ${msg}`);

function runtimeCode(source) {
    // Drop block + line comments (doc prose legitimately names getDictionary)
    // and type-only imports (erased at compile — zero bundle cost).
    const noComments = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n");
    return noComments
        .split("\n")
        .filter((line) => !line.trim().startsWith("import type "))
        .join("\n");
}

console.log("[every-page client chrome]");
for (const rel of EVERY_PAGE_CLIENTS) {
    let source;
    try {
        source = read(rel);
    } catch {
        fail(`${rel} missing`);
        continue;
    }
    const hits = FORBIDDEN_RUNTIME.filter((re) => re.test(runtimeCode(source)));
    if (hits.length > 0) fail(`${rel} runtime-imports the full dictionary`);
    else ok(`${rel}: chrome-slice only`);
}

// --- 2. chrome modules stay self-contained ---
console.log("\n[chrome modules]");
for (const rel of ["lib/i18n/chrome-en.ts", "lib/i18n/chrome-fr.ts", "lib/i18n/chrome.ts"]) {
    const code = runtimeCode(read(rel));
    const bad = /from\s+["']\.\/(en|fr|en-app|fr-app)["']/.test(code) || /\bgetDictionary\b/.test(code);
    if (bad) fail(`${rel} imports the full dictionary or *-app`);
    else ok(`${rel}: self-contained`);
}

// --- 3. advisory scan of remaining client files ---
console.log("\n[advisory: other client files importing the full dictionary]");
function walk(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (entry === "node_modules" || entry === ".next") continue;
            walk(full, out);
        } else if (/\.(tsx?|jsx?)$/.test(entry)) {
            out.push(full);
        }
    }
    return out;
}

const rootDir = process.cwd();
let advisory = 0;
for (const full of walk(rootDir)) {
    const rel = full.replace(/\\/g, "/").split("/eea/").pop();
    if (!rel.startsWith("components/") && !rel.startsWith("app/")) continue;
    if (EVERY_PAGE_CLIENTS.includes(rel)) continue;
    if (rel.includes("/admin/") || rel.includes("/account/") || rel.includes("(app)/")) continue;
    const source = readFileSync(full, "utf8");
    if (!source.includes('"use client"') && !source.includes("'use client'")) continue;
    if (/\bgetDictionary\b/.test(runtimeCode(source))) {
        console.log(`  … ${rel} (per-page tolerated)`);
        advisory += 1;
    }
}
if (advisory === 0) console.log("  ok none");

console.log("");
if (failures > 0) {
    console.log(`RESULT: ${failures} leak(s) — the anonymous bundle would ship the full dictionary.`);
    process.exit(1);
}
console.log("RESULT: clean — every-page chrome is chrome-slice only.");
