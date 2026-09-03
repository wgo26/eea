import type { SupabaseClient } from '@supabase/supabase-js'
import { storageConfig } from '../config'

/**
 * Uses the Storage API (never writing to storage.objects directly), so the
 * bucket's own RLS-backed storage policies still apply — see the runbook,
 * item 7. Pass a server-side Supabase client (service role for admin
 * uploads, or the user's own authenticated client if the bucket policy
 * allows self-service uploads).
 */
export async function uploadToSupabase(
  supabase: SupabaseClient,
  storageKey: string,
  buffer: Buffer,
  mimeType: string
): Promise<string> {
  const { error } = await supabase.storage
    .from(storageConfig.supabase.bucket)
    .upload(storageKey, buffer, { contentType: mimeType, upsert: false })

  if (error) throw error

  const { data } = supabase.storage.from(storageConfig.supabase.bucket).getPublicUrl(storageKey)
  return data.publicUrl
}

export async function deleteFromSupabase(supabase: SupabaseClient, storageKey: string): Promise<void> {
  const { error } = await supabase.storage.from(storageConfig.supabase.bucket).remove([storageKey])
  if (error) throw error
}
