#!/usr/bin/env node
/**
 * W17 — size ratchet (lib/admin, components/admin, admin content form).
 *
 * The audit's code-health item is "no file > 800 lines in lib/admin". Splitting
 * is only ever done once per file, so the durable part of that rule is a
 * ratchet: no file may cross the cap, and the one file that is still above it
 * (lib/admin/actions.ts — the 4,085-line server-action surface) may only get
 * *smaller*. That keeps the problem from silently re-growing while the staged
 * split lands, and it fails loudly if a new god-module appears.
 *
 * W20 — the cap now also covers `components/admin` and the admin content
 * directory. Those were previously unmeasured, which is exactly how
 * content-form.tsx grew past 1,700 lines while lib/admin stayed clean: the rule
 * only applied to the directory already being split. A component file of that
 * size also re-renders its whole subtree on every keystroke, so this ceiling
 * doubles as a performance guardrail.
 *
 * Read-only.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const CAP = 800;

/** Directories the cap applies to. */
const SCANNED_DIRS = ["lib/admin", "components/admin", "app/[locale]/(app)/admin/content"];

/**
 * Files allowed to exceed the cap — each with the ceiling it may not grow past.
 * Lower the ceiling to the file's current size every time the split lands.
 */
const ALLOWLIST = {
    // W17 split landed: lib/admin/actions.ts is gone (per-domain modules in
    // lib/admin/actions/, each under the cap).
    //
    // W20: the content form is being split into per-section modules
    // (form/fields, form/details, form/media, form/classify, form/seo,
    // form/publish). Its ceiling is pinned at the size it was when the
    // cap was extended, so the file may only shrink from here.
    "app/[locale]/(app)/admin/content/content-form.tsx": 1773,
};

function walk(dir, out = []) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (entry.name === "node_modules" || entry.name === ".next") continue;
            walk(join(dir, entry.name), out);
        } else if (/\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
            out.push(join(dir, entry.name));
        }
    }
    return out;
}

let files = [];
for (const dir of SCANNED_DIRS) {
    try {
        walk(join(ROOT, dir), files);
    } catch {
        // A scanned directory that does not exist yet is not a failure; the
        // ratchet applies to whatever is present.
    }
}

if (files.length === 0) {
    console.log("No scanned directories found — size ratchet skipped.");
    process.exit(0);
}

const problems = [];
const rows = [];
for (const file of files) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    const lineCount = readFileSync(file, "utf8").split(/\r?\n/).length;
    rows.push([rel, lineCount]);
    const ceiling = ALLOWLIST[rel];
    if (ceiling === undefined) {
        if (lineCount > CAP) {
            problems.push(
                `${rel} — ${lineCount} lines (cap ${CAP}). Split it by domain, then ratchet the ceiling down.`,
            );
        }
        continue;
    }
    if (lineCount > ceiling) {
        problems.push(
            `${rel} — ${lineCount} lines, above its recorded ceiling of ${ceiling}. This file is being split by domain; it may not grow.`,
        );
    }
}

if (problems.length > 0) {
    console.error(`Size ratchet FAILED — ${problems.length} problem(s):\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
}

const largest = rows.sort((a, b) => b[1] - a[1]).slice(0, 6);
console.log(
    `Size ratchet OK — ${files.length} file(s) across ${SCANNED_DIRS.length} dir(s), cap ${CAP}, ${Object.keys(ALLOWLIST).length} allowlisted.`,
);
for (const [rel, lineCount] of largest) {
    console.log(`  ${String(lineCount).padStart(5)}  ${rel}${ALLOWLIST[rel] ? "  (allowlisted, split in progress)" : ""}`);
}
