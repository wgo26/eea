import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for server-side reads of public content.
 * Bypasses RLS — must only be used in Server Components / Route Handlers.
 * The homepage query layer only ever performs SELECTs with this client.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
