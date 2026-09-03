import type { SupabaseClient } from '@supabase/supabase-js'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { storageConfig } from './config'
import { uploadToB2 } from './providers/b2'

/**
 * The two-layer backup approach from Section 14: nightly DB dump (handled
 * separately, at the Supabase project level) + R2→B2 storage mirroring
 * (this file). Intended to run as a scheduled job (Vercel Cron / a
 * standalone worker), not from any user-facing request path.
 *
 * Approach: mirror any media_assets row whose provider is 'r2' and that
 * hasn't been mirrored yet (tracked via a `backed_up_at` column — add this
 * to media_assets if it isn't already there). Kept intentionally simple:
 * pull the object from R2, push it to B2 under the same key, mark it done.
 */

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${storageConfig.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: storageConfig.r2.accessKeyId,
    secretAccessKey: storageConfig.r2.secretAccessKey,
  },
})

async function fetchFromR2(storageKey: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const result = await r2Client.send(
    new GetObjectCommand({ Bucket: storageConfig.r2.bucket, Key: storageKey })
  )
  const bytes = await result.Body!.transformToByteArray()
  return { buffer: Buffer.from(bytes), mimeType: result.ContentType ?? 'application/octet-stream' }
}

export async function mirrorPendingMediaToBackup(
  supabase: SupabaseClient,
  batchSize = 50
): Promise<{ mirrored: number; failed: number }> {
  const { data: pending, error } = await supabase
    .from('media_assets')
    .select('id, storage_key')
    .eq('provider', 'r2')
    .is('backed_up_at', null)
    .limit(batchSize)

  if (error) throw error
  if (!pending || pending.length === 0) return { mirrored: 0, failed: 0 }

  let mirrored = 0
  let failed = 0

  for (const row of pending) {
    try {
      const { buffer, mimeType } = await fetchFromR2(row.storage_key)
      await uploadToB2(row.storage_key, buffer, mimeType)
      await supabase.from('media_assets').update({ backed_up_at: new Date().toISOString() }).eq('id', row.id)
      mirrored++
    } catch (err) {
      console.error(`Failed to mirror media ${row.id} (${row.storage_key}) to B2:`, err)
      failed++
    }
  }

  return { mirrored, failed }
}
