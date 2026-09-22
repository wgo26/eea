/**
 * RLS invariant harness (audit W3/D3).
 *
 * Applies `supabase/test/harness-stubs.sql` (Supabase-equivalent scaffolding:
 * roles, auth/storage/cron schemas, hosted default privileges) and then EVERY
 * migration in supabase/migrations — in filename order — to an EPHEMERAL
 * Postgres database, followed by structural gates (RLS enabled on every public
 * table, policies present, role helpers executable). The behavioral suites in
 * `tests/integration/rls*.test.ts` then assert the actual policy semantics
 * (who can read/write what) against the same database.
 *
 * This is the first automated coverage for the RLS layer — previously the
 * only layer of the defense-in-depth chain (page guards → Server-Action
 * checks → RLS) with zero tests.
 *
 * Usage (local):
 *   docker run -d --name eea-rls-pg -e POSTGRES_PASSWORD=postgres -p 54329:5432 postgres:16
 *   $env:RLS_TEST_DATABASE_URL='postgresql://postgres:postgres@localhost:54329/postgres'
 *   node scripts/rls-harness.mjs
 *   npx vitest run tests/integration
 *
 * CI: the `rls-invariants` job in .github/workflows/ci.yml runs both steps
 * against a postgres:16 service container and BLOCKS on failure.
 *
 * Exits 2 without RLS_TEST_DATABASE_URL, 1 on any migration/structural failure.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const url = process.env.RLS_TEST_DATABASE_URL;
if (!url) {
    console.error(
        "RLS_TEST_DATABASE_URL is not set.\n" +
        "Start an ephemeral database first, e.g.:\n" +
        "  docker run -d --name eea-rls-pg -e POSTGRES_PASSWORD=postgres -p 54329:5432 postgres:16\n" +
        "  RLS_TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:54329/postgres",
    );
    process.exit(2);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

async function runSql(label, sql) {
    try {
        await client.query(sql);
    } catch (err) {
        console.error(`\n--- ${label} FAILED ---`);
        console.error(String(err.message ?? err).slice(0, 2000));
        process.exit(1);
    }
    console.log(`✓ ${label}`);
}

// 1. Supabase-equivalent scaffolding (roles, auth/storage/cron, default privs).
await runSql(
    "harness stubs (supabase/test/harness-stubs.sql)",
    readFileSync(path.resolve("supabase/test/harness-stubs.sql"), "utf8"),
);

// 2. Every migration, filename order — the same chain `supabase db push` runs.
const dir = path.resolve("supabase/migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
for (const file of files) {
    await runSql(file, readFileSync(path.join(dir, file), "utf8"));
}

// 3. Structural gates — cheap invariants the behavioral suites rely on.
function rlsEnabledSql(table) {
    return (
        `select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace ` +
        `where n.nspname = 'public' and c.relname = '${table}'`
    );
}

const gates = [
    ...["content_items", "content_translations", "submissions", "user_roles", "profiles", "data_requests"].map(
        (t) => [`RLS enabled on public.${t}`, rlsEnabledSql(t), (r) => r.rows[0]?.relrowsecurity === true],
    ),
    [
        "RLS enabled on EVERY public table (default grants make this mandatory)",
        `select count(*)::int as total, ` +
            `count(*) filter (where relrowsecurity)::int as secured, ` +
            `coalesce(string_agg(c.relname, ', ') filter (where not relrowsecurity), '') as missing ` +
            `from pg_class c join pg_namespace n on n.oid = c.relnamespace ` +
            `where n.nspname = 'public' and c.relkind = 'r'`,
        (r) => r.rows[0].total > 0 && r.rows[0].total === r.rows[0].secured,
    ],
    [
        "public schema carries a meaningful policy set",
        `select count(*)::int as n from pg_policies where schemaname = 'public'`,
        (r) => r.rows[0].n >= 40,
    ],
    [
        "anon can execute is_staff() (RLS policies depend on it)",
        `select has_function_privilege('anon', 'public.is_staff()', 'EXECUTE') as ok`,
        (r) => r.rows[0].ok === true,
    ],
    [
        "rate_limit_hits keeps its explicit revoke (no anon grant)",
        `select has_table_privilege('anon', 'public.rate_limit_hits', 'SELECT') as ok`,
        (r) => r.rows[0].ok === false,
    ],
];

for (const [label, sql, check] of gates) {
    let res;
    try {
        res = await client.query(sql);
    } catch (err) {
        console.error(`\n--- STRUCTURAL GATE ERROR: ${label} ---`);
        console.error(String(err.message ?? err).slice(0, 2000));
        process.exit(1);
    }
    if (!check(res)) {
        console.error(`STRUCTURAL GATE FAILED: ${label}`);
        console.error(JSON.stringify(res.rows[0]));
        process.exit(1);
    }
    console.log(`✓ ${label}`);
}

console.log(`\nHarness ready — ${files.length} migrations applied, ${gates.length} structural gates passed.`);
await client.end();
