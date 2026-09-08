import "server-only";

import type { SupabaseClient } from '@supabase/supabase-js'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { createHash } from 'node:crypto'
import { storageConfig } from './config'
import { uploadToB2, downloadFromB2 } from './providers/b2'
import { logger } from '@/lib/observability/logger'

/**
 * Phase 3.1 — Nightly DB dump (Supabase project level) + R2→B2 storage
 * mirroring (this file). Runs only as a scheduled job (Vercel Cron → POST
 * /api/cron/storage-backup), never from a user-facing request path.
 *
 * Hardening vs. the prototype (audit §5.1):
 *   - Correct column names (`provider`, not `storage_provider`) matching
 *     public.media_assets in 20260901000000_init_schema.sql.
 *   - Postgres lease via try_acquire_backup_lease / release_backup_lease
 *     (migration 20260920000000) so overlapping cron invocations can't
 *     double-mirror the same row.
 *   - SHA-256 integrity: hash source bytes, upload to B2, download back and
 *     compare before marking backed_up_at. Mismatches are left pending.
 */

export const BACKUP_JOB_NAME = 'storage-mirror'
export const BACKUP_LEASE_SECONDS = 600

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${storageConfig.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: storageConfig.r2.accessKeyId,
    secretAccessKey: storageConfig.r2.secretAccessKey,
  },
})

export function sha256Hex(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

async function fetchFromR2(storageKey: string): Promise<{ buffer: Buffer; mimeType: string }> {
  const result = await r2Client.send(
    new GetObjectCommand({ Bucket: storageConfig.r2.bucket, Key: storageKey })
  )
  const bytes = await result.Body!.transformToByteArray()
  return { buffer: Buffer.from(bytes), mimeType: result.ContentType ?? 'application/octet-stream' }
}

async function fetchSource(
  supabase: SupabaseClient,
  row: { provider: string | null; storage_key: string | null; mime_type: string | null },
): Promise<{ buffer: Buffer; mimeType: string }> {
  const key = row.storage_key as string
  if (row.provider === 'r2') return fetchFromR2(key)
  const { data: blob, error: dlError } = await supabase.storage
    .from(storageConfig.supabase.bucket)
    .download(key)
  if (dlError || !blob) {
    throw new Error(`Failed to download from Supabase Storage: ${dlError?.message ?? 'empty'}`)
  }
  return { buffer: Buffer.from(await blob.arrayBuffer()), mimeType: row.mime_type || 'application/octet-stream' }
}

/** Acquires the named backup lease. Returns true iff this caller holds it. */
export async function acquireBackupLease(
  supabase: SupabaseClient,
  owner: string,
  leaseSeconds = BACKUP_LEASE_SECONDS,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('try_acquire_backup_lease', {
    p_job_name: BACKUP_JOB_NAME,
    p_owner: owner,
    p_lease_seconds: leaseSeconds,
  })
  if (error) {
    logger.error('backup', 'lease acquire failed', { error, owner })
    return false
  }
  return data === true
}

export async function releaseBackupLease(
  supabase: SupabaseClient,
  owner: string,
  result: Record<string, unknown> | null = null,
): Promise<void> {
  const { error } = await supabase.rpc('release_backup_lease', {
    p_job_name: BACKUP_JOB_NAME,
    p_owner: owner,
    p_result: result,
  })
  if (error) logger.warn('backup', 'lease release failed', { error: error.message, owner })
}

export interface MirrorResult {
  mirrored: number
  failed: number
  skipped: number
}

export async function mirrorPendingMediaToBackup(
  supabase: SupabaseClient,
  batchSize = 50,
  opts: { correlationId?: string } = {},
): Promise<MirrorResult> {
  const correlationId = opts.correlationId
  const { data: pending, error } = await supabase
    .from('media_assets')
    .select('id, storage_key, provider, mime_type')
    .not('storage_key', 'is', null)
    .is('backed_up_at', null)
    .order('created_at', { ascending: true })
    .limit(batchSize)

  if (error) throw error
  if (!pending || pending.length === 0) return { mirrored: 0, failed: 0, skipped: 0 }

  let mirrored = 0
  let failed = 0
  let skipped = 0

  for (const row of pending as { id: string; storage_key: string | null; provider: string | null; mime_type: string | null }[]) {
    if (!row.storage_key) {
      skipped++
      continue
    }
    try {
      const fetched = await fetchSource(supabase, row)
      const sourceHash = sha256Hex(fetched.buffer)

      await uploadToB2(row.storage_key, fetched.buffer, fetched.mimeType || row.mime_type || 'application/octet-stream')

      // Integrity gate: read back from B2 and compare hashes before marking done.
      const echoed = await downloadFromB2(row.storage_key)
      const echoedHash = sha256Hex(echoed.buffer)
      if (echoedHash !== sourceHash) {
        throw new Error(`checksum mismatch (source ${sourceHash.slice(0, 12)}… vs b2 ${echoedHash.slice(0, 12)}…)`)
      }

      const { error: markError } = await supabase
        .from('media_assets')
        .update({ backed_up_at: new Date().toISOString(), backup_sha256: sourceHash })
        .eq('id', row.id)
      if (markError) throw markError
      mirrored++
    } catch (err) {
      logger.error('backup', 'mirror failed', {
        correlationId,
        mediaId: row.id,
        storageKey: row.storage_key,
        error: err instanceof Error ? err.message : String(err),
      })
      failed++
    }
  }

  logger.info('backup', 'mirror batch complete', { correlationId, mirrored, failed, skipped, batchSize })
  return { mirrored, failed, skipped }
}

export interface VerifyResult {
  verified: number
  mismatched: number
  errors: number
}

/**
 * Phase 3.2 — integrity verification: re-reads B2 copies for rows already
 * marked backed_up_at and confirms the bytes still match. Sets
 * backup_verified_at on success so the admin dashboard can show coverage.
 */
export async function verifyBackedUpMedia(
  supabase: SupabaseClient,
  batchSize = 50,
  opts: { correlationId?: string } = {},
): Promise<VerifyResult> {
  const correlationId = opts.correlationId
  const { data: rows, error } = await supabase
    .from('media_assets')
    .select('id, storage_key, provider, mime_type, backup_sha256')
    .not('storage_key', 'is', null)
    .not('backed_up_at', 'is', null)
    .is('backup_verified_at', null)
    .order('backed_up_at', { ascending: true })
    .limit(batchSize)

  if (error) throw error
  if (!rows || rows.length === 0) return { verified: 0, mismatched: 0, errors: 0 }

  let verified = 0
  let mismatched = 0
  let errors = 0

  for (const row of rows as { id: string; storage_key: string | null; provider: string | null; mime_type: string | null; backup_sha256: string | null }[]) {
    if (!row.storage_key) continue
    try {
      const [source, echoed] = await Promise.all([
        fetchSource(supabase, row),
        downloadFromB2(row.storage_key),
      ])
      const sourceHash = sha256Hex(source.buffer)
      const echoedHash = sha256Hex(echoed.buffer)
      const expected = row.backup_sha256 ?? sourceHash
      if (echoedHash !== expected || sourceHash !== expected) {
        logger.error('backup', 'verify checksum mismatch', {
          correlationId,
          mediaId: row.id,
          storageKey: row.storage_key,
          expected: expected.slice(0, 16),
          source: sourceHash.slice(0, 16),
          backup: echoedHash.slice(0, 16),
        })
        mismatched++
        continue
      }
      const { error: markError } = await supabase
        .from('media_assets')
        .update({ backup_verified_at: new Date().toISOString(), backup_sha256: expected })
        .eq('id', row.id)
      if (markError) throw markError
      verified++
    } catch (err) {
      logger.error('backup', 'verify failed', {
        correlationId,
        mediaId: row.id,
        storageKey: row.storage_key,
        error: err instanceof Error ? err.message : String(err),
      })
      errors++
    }
  }

  logger.info('backup', 'verify batch complete', { correlationId, verified, mismatched, errors })
  return { verified, mismatched, errors }
}
