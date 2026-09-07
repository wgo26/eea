import { createClient } from '@supabase/supabase-js';
import fs from 'node:fs';

const env = Object.fromEntries(
  fs
    .readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    }),
);

const sql = fs.readFileSync(
  'supabase/migrations/20260905000000_about_legal.sql',
  'utf8',
);
const D = '\\$\\$'; // literal $$ in RegExp syntax
const re = new RegExp(
  'values\\s*\\(([^)]+?)' + D + '(.*?)' + D + '\\s*,\\s*true\\)',
  'gs',
);
const rows = [...sql.matchAll(re)].map((m) => {
  const head = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''));
  return {
    policy_type: head[0],
    version: head[1],
    locale: head[2],
    content: m[2],
    is_current: true,
  };
});
console.log(
  'parsed:',
  rows.map((r) => `${r.policy_type}/${r.locale}/${r.version}`).join(', '),
);

const sb = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);
const types = [...new Set(rows.map((r) => r.policy_type))];
const { error: clearErr } = await sb
  .from('policy_versions')
  .update({ is_current: false })
  .in('policy_type', types)
  .eq('is_current', true);
console.log('clear:', clearErr?.message ?? 'ok');
const { error: upErr } = await sb
  .from('policy_versions')
  .upsert(rows, { onConflict: 'policy_type,locale,version' });
console.log('upsert:', upErr?.message ?? 'ok');
const { data, error } = await sb
  .from('policy_versions')
  .select('policy_type, locale, version, is_current')
  .eq('is_current', true)
  .order('policy_type')
  .order('locale');
console.log('verify error:', error?.message ?? 'none');
console.log('current rows:', JSON.stringify(data));
