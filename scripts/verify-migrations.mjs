/**
 * Migration manifest verification (audit §6.1 — CI migration gate).
 *
 * Static checks over supabase/migrations that need no database:
 *   - every file is named <YYYYMMDDHHMMSS>_<snake_case_name>.sql (the format
 *     the Supabase CLI requires — a malformed name breaks `db lint`/`push`);
 *   - no migration file is empty (an empty file silently no-ops in prod);
 *   - duplicate timestamps are an ERROR: `supabase_migrations` PK is
 *     (version), so two files sharing a timestamp can never both be recorded —
 *     `db push` fails with a duplicate-key violation after running the second
 *     migration's statements (which then roll back). This repo originally
 *     shipped one such pair (20260921000000_db_maintenance +
 *     _production_phase1_3_fixes); the latter was renumbered to
 *     20260921120000 after exactly that failure. Never reuse a version prefix.
 *
 * Live SQL linting (`supabase db lint`) is the CI workflow's conditional step.
 *
 * Usage: node scripts/verify-migrations.mjs  (exit 1 on any error so CI gates)
 */
import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "supabase", "migrations");
const NAME_RE = /^(\d{14})_[a-z0-9_]+\.sql$/;

let files;
try {
    files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
} catch {
    console.error(`ERROR: cannot read migration directory ${dir}`);
    process.exit(1);
}

if (files.length === 0) {
    console.error("ERROR: no migration files found in supabase/migrations.");
    process.exit(1);
}

const errors = [];
const seenStamps = new Map();

for (const file of files) {
    const m = file.match(NAME_RE);
    if (!m) {
        errors.push(
            `Invalid migration filename (expected <YYYYMMDDHHMMSS>_<snake_name>.sql): ${file}`,
        );
        continue;
    }
    const stamp = m[1];
    if (seenStamps.has(stamp)) {
        errors.push(
            `Duplicate timestamp ${stamp}: ${seenStamps.get(stamp)} and ${file}. ` +
                `supabase_migrations PK is (version), so only one can ever be recorded — ` +
                `db push fails with a duplicate-key violation. Renumber one file to a unique timestamp.`,
        );
    } else {
        seenStamps.set(stamp, file);
    }

    const sql = readFileSync(join(dir, file), "utf8");
    if (sql.trim().length === 0) {
        errors.push(`Migration file is empty: ${file}`);
    }
}

if (errors.length > 0) {
    for (const e of errors) console.error(`ERROR: ${e}`);
    console.error(
        `Migration manifest check FAILED — ${errors.length} error(s) across ${files.length} files.`,
    );
    process.exit(1);
}

console.log(
    `Migration manifest OK: ${files.length} migrations, latest ${files[files.length - 1]}.`,
);
