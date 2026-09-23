#!/usr/bin/env node
/**
 * W17 (R13) — Next-upgrade rehearsal gate for the caching surface.
 *
 * The Next 16 upgrade already broke this codebase once in a way no unit test
 * caught: `revalidateTag(tag)` became single-arg-deprecated (the profile
 * argument is now required) and every `unstable_cache` call must declare its
 * key parts. An upgrade rehearsal only helps if it is executable, so these two
 * invariants are enforced on every `npm run check` instead of living in a
 * checklist nobody runs:
 *
 *   1. every `revalidateTag(` call passes exactly two arguments
 *      (`revalidateTag(tag, 'max')`) — the deprecation that silently stopped
 *      on-demand invalidation;
 *   2. every `unstable_cache(` call passes a key-parts array AND an options
 *      object carrying `revalidate` or `tags` — without one, a cached read has
 *      no expiry and no invalidation path.
 *
 * Read-only static analysis: no network, no build, no DB.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".kilo", "scratch", "supabase"]);
const ROOTS = ["app", "components", "lib", "scripts"];

/** Every .ts/.tsx/.mjs under the given roots. */
function walk(dir, out = []) {
    let entries;
    try {
        entries = readdirSync(dir, { withFileTypes: true });
    } catch {
        return out;
    }
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            walk(join(dir, entry.name), out);
        } else if (/\.(ts|tsx|mjs)$/.test(entry.name) && !entry.name.endsWith(".d.ts")) {
            out.push(join(dir, entry.name));
        }
    }
    return out;
}

/**
 * Blank out comments and string/template literals, preserving offsets and line
 * breaks. Scanning the raw text would match the *prose* about these APIs in
 * JSDoc (and this file's own comments), which is how a gate becomes noise.
 */
function blankCommentsAndStrings(text) {
    const out = text.split("");
    let state = "code";
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const next = text[i + 1];
        if (state === "code") {
            if (ch === "/" && next === "/") {
                state = "line";
                out[i] = " ";
                continue;
            }
            if (ch === "/" && next === "*") {
                state = "block";
                out[i] = " ";
                continue;
            }
            if (ch === '"' || ch === "'" || ch === "`") {
                state = ch;
                out[i] = " ";
                continue;
            }
            continue;
        }
        if (state === "line") {
            if (ch === "\n") {
                state = "code";
                continue;
            }
            out[i] = " ";
            continue;
        }
        if (state === "block") {
            if (ch === "*" && next === "/") {
                out[i] = " ";
                out[i + 1] = " ";
                i += 1;
                state = "code";
                continue;
            }
            if (ch !== "\n") out[i] = " ";
            continue;
        }
        // inside a string/template literal
        if (ch === "\\") {
            out[i] = " ";
            if (next !== "\n") {
                out[i + 1] = " ";
                i += 1;
            }
            continue;
        }
        if (ch === state) {
            state = "code";
            out[i] = " ";
            continue;
        }
        if (ch !== "\n") out[i] = " ";
    }
    return out.join("");
}

/**
 * The text between a call's parentheses (paren-depth only).
 *
 * Deliberately not "split the arguments": TypeScript generics such as
 * `Record<string, AdCreative>` carry a comma at what looks like top level to a
 * character scanner, which shifts every argument after it. A real parser is not
 * worth the dependency here — the load-bearing question is "does this cached
 * call declare an expiry/invalidation path anywhere in its own region".
 */
function callRegion(text, openParenIndex) {
    let depth = 0;
    for (let i = openParenIndex; i < text.length; i += 1) {
        const ch = text[i];
        if (ch === "(") depth += 1;
        else if (ch === ")") {
            depth -= 1;
            if (depth === 0) return text.slice(openParenIndex + 1, i);
        }
    }
    return null;
}

/** Split a call's argument list into top-level arguments, starting at the index
 * of the opening paren. Handles nested parens/brackets/braces so a comma inside
 * a nested call or array never splits an argument. */
function callArgs(text, openParenIndex) {
    const args = [];
    let depth = 0;
    let current = "";
    let quote = null;
    for (let i = openParenIndex; i < text.length; i += 1) {
        const ch = text[i];
        const prev = text[i - 1];
        if (quote) {
            current += ch;
            if (ch === quote && prev !== "\\") quote = null;
            continue;
        }
        if (ch === '"' || ch === "'" || ch === "`") {
            quote = ch;
            current += ch;
            continue;
        }
        if (ch === "/" && text[i + 1] === "/") {
            while (i < text.length && text[i] !== "\n") i += 1;
            continue;
        }
        if (ch === "(" || ch === "[" || ch === "{") {
            depth += 1;
            if (depth === 1 && ch === "(") continue;
            current += ch;
            continue;
        }
        if (ch === ")" || ch === "]" || ch === "}") {
            depth -= 1;
            if (depth === 0) {
                args.push(current.trim());
                return args;
            }
            current += ch;
            continue;
        }
        if (ch === "," && depth === 1) {
            args.push(current.trim());
            current = "";
            continue;
        }
        current += ch;
    }
    return args;
}

const problems = [];
const notes = [];
const files = ROOTS.flatMap((root) => {
    try {
        return statSync(root).isDirectory() ? walk(root) : [root];
    } catch {
        return [];
    }
});

for (const file of files) {
    // Positions/line numbers are preserved by the blanker (newlines kept), so
    // diagnostics still point at the real source line.
    const text = blankCommentsAndStrings(readFileSync(file, "utf8"));
    const rel = relative(ROOT, file).replace(/\\/g, "/");

    for (const match of text.matchAll(/\brevalidateTag\s*\(/g)) {
        const openParen = match.index + match[0].length - 1;
        const args = callArgs(text, openParen);
        if (args.length !== 2) {
            const line = text.slice(0, match.index).split("\n").length;
            problems.push(
                `${rel}:${line} — revalidateTag() takes (tag, profile); found ${args.length} argument(s). Next 16 deprecates the single-argument form.`,
            );
        }
    }

    for (const match of text.matchAll(/\bunstable_cache\s*\(/g)) {
        const openParen = match.index + match[0].length - 1;
        const region = callRegion(text, openParen);
        const line = text.slice(0, match.index).split("\n").length;
        if (region === null) {
            // Unbalanced (a regex literal with a paren we cannot see through).
            // Not a finding — report it so the gate can never fail silently.
            notes.push(`${rel}:${line} — could not delimit the unstable_cache() call; skipped.`);
            continue;
        }
        if (!/\b(revalidate|tags)\s*:/.test(region)) {
            problems.push(
                `${rel}:${line} — unstable_cache() options must carry \`revalidate\` or \`tags\`, otherwise the cache entry can never be expired.`,
            );
        }
        if (!/\[/.test(region)) {
            problems.push(
                `${rel}:${line} — unstable_cache() must declare its key parts as an array.`,
            );
        }
    }
}

if (problems.length > 0) {
    console.error(`Next caching invariants FAILED — ${problems.length} problem(s):\n`);
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
}

for (const note of notes) console.log(`  note: ${note}`);

console.log(
    `Next caching invariants OK: ${files.length} file(s) checked — every revalidateTag() is two-argument and every unstable_cache() declares keys + expiry.`,
);
