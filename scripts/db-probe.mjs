// Diagnostic for "landing on member dashboard" issue.
//
// Run: node scripts/db-probe.mjs
//
// Two failure modes share the same symptom:
//   1) GRANT missing - app-scoped client can't read user_roles (most common)
//   2) User has no admin role row in public.user_roles
//
// This script detects which mode applies and prints the exact fix.
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anon) { console.log('Missing Supabase env'); process.exit(0); }

const TARGET = '02b5d3c8-db5f-4f23-a241-b6af77c98919';
const EMAIL = 'wirngoelvis@gmail.com';

async function readRoles(client, userId) {
  let res = null, err = null;
  try { res = await client.from('user_roles').select('user_id, role').eq('user_id', userId); }
  catch (e) { err = e; }
  if (err) return { error: err };
  const data = res?.data ?? res;
  return { rows: Array.isArray(data) ? data : [] };
}

async function main() {
  console.log('Target: ' + TARGET + ' (' + EMAIL + ')\n');

  const appClient = createClient(url, anon, { auth: { persistSession: false } });
  const appResult = await readRoles(appClient, TARGET);
  console.log('1) App-scoped (anon) client reads user_roles:');
  if (appResult.error) {
    console.log('   FAILED - ' + (appResult.error.code || '') + ' ' + (appResult.error.message || '').slice(0, 200));
  } else {
    console.log('   OK - rows: ' + appResult.rows.length);
    appResult.rows.forEach(r => console.log('     - ' + r.role));
  }

  let svcRows = [];
  let svcOk = false;
  if (serviceRoleKey) {
    const svcClient = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
    const svcResult = await readRoles(svcClient, TARGET);
    console.log('\n2) Service-role client reads user_roles:');
    if (svcResult.error) {
      console.log('   FAILED - ' + (svcResult.error.message || '').slice(0, 200));
    } else {
      svcOk = true;
      svcRows = svcResult.rows;
      console.log('   OK - rows: ' + svcRows.length);
      svcRows.forEach(r => console.log('     - ' + r.role));
    }
  } else {
    console.log('\n2) Service-role key missing - skipping');
  }

  console.log('\n=== DIAGNOSIS ===');
  const appFailed = !!appResult.error;
  const appEmpty = !appResult.error && appResult.rows.length === 0;
  const hasAdmin = svcRows.some(r => r.role === 'admin');

  if (appFailed || (appEmpty && svcOk && hasAdmin)) {
    console.log('MODE 1: GRANT SELECT on public.user_roles is missing for the');
    console.log('"authenticated" role. The app cannot read user_roles at all.');
    console.log('\nFIX - run this in Supabase SQL Editor:\n');
    console.log('  grant select on public.user_roles to authenticated;\n');
    console.log('Then log out and back in.');
    process.exit(0);
  }

  if (appEmpty && svcOk && !hasAdmin) {
    console.log('MODE 2: App can read user_roles, but this user has no admin row.');
    console.log('\nFIX - run this in Supabase SQL Editor:\n');
    console.log("  insert into public.user_roles (user_id, role) values");
    console.log("    ('" + TARGET + "', 'admin');\n");
    process.exit(0);
  }

  if (!appEmpty && !hasAdmin) {
    console.log('MODE 2: App reads user_roles but user has no admin row.');
    console.log('Current roles: ' + appResult.rows.map(r => r.role).join(', '));
    console.log('\nFIX - run in Supabase SQL Editor:\n');
    console.log("  insert into public.user_roles (user_id, role) values");
    console.log("    ('" + TARGET + "', 'admin');\n");
    process.exit(0);
  }

  console.log('No issue detected - user has admin role and app can read it.');
  console.log('If you still land on member dashboard, check session/cookies.');
}

main().catch(e => { console.error(e); process.exit(1); });
