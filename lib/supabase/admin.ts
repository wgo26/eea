import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * A6 payload helpers: the generated `Database` schema typing is precise for
 * reads; admin write paths assemble payloads dynamically (spreads,
 * conditional fields) or after validating input by hand, so they cast the
 * assembled object to the target table's Insert/Update shape. Using these
 * aliases keeps the cast explicit and greppable.
 */
export type InsertOf<T extends keyof Database["public"]["Tables"]> =
    Database["public"]["Tables"][T]["Insert"];
export type UpdateOf<T extends keyof Database["public"]["Tables"]> =
    Database["public"]["Tables"][T]["Update"];

/**
 * Service-role Supabase client for server-side reads of public content.
 * Bypasses RLS — must only be used in Server Components / Route Handlers.
 * The homepage query layer only ever performs SELECTs with this client.
 *
 * A6: typed against the generated Database schema
 * (scripts/generate-database-types.mjs).
 */
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}
