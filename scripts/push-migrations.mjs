/**
 * Applies every un-applied supabase/migrations file to the live project via
 * the session-pooler connection string (SUPABASE_DB_URL in .env), recording
 * each into a `schema_migrations` tracking table so re-runs are no-ops.
 *
 * This mirrors `supabase db push` for projects the local CLI account cannot
 * manage. All migrations are idempotent (scripts/verify-migrations.mjs
 * gate) and transaction-safe; each file is wrapped and tracked individually.
 *
 * Run: node scripts/push-migrations.mjs [--force]   (--force re-runs even tracked ones)
 */
import { readFileSync, readdirSync } from "node:fs";
import { Client } from "pg";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const dbUrl = env.match(/^SUPABASE_DB_URL=(\S+)/m)?.[1];
if (!dbUrl || !/^postgres(ql)?:\/\//i.test(dbUrl)) {
  console.error(
    "SUPABASE_DB_URL is empty in .env.\n" +
      "Get it from: Supabase Dashboard → your project → Connect → Connection string →\n" +
      "  Session pooler (or Database → Connections) and paste it as SUPABASE_DB_URL=... in .env,\n" +
      "then re-run: node scripts/push-migrations.mjs",
  );
  process.exit(1);
}

const force = process.argv.includes("--force");
const dir = new URL("../supabase/migrations/", import.meta.url);
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = new Client({ connectionString: dbUrl, ssl: /supabase\.co/.test(dbUrl) ? { rejectUnauthorized: false } : undefined });
await client.connect();
try {
  await client.query(`create table if not exists public.schema_migrations (
    version text primary key,
    applied_at timestamptz not null default now()
  )`);
  const { rows } = await client.query("select version from public.schema_migrations");
  const applied = new Set(rows.map((r) => r.version));

  let ran = 0;
  for (const file of files) {
    const version = file.split("_")[0];
    if (!force && applied.has(version)) {
      console.log(`= ${file}`);
      continue;
    }
    const sql = readFileSync(new URL(file, dir), "utf8");
    console.log(`> applying ${file} ...`);
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into public.schema_migrations (version) values ($1) on conflict do nothing", [version]);
      await client.query("commit");
      ran += 1;
    } catch (e) {
      await client.query("rollback").catch(() => {});
      console.error(`! ${file} FAILED: ${e.message}\n  Fix the SQL or mark it applied if intentional, then re-run.`);
      process.exitCode = 1;
      break;
    }
  }
  console.log(ran > 0 ? `Done — ${ran} migration(s) applied.` : "Nothing to apply — remote is up to date.");
} finally {
  await client.end();
}
