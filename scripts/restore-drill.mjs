#!/usr/bin/env node
/**
 * Database restore drill (audit A12 / PR-06 — Batch C).
 *
 * The nightly db-dump cron proves a dump EXISTS (verify-backup.mjs --mode=db
 * checks freshness); this proves it actually RESTORES — the RTO/RPO rehearsal
 * the production-readiness audit called for. One run:
 *
 *   1. reads the newest artifact from the `db_dumps` ledger;
 *   2. downloads it from B2 and verifies size + recorded SHA-256;
 *   3. gunzips it and sanity-lists the archive (pg_restore --list);
 *   4. re-runs the static migration manifest gate (scripts/verify-migrations.mjs);
 *   5. restores into a THROWAWAY PostgreSQL database (RESTORE_DB_URL);
 *   6. asserts —
 *        a. migration coverage: every repo migration that predates the dump
 *           must be recorded in supabase_migrations.schema_migrations;
 *        b. row-count floors on the core tables (content, profiles, roles,
 *           audit trail, dump ledger);
 *        c. restored <= live for monotonic tables when SUPABASE_DB_URL is
 *           available (a restore may lag the source, never exceed it).
 *
 * Exit codes: 0 = pass · 1 = drill failed · 2 = missing environment.
 *
 * Usage:
 *   node scripts/restore-drill.mjs [--dry-run] [--allow-host-match]
 *
 * Env (same names as scripts/verify-backup.mjs and the db-dump cron):
 *   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY — ledger read
 *   B2_ENDPOINT, B2_KEY_ID, B2_APPLICATION_KEY, B2_BACKUP_BUCKET
 *   RESTORE_DB_URL       — throwaway Postgres (required unless --dry-run)
 *   SUPABASE_DB_URL      — optional: enables the restored <= live assertions
 *   PG_RESTORE_BIN       — pg_restore binary (default: pg_restore)
 *
 * --dry-run            verify ledger entry + download + SHA-256 only.
 * --allow-host-match   override the guard that refuses to restore onto the
 *                      same host as SUPABASE_DB_URL (never production).
 *
 * Needs devDependencies installed (assertions use `pg`) — full `npm ci`.
 */
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createWriteStream, readdirSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGunzip } from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const flagSet = new Set(process.argv.slice(2).filter((a) => a.startsWith('--')));
const DRY_RUN = flagSet.has('--dry-run');
const ALLOW_HOST_MATCH = flagSet.has('--allow-host-match');

const fail = (msg, code = 1) => { console.error(`❌ ${msg}`); process.exit(code); };
const need = (name) => process.env[name] || fail(`Missing env ${name} (see script header)`, 2);

const SUPABASE_URL = need('NEXT_PUBLIC_SUPABASE_URL');
const SERVICE_KEY = need('SUPABASE_SERVICE_ROLE_KEY');
const B2_ENDPOINT = need('B2_ENDPOINT');
const B2_KEY_ID = need('B2_KEY_ID');
const B2_APPLICATION_KEY = need('B2_APPLICATION_KEY');
const B2_BACKUP_BUCKET = need('B2_BACKUP_BUCKET');
const RESTORE_DB_URL = process.env.RESTORE_DB_URL ?? null;
const LIVE_DB_URL = process.env.SUPABASE_DB_URL ?? null;
const PG_RESTORE = process.env.PG_RESTORE_BIN ?? 'pg_restore';

if (!DRY_RUN && !RESTORE_DB_URL) {
  fail('RESTORE_DB_URL required for a full drill (throwaway database — or pass --dry-run)', 2);
}

// Never restore onto the host we just backed up from: pg_restore --clean
// would DROP the live schema instead of rehearsing onto scratch.
if (!DRY_RUN && RESTORE_DB_URL && LIVE_DB_URL && !ALLOW_HOST_MATCH) {
  try {
    const restoreHost = new URL(RESTORE_DB_URL).host;
    const liveHost = new URL(LIVE_DB_URL).host;
    if (restoreHost === liveHost) {
      fail(
        `RESTORE_DB_URL host (${restoreHost}) equals SUPABASE_DB_URL host — refusing to --clean against it. ` +
          'Point RESTORE_DB_URL at a temp database, or pass --allow-host-match if you are certain.',
      );
    }
  } catch {
    /* unparsable URL — pg_restore itself will complain */
  }
}

const ledger = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const b2 = new S3Client({
  region: 'auto',
  endpoint: B2_ENDPOINT,
  credentials: { accessKeyId: B2_KEY_ID, secretAccessKey: B2_APPLICATION_KEY },
});

/* ------------------------------------------------------------------ */
/* Steps 1–3: ledger → B2 → hash                                       */
/* ------------------------------------------------------------------ */

async function latestDump() {
  const { data, error } = await ledger
    .from('db_dumps')
    .select('filename, sha256, size_bytes, created_at')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail(`db_dumps query failed: ${error.message}`);
  if (!data) fail('No db_dumps rows — has the db-dump cron ever succeeded? (verify-backup.mjs --mode=db)');
  return data;
}

async function download(filename) {
  console.log(`📥 Downloading db-dumps/${filename} from B2…`);
  const res = await b2.send(new GetObjectCommand({ Bucket: B2_BACKUP_BUCKET, Key: `db-dumps/${filename}` }));
  return Buffer.from(await res.Body.transformToByteArray());
}

function verifyIntegrity(buf, row) {
  const actual = createHash('sha256').update(buf).digest('hex');
  if (actual !== row.sha256) fail(`SHA-256 mismatch: ledger=${row.sha256} downloaded=${actual}`);
  if (row.size_bytes && buf.length !== row.size_bytes) {
    fail(`size mismatch: ledger=${row.size_bytes} downloaded=${buf.length}`);
  }
  console.log(`✅ integrity: sha256=${actual.slice(0, 16)}… size=${buf.length} OK`);
}

/* ------------------------------------------------------------------ */
/* Steps 4–5: list, manifest gate, restore                             */
/* ------------------------------------------------------------------ */

function run(bin, argv, { env } = {}) {
  return new Promise((resolve) => {
    const proc = spawn(bin, argv, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, ...env } });
    let out = '';
    let err = '';
    proc.stdout.on('data', (c) => { out += c; });
    proc.stderr.on('data', (c) => { err += c; });
    proc.on('error', (e) => resolve({ code: 127, out, err: err + e.message }));
    proc.on('close', (code) => resolve({ code: code ?? 1, out, err }));
  });
}

/** pg_restore TOC line looks like: `12345; 1234 16384 TABLE DATA public content_items` */
async function listArchive(dumpPath) {
  const r = await run(PG_RESTORE, ['--list', dumpPath]);
  if (r.code !== 0) fail(`pg_restore --list exited ${r.code}: ${r.err}`);
  const objects = r.out.split('\n').filter((l) => /^\s*\d+;/.test(l)).length;
  if (objects === 0) fail('pg_restore --list found no TOC entries — archive empty or corrupt');
  console.log(`📋 archive lists ${objects} TOC entries`);
}

async function staticManifestGate() {
  console.log('🧩 Re-running scripts/verify-migrations.mjs…');
  const r = await run(process.execPath, [join(root, 'scripts', 'verify-migrations.mjs')]);
  process.stdout.write(r.out);
  if (r.code !== 0) { process.stderr.write(r.err); fail('verify-migrations.mjs failed'); }
}

// pg_restore exits 1 on *non-fatal* per-object errors. Vanilla Postgres (the
// temp drill target) lacks a few Supabase-managed extensions, so those noise
// lines are allowed — anything else fails the drill, and the SQL assertions
// below independently prove the data actually landed.
const BENIGN_RE = /(extension .* is not available|already exists|WARNING)/i;

async function restore(dumpPath, dbUrl) {
  const u = new URL(dbUrl); // throws → caught by main()
  console.log(`🔧 pg_restore --clean → ${u.hostname}/${u.pathname.replace(/^\//, '')}…`);
  const argv = [
    '--clean', '--if-exists', '--no-owner', '--no-privileges',
    '-h', u.hostname,
    '-p', u.port || '5432',
    '-U', decodeURIComponent(u.username),
    '-d', decodeURIComponent(u.pathname.replace(/^\//, '')),
    dumpPath,
  ];
  const r = await run(PG_RESTORE, argv, { env: { PGPASSWORD: decodeURIComponent(u.password) } });
  if (r.code === 0) { console.log('✅ pg_restore completed'); return; }
  const bad = r.err.split('\n').map((l) => l.trim()).filter((l) => l && !BENIGN_RE.test(l));
  if (r.code === 1 && bad.length === 0) {
    console.warn('⚠️  pg_restore exited 1 with only benign noise (extension/exists warnings)');
    return;
  }
  fail(`pg_restore exited ${r.code}:\n${r.err}`);
}

/* ------------------------------------------------------------------ */
/* Step 6: assertions                                                  */
/* ------------------------------------------------------------------ */

const FLOORS = [
  ["status = 'published' AND NOT is_archived", 'content_items', 1, 'published content'],
  [null, 'content_translations', 1, 'content translations'],
  [null, 'profiles', 1, 'profiles'],
  [null, 'user_roles', 1, 'user roles'],
  [null, 'audit_events', 1, 'audit trail'],
  [null, 'db_dumps', 1, 'dump ledger'],
];

const MONOTONIC = ['content_items', 'content_translations', 'profiles', 'media_assets'];

async function assertRestored(dbUrl, dumpCreatedAt) {
  let pg;
  try {
    pg = (await import('pg')).default;
  } catch {
    fail('`pg` is unavailable — run a full `npm ci` (devDependencies) before the drill');
  }
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    // a. Migration coverage — every repo migration the dump predates must be in it.
    let migRows;
    try {
      ({ rows: migRows } = await client.query('SELECT version FROM supabase_migrations.schema_migrations'));
    } catch (e) {
      throw new Error(`supabase_migrations.schema_migrations unreadable: ${e.message}`);
    }
    const have = new Set(migRows.map((r) => String(r.version)));
    const dumpStamp = new Date(dumpCreatedAt).toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const repo = readdirSync(join(root, 'supabase', 'migrations'))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => ({ file: f, stamp: f.slice(0, 14) }));
    const missingRequired = [];
    const missingNewer = [];
    for (const m of repo) {
      if (have.has(m.stamp)) continue;
      (m.stamp <= dumpStamp ? missingRequired : missingNewer).push(m.file);
    }
    if (missingRequired.length > 0) {
      fail(
        `migration coverage FAILED — ${missingRequired.length} repo migration(s) predate the dump but are ` +
          `absent from restored supabase_migrations:\n  ${missingRequired.join('\n  ')}`,
      );
    }
    if (missingNewer.length > 0) {
      console.warn(`⚠️  ${missingNewer.length} repo migration(s) postdate the dump: ${missingNewer.join(', ')}`);
    }
    console.log(
      `✅ migration coverage: ${repo.length - missingNewer.length}/${repo.length} repo migrations in artifact ` +
        `(${have.size} versions recorded in restored schema_migrations)`,
    );

    // b. Row-count floors — a successful pg_restore must land real data.
    for (const [where, table, min, label] of FLOORS) {
      const sql = `SELECT count(*)::int AS n FROM public.${table}${where ? ` WHERE ${where}` : ''}`;
      const { rows } = await client.query(sql).catch((e) => { throw new Error(`${table}: ${e.message}`); });
      const n = rows[0].n;
      if (n < min) fail(`row-count floor FAILED: ${label} (${table}) = ${n}, expected >= ${min}`);
      console.log(`   ${table}: ${n} rows OK (${label})`);
    }

    // c. restored <= live — a restore may lag the source, never exceed it.
    if (LIVE_DB_URL) {
      const live = new pg.Client({ connectionString: LIVE_DB_URL });
      await live.connect();
      try {
        for (const table of MONOTONIC) {
          const r = await client.query(`SELECT count(*)::int AS n FROM public.${table}`);
          const l = await live.query(`SELECT count(*)::int AS n FROM public.${table}`);
          if (r.rows[0].n > l.rows[0].n) {
            fail(`restored > live on ${table}: restored=${r.rows[0].n} live=${l.rows[0].n} — dump is suspect`);
          }
          console.log(`   ${table}: restored ${r.rows[0].n} <= live ${l.rows[0].n} OK`);
        }
      } finally {
        await live.end();
      }
    } else {
      console.log('ℹ️  SUPABASE_DB_URL unset — skipping restored <= live comparison');
    }
  } finally {
    await client.end();
  }
}

/* ------------------------------------------------------------------ */

async function main() {
  console.log(`🚀 restore drill ${DRY_RUN ? '(dry-run) ' : ''}${new Date().toISOString()}`);

  const dump = await latestDump();
  console.log(`📦 latest artifact: ${dump.filename} (${dump.size_bytes} bytes, ${dump.created_at})`);

  const gz = await download(dump.filename);
  verifyIntegrity(gz, dump);

  if (DRY_RUN) {
    console.log('✅ dry-run PASSED — artifact exists and matches its ledger checksum');
    return;
  }

  const tmp = await mkdtemp(join(tmpdir(), 'restore-drill-'));
  try {
    const dumpPath = join(tmp, 'restore.dump');
    async function* bufferSource() { yield gz; }
    await pipeline(bufferSource(), createGunzip(), createWriteStream(dumpPath));

    await listArchive(dumpPath);
    await staticManifestGate();
    await restore(dumpPath, RESTORE_DB_URL);
    await assertRestored(RESTORE_DB_URL, dump.created_at);

    console.log('✅ restore drill PASSED — dump restores, manifest covered, rows present');
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => fail(err?.stack ?? String(err)));



