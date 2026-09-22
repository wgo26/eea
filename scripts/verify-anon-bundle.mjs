/**
 * Phase 1 — anonymous font + bundle budget gate (build-free, static).
 *
 * Acceptance (audit Phase 1): homepage JS ≤ 120 KB gzipped. A full
 * @next/bundle-analyzer budget would add build cost on every check run, so
 * this gate enforces the structural causes instead:
 *
 *   1. Root layout ships Inter only — GeistSans (dead code: nothing reads
 *      --font-geist-sans) must not be loaded there, and GeistMono
 *      (--font-geist-mono, admin/account-only) must not be attached at root
 *      (it lives on the (app) subtree via app/[locale]/(app)/fonts.ts).
 *   2. No Google-Fonts <link>/network import on the anonymous path
 *      (self-hosted next/font/local only).
 *   3. Every-page client chrome stays chrome-slice only (delegates to
 *      verify-client-dictionary.mjs) — the full EN+FR dictionary (with the
 *      ~147 KB of *-app admin vocabulary) must never enter the bundle.
 *
 * Exit code: 0 when clean, 1 otherwise.
 *
 * Run: node scripts/verify-anon-bundle.mjs (wired into `npm run check`)
 */
import { readFileSync } from "node:fs";

const root = new URL("..", import.meta.url);
const read = (rel) => readFileSync(new URL(rel, root), "utf8");

let failures = 0;
const fail = (msg) => {
    console.error(`  X ${msg}`);
    failures += 1;
};
const ok = (msg) => console.log(`  ok ${msg}`);

// --- 1. root font budget ---
console.log("[root font budget]");
const layout = read("app/layout.tsx");
if (/Geist-Variable\.woff2/.test(layout)) {
    fail("app/layout.tsx loads Geist-Variable.woff2 (dead code — nothing reads --font-geist-sans)");
} else {
    ok("no GeistSans download at root");
}
if (/geistMono\.variable|GeistMono-Variable\.woff2/.test(layout)) {
    fail("app/layout.tsx attaches GeistMono at root (admin/account-only — lives in app/[locale]/(app)/fonts.ts)");
} else {
    ok("no GeistMono download at root");
}
if (!/Inter-Variable\.woff2/.test(layout)) {
    fail("app/layout.tsx no longer ships the Inter variable font");
} else {
    ok("Inter body font at root");
}
// Display-serif exception (editorial headlines only): exactly the two
// self-hosted Newsreader static weights via --font-display. The full
// variable file (132 KB) was rejected for the data-plan budget; 700 + 800
// static latin total ~47 KB, display:swap, and `font-display` is opt-in per
// headline so body UI never triggers the download.
if (!/Newsreader-(Bold|ExtraBold)\.woff2/.test(layout) || !/--font-display/.test(layout)) {
    fail("app/layout.tsx must load the Newsreader display serif (Bold + ExtraBold) with --font-display");
} else {
    ok("Newsreader display serif at root (headlines only)");
}
if (/Newsreader-Variable\.woff2/.test(layout)) {
    fail("app/layout.tsx loads the 132 KB Newsreader variable file — static Bold + ExtraBold only");
} else {
    ok("no variable-serif download at root");
}
const appFonts = read("app/[locale]/(app)/fonts.ts");
if (!/GeistMono-Variable\.woff2/.test(appFonts) || !/--font-geist-mono/.test(appFonts)) {
    fail("app/[locale]/(app)/fonts.ts must load GeistMono with --font-geist-mono for the (app) subtree");
} else {
    ok("(app) subtree carries the mono font");
}

// --- 2. no remote font pipeline on the anonymous path ---
console.log("\n[no remote fonts]");
const globals = read("app/globals.css");
const layoutHead = layout
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
const remoteFont = /fonts\.googleapis\.com|fonts\.gstatic\.com|<link[^>]*fonts\.googleapis|<link[^>]*fonts\.gstatic|@import\s+url\(['"]?https?:/.test(globals + "\n" + layoutHead);
if (remoteFont) {
    fail("remote font import detected (anonymous path must be self-hosted next/font/local only)");
} else {
    ok("self-hosted fonts only");
}

// --- 3. dictionary-leak gate (structural half of the 120 KB budget) ---
console.log("\n[dictionary leak gate]");
const { execSync } = await import("node:child_process");
try {
    execSync("node scripts/verify-client-dictionary.mjs", { stdio: "inherit" });
    ok("client dictionary gate clean");
} catch {
    fail("verify-client-dictionary.mjs reported leaks (see output above)");
}

// --- 4. Phase 0 — service-role secret must never reach the client bundle ---
// Static scan over client-reachable sources: components/ must not reference
// the service-role key or admin client. Server route handlers (route.ts),
// server actions ('use server') and lib/supabase/admin.ts itself are
// server-only by construction and are excluded — the gate targets the client
// bundle (components/ + "use client" files).
// NOTE: no `|| true` shell operator here — the script runs under PowerShell
// on Windows dev hosts where that is a syntax error. `git grep` exits 1 on
// "no matches" (the clean state); execSync throws, we treat empty stdout as
// clean. A repo-wide fallback covers worktrees where `git grep` scoping
// misbehaves.
console.log("\n[service-role bundle gate]");
{
    const { grepHits } = await import("./lib/grep-hits.mjs");
    const hits = grepHits("SUPABASE_SERVICE_ROLE_KEY|createAdminClient|service_role", ["components"]);
    if (hits) {
        fail(`service-role reference in client components/:\n${hits}`);
    } else {
        ok("no service-role references in components/");
    }
}

console.log("");
if (failures > 0) {
    console.log(`RESULT: ${failures} budget violation(s) — anonymous bundle would exceed the Phase 1 budget.`);
    process.exit(1);
}
console.log("RESULT: clean — root ships Inter (+ opt-in Newsreader headlines), no remote fonts, no dictionary leak.");
