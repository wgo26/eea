/**
 * Shared grep helper for the verify-* gates.
 *
 * `git grep` exits 1 on "no matches" (the clean state) and the `|| true`
 * idiom is a syntax error under PowerShell, so every gate funnels through
 * this helper: try `git grep` on the scoped paths, fall back to a pure-Node
 * recursive scan of the working tree when git is unavailable, and return the
 * trimmed hit list ("" = clean).
 */
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const SKIP_DIRS = new Set([
    ".git",
    ".next",
    ".kilo",
    "node_modules",
    "out",
    "build",
    "coverage",
]);

function walkFiles(dir, out = []) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walkFiles(full, out);
        else if (/\.(tsx?|jsx?|mjs|cjs|json|css|md)$/.test(entry.name)) out.push(full);
    }
    return out;
}

export function grepHits(patternSource, scopes = []) {
    const pattern = new RegExp(patternSource);
    // 1. Prefer git grep (fast, respects .gitignore) — scoped to the repo root.
    for (const scope of scopes.length ? scopes : ["."]) {
        try {
            const out = execSync(`git grep -n "${patternSource}" -- ${scope}`, {
                cwd: root,
                encoding: "utf8",
                stdio: ["ignore", "pipe", "ignore"],
            }).trim();
            if (out) return out;
        } catch (err) {
            const out = String(err?.stdout ?? "").trim();
            if (out) return out;
            // Empty output + non-zero exit = "no matches" OR git unavailable.
            // Continue to the filesystem fallback below.
        }
    }
    // 2. Filesystem fallback (pure Node — no shell operators involved).
    const hits = [];
    const roots = (scopes.length ? scopes : ["."]).map((s) => join(root, s));
    for (const base of roots) {
        let isDir = false;
        try {
            isDir = statSync(base).isDirectory();
        } catch {
            continue;
        }
        const files = isDir ? walkFiles(base) : [base];
        for (const file of files) {
            let src;
            try {
                src = readFileSync(file, "utf8");
            } catch {
                continue;
            }
            src.split(/\r?\n/).forEach((line, i) => {
                if (pattern.test(line)) {
                    hits.push(`${file.replace(/\\/g, "/").replace(root.replace(/\\/g, "/") + "/", "")}:${i + 1}:${line.trim().slice(0, 160)}`);
                }
            });
        }
    }
    return hits.join("\n").trim();
}
