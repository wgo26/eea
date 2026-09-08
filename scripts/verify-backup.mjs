/**
 * Phase 3.2 — Backup integrity verification & restore drill (audit §5.1).
 *
 * Usage:
 *   node scripts/verify-backup.mjs [--batch=50] [--mode=verify|drill] [--key=<storage_key>] [--out=./.tmp/restore]
 *
 * - verify (default): checks the N oldest mirrored-but-unverified media_assets
 *   rows — downloads source (R2 / Supabase Storage) + B2 copy, compares SHA-256,
 *   prints a table. Exit 1 on any mismatch/error so CI can gate on it.
 * - drill: restores ONE B2 object to disk (--key required, or the oldest
 *   verified row) and confirms its hash matches media_assets.backup_sha256.
 *
 * Env required: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * R2_ACCOUNT_ID/ACCESS/SECRET/BUCKET, B2_KEY_ID/APPLICATION_KEY/BACKUP_BUCKET/ENDPOINT,
 * SUPABASE_ADMIN_ASSET_BUCKET (optional, default admin-asset).
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const m = a.match(/^--([^=]+)(=(.*))?$/);
    return m ? [m[1], m[3] ?? '1'] : ['_', a];
  }),
);
const mode = args.mode ?? 'verify';
const batch = Math.min(Math.max(1, Number(args.batch ?? 50)), 200);
const onlyKey = args.key ?? null;
const outDir = args.out ?? './.tmp/restore-drill';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});
const b2 = new S3Client({
  region: 'auto',
  endpoint: process.env.B2_ENDPOINT,
  credentials: { accessKeyId: process.env.B2_KEY_ID, secretAccessKey: process.env.B2_APPLICATION_KEY },
});
const R2_BUCKET = process.env.R2_BUCKET;
const B2_BUCKET = process.env.B2_BACKUP_BUCKET;
const SUPA_BUCKET = process.env.SUPABASE_ADMIN_ASSET_BUCKET || 'admin-asset';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

async function s3Bytes(client, Bucket, Key) {
  const res = await client.send(new GetObjectCommand({ Bucket, Key }));
  return Buffer.from(await res.Body.transformToByteArray());
}

async function sourceBytes(row) {
  if (row.provider === 'r2') return s3Bytes(r2, R2_BUCKET, row.storage_key);
  const { data, error } = await supabase.storage.from(SUPA_BUCKET).download(row.storage_key);
  if (error || !data) throw new Error(`supabase download failed: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

async function fetchRows() {
  let q = supabase
    .from('media_assets')
    .select('id, storage_key, provider, backup_sha256, backed_up_at')
    .not('storage_key', 'is', null)
    .not('backed_up_at', 'is', null)
    .order('backed_up_at', { ascending: true })
    .limit(onlyKey ? 100 : batch);
  if (onlyKey) q = q.eq('storage_key', onlyKey);
  const { data, error } = await q;
  if (error) throw new Error(`db query failed: ${error.message}`);
  return data ?? [];
}

if (mode === 'drill') {
  const rows = await fetchRows();
  const row = onlyKey ? rows[0] : rows[0];
  if (!row) {
    console.error('No mirrored row found for drill (is anything backed up yet?).');
    process.exit(1);
  }
  const buf = await s3Bytes(b2, B2_BUCKET, row.storage_key);
  const hash = sha256(buf);
  await mkdir(outDir, { recursive: true });
  const file = join(outDir, row.storage_key.replaceAll('/', '__'));
  await writeFile(file, buf);
  console.log(`Restored ${row.storage_key} (${buf.byteLength} bytes) -> ${file}`);
  console.log(`sha256: ${hash}`);
  if (row.backup_sha256 && row.backup_sha256 !== hash) {
    console.error(`MISMATCH: db backup_sha256=${row.backup_sha256} b2=${hash}`);
    process.exit(1);
  }
  console.log(row.backup_sha256 ? 'OK: matches backup_sha256.' : 'OK: downloaded (no backup_sha256 recorded yet).');
} else {
  const rows = await fetchRows();
  if (rows.length === 0) {
    console.log('No mirrored rows to verify yet (backed_up_at is null everywhere).');
    process.exit(0);
  }
  let ok = 0;
  let bad = 0;
  for (const row of rows) {
    try {
      const [src, bak] = await Promise.all([sourceBytes(row), s3Bytes(b2, B2_BUCKET, row.storage_key)]);
      const sh = sha256(src);
      const bh = sha256(bak);
      const expected = row.backup_sha256 ?? sh;
      const pass = sh === expected && bh === expected;
      console.log(`${pass ? 'PASS' : 'FAIL'}  ${row.storage_key}  src=${sh.slice(0, 12)} b2=${bh.slice(0, 12)} expected=${String(expected).slice(0, 12)}`);
      if (pass) ok++;
      else bad++;
    } catch (e) {
      bad++;
      console.log(`ERROR ${row.storage_key}  ${e.message}`);
    }
  }
  console.log(`\n${ok} passed, ${bad} failed of ${rows.length}`);
  process.exit(bad > 0 ? 1 : 0);
}
