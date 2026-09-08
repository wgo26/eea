import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for server-side database access.
 * Bypasses RLS — only use in server-only code paths (scripts, route handlers).
 */
const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export default db;