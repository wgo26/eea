#!/usr/bin/env node
/**
 * W17 — Supabase schema lint, enforced only where a database URL exists.
 *
 * `supabase db lint` compiles the schema and flags plpgsql problems the RLS
 * harness cannot see (unused variables, unreachable branches, wrong types in
 * RPC bodies). It needs a real database connection, so this gate is
 * deliberately conditional: with `SUPABASE_DB_URL` set (CI secret / operator
 * shell) a lint failure fails the run; without it, the script exits 0 with an
 * explicit skip line so local and fork builds stay green.
 *
 * The CLI is invoked through `npx --yes supabase@latest` on purpose — the
 * project does not depend on the Supabase CLI, and pinning it here keeps the
 * CI image untouched. Operators run it manually as part of
 * `docs/validation-checklist.md`.
 */
import { spawnSync } from "node:child_process";

const dbUrl = (process.env.SUPABASE_DB_URL ?? "").trim();

if (!dbUrl) {
    console.log(
        "Supabase DB lint skipped — SUPABASE_DB_URL is not set (see docs/validation-checklist.md, R14).",
    );
    process.exit(0);
}

console.log("Running `supabase db lint` against the configured database (schema only, no data access)…");

const result = spawnSync(
    process.platform === "win32" ? "npx.cmd" : "npx",
    ["--yes", "supabase@latest", "db", "lint", "--db-url", dbUrl, "--level", "warning"],
    { stdio: "inherit" },
);

if (result.error) {
    console.error(`Supabase DB lint could not run: ${result.error.message}`);
    process.exit(1);
}

if (result.status !== 0) {
    console.error(
        `Supabase DB lint FAILED (exit ${result.status}). Fix the reported plpgsql/schema problems before merging.`,
    );
    process.exit(result.status ?? 1);
}

console.log("Supabase DB lint clean.");
