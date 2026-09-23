import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Admin data-access layer. Every read goes through the service-role client
 * (bypasses RLS — appropriate for the editorial back office) and is wrapped
 * in `safe()` so a DB hiccup resolves to a fallback rather than crashing the
 * page, matching the convention in lib/queries/home.ts and photo-stories.ts.
 */

type SafeResult<T> = { data: T | null; count: number | null; error: string | null }

export async function safe<T>(
  promise: PromiseLike<{ data: T | null; count?: number | null; error: { message: string } | null }>,
): Promise<SafeResult<T>> {
  try {
    const { data, count, error } = await promise
    if (error) return { data: null, count: null, error: error.message }
    return { data, count: count ?? null, error: null }
  } catch (e) {
    return { data: null, count: null, error: e instanceof Error ? e.message : 'Unknown error' }
  }
}

export function db() {
  return createAdminClient()
}

/**
 * Supabase `Json` columns (e.g. submissions.payload) can hold strings,
 * arrays, or objects — narrow to the object shape SubmissionRow carries.
 */
export function toPayloadRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

/** The admin client is only usable when the service key is configured. */
export function hasDatabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  )
}

export type AppRole = 'admin' | 'editor' | 'contributor' | 'advertiser'
