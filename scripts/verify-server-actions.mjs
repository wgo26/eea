/**
 * Server Action export verification (audit — `next build` blocker gate).
 *
 * A module-level `'use server'` directive makes EVERY export in that file a
 * Server Action, and Next.js requires Server Actions to be async functions.
 * A synchronous export (a plain helper, a const lookup table, a class) fails
 * the production build with:
 *
 *   Error: Server Actions must be async functions.
 *
 * That failure is invisible to `tsc --noEmit`, `eslint`, and `vitest` — every
 * one of them passes — so it can only be surfaced by `next build`, which stops
 * at the first offending export and reports one error at a time. This gate
 * catches the whole class up front.
 *
 * Real example this shipped for: `lib/auth/actions.ts` exported
 * `enabledOAuthProviders()` (a synchronous env read used during render)
 * alongside its actions. The production build had never been re-verified, so
 * the app was undeployable. The fix moved provider config to
 * `lib/auth/oauth.ts` (a plain module).
 *
 * Allowed exports in a module-level `'use server'` file:
 *   - `export async function …` / `export async function* …`
 *   - `export async function default …`
 *   - `export type …` / `export interface …` (erased at compile time)
 *   - `export const x = async () => …` / `export const x = async function …`
 *   - `export type { … }` / `export { … } from` (type-only re-exports)
 *
 * Usage: node scripts/verify-server-actions.mjs  (exit 1 on any error)
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOTS = ["app", "lib", "components"];
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "out", "build"]);

function walk(dir, out = []) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = join(dir, entry.name);
        if (entry.isDirectory()) walk(full, out);
        else if (EXTS.has(extname(entry.name))) out.push(full);
    }
    return out;
}

/** True when the file's first statement is the 'use server' directive. */
function hasModuleDirective(src) {
    const stripped = src
        .replace(/^\uFEFF/, "")
        // Leading whitespace, line comments and block comments, then the directive.
        .replace(/^(?:\s|\/\/[^\n]*\n|\/\*[\s\S]*?\*\/)*/, "");
    return /^(['"])use server\1\s*;?/.test(stripped);
}

const files = ROOTS.flatMap((r) => {
    const abs = join(root, r);
    try {
        statSync(abs);
        return walk(abs);
    } catch {
        return [];
    }
});

const serverFiles = files.filter((f) => hasModuleDirective(readFileSync(f, "utf8")));
const errors = [];

for (const file of serverFiles) {
    const rel = file.slice(root.length + 1).replace(/\\/g, "/");
    const lines = readFileSync(file, "utf8").split(/\r?\n/);
    let inBlockComment = false;

    lines.forEach((line, i) => {
        if (inBlockComment) {
            if (line.includes("*/")) inBlockComment = false;
            return;
        }
        if (/^\s*\/\*/.test(line) && !line.includes("*/")) {
            inBlockComment = true;
            return;
        }
        const trimmed = line.trim();
        if (/^(\/\/|\*|\/\*)/.test(trimmed)) return;
        if (!/^export\b/.test(trimmed)) return;

        // Types and interfaces are erased — always fine.
        if (/^export\s+(type|interface)\b/.test(trimmed)) return;
        // Type-only re-export.
        if (/^export\s+type\s*\{/.test(trimmed)) return;
        // Async function declarations.
        if (/^export\s+async\s+(default\s+)?function\*?\s/.test(trimmed)) return;
        // Async arrow / function-expression consts.
        if (/^export\s+(const|let|var)\s+[\w$]+\s*=\s*async\b/.test(trimmed)) return;

        if (/^export\s+(const|let|var)\b/.test(trimmed)) {
            errors.push({
                rel,
                line: i + 1,
                why: "non-async value export",
                text: trimmed,
            });
            return;
        }
        if (/^export\s+(class|enum)\b/.test(trimmed)) {
            errors.push({
                rel,
                line: i + 1,
                why: "class/enum export",
                text: trimmed,
            });
            return;
        }
        if (/^export\s+\{/.test(trimmed)) {
            errors.push({
                rel,
                line: i + 1,
                why: "value re-export (cannot prove async — use `export type` or a plain module)",
                text: trimmed,
            });
            return;
        }
        errors.push({
            rel,
            line: i + 1,
            why: "non-async function export",
            text: trimmed,
        });
    });
}

if (errors.length > 0) {
    for (const e of errors) {
        console.error(`ERROR: ${e.why} in a 'use server' module — ${e.rel}:${e.line}`);
        console.error(`    ${e.text}`);
    }
    console.error(
        `Server Action check FAILED — ${errors.length} export(s) across ${serverFiles.length} ` +
            `'use server' file(s) would break \`next build\` ` +
            `("Server Actions must be async functions"). Move sync helpers into a plain module.`,
    );
    process.exit(1);
}

console.log(
    `Server Action exports OK: ${serverFiles.length} module-level 'use server' file(s), ` +
        `every export is an async function or a type.`,
);