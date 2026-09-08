// Check current RLS policies on user_roles
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRole) { console.log('Missing env'); process.exit(0); }

const svc = createClient(url, serviceRole, { auth: { persistSession: false } });

const { data } = await svc.from('pg_policies').select('*').eq('tablename', 'user_roles');

console.log('Current policies on user_roles:');
for (const p of data ?? []) {
  console.log('---');
  console.log('name:', p.policyname);
  console.log('cmd:', p.cmd);
  console.log('roles:', JSON.stringify(p.roles));
  console.log('qual:', p.qual);
  console.log('with_check:', p.with_check);
}
