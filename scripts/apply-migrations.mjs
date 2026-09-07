/**
 * Applies the SQL migrations in supabase/migrations to the linked Supabase
 * project using the service-role key (same credentials as scripts/seed-demo.mjs).
 *
 * Order is guaranteed by sorting filenames. Mirrors `supabase db push` for the
 * cases where the CLI isn't linked locally.
 *
 * Run: node scripts/apply-migrations.mjs
 */
import { readFileSync, readdirSync } from "node:fs";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(\\S+)`, "m"))?.[1];
const URL_ = get("NEXT_PUBLIC_SUPABASE_URL");
const KEY = get("SUPABASE_SERVICE_ROLE_KEY");
if (!URL_ || !KEY) throw new Error("Missing Supabase env vars in .env");

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

async function run(file) {
    const sql = readFileSync(new URL(file, dir), "utf8");
    const res = await fetch(`${URL_}/sql`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: KEY,
            Authorization: `Bearer ${KEY}`,
            "X-Client-Info": "eea-apply-migrations",
        },
        body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (!res.ok) {
        throw new Error(`\n--- ${file} FAILED (HTTP ${res.status}) ---\n${text.slice(0, 2000)}`);
    }
    // Supabase returns an array of command statuses when successful.
    console.log(`✓ ${file} applied`);
}

for (const f of files) {
    await run(f);
}
console.log("All migrations applied.");
