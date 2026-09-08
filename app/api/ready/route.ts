import { NextResponse } from 'next/server'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { createAdminClient } from '@/lib/supabase/admin'
import { storageConfig } from '@/lib/storage/config'
import { logger, generateCorrelationId } from '@/lib/observability/logger'

export const dynamic = 'force-dynamic'

/**
 * Phase 3.3 — Readiness probe (audit §5.2).
 * Verifies database + object-storage connectivity before production traffic
 * is routed. Returns 200 `ready` only when every check passes, else 503
 * `degraded` with per-check detail so monitors can alert on the cause.
 *
 * Checks:
 *   - environment: required env vars present (Supabase, R2, B2).
 *   - database: SELECT 1 against content_items via service role.
 *   - storage/supabase: list 1 object in the admin-asset bucket.
 *   - storage/r2: ListObjectsV2 MaxKeys=1 (no body download).
 * B2 is intentionally excluded: it is a cold mirror, not a serving path —
 * its health is covered by the backup verify job, not traffic routing.
 */

interface CheckOutcome {
  ok: boolean
  latencyMs: number
  detail?: string
}

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T | null; latencyMs: number; error: string | null }> {
  const start = Date.now()
  try {
    const result = await fn()
    return { result, latencyMs: Date.now() - start, error: null }
  } catch (err) {
    return { result: null, latencyMs: Date.now() - start, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function GET() {
  const startedAt = Date.now()
  const correlationId = generateCorrelationId()
  const timestamp = new Date().toISOString()

  const envMissing: string[] = []
  for (const key of [
    'NEXT_PUBLIC_SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'NEXT_PUBLIC_SITE_URL',
    'R2_ACCOUNT_ID',
    'R2_ACCESS_KEY_ID',
    'R2_SECRET_ACCESS_KEY',
    'R2_BUCKET',
  ]) {
    if (!process.env[key]) envMissing.push(key)
  }
  const environment: CheckOutcome = {
    ok: envMissing.length === 0,
    latencyMs: 0,
    ...(envMissing.length > 0 ? { detail: `missing: ${envMissing.join(', ')}` } : {}),
  }

  const supabase = createAdminClient()

  const db = await timed(async () => {
    const { error } = await supabase.from('content_items').select('id').limit(1)
    if (error) throw new Error(error.message)
  })
  const database: CheckOutcome = {
    ok: db.error === null,
    latencyMs: db.latencyMs,
    ...(db.error ? { detail: db.error } : {}),
  }

  const supaStore = await timed(async () => {
    const { error } = await supabase.storage.from(storageConfig.supabase.bucket).list('', { limit: 1 })
    if (error) throw new Error(error.message)
  })
  const supabaseStorage: CheckOutcome = {
    ok: supaStore.error === null,
    latencyMs: supaStore.latencyMs,
    ...(supaStore.error ? { detail: supaStore.error } : {}),
  }

  const r2Timed = await timed(async () => {
    const client = new S3Client({
      region: 'auto',
      endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
      },
    })
    await client.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, MaxKeys: 1 }))
  })
  const r2Storage: CheckOutcome = {
    ok: r2Timed.error === null,
    latencyMs: r2Timed.latencyMs,
    ...(r2Timed.error ? { detail: r2Timed.error } : {}),
  }

  const checks = { environment, database, supabaseStorage, r2Storage }
  const isReady = Object.values(checks).every((c) => c.ok)
  const durationMs = Date.now() - startedAt

  if (!isReady) {
    logger.warn('ready', 'readiness degraded', { correlationId, durationMs, checks })
  }

  return NextResponse.json(
    { status: isReady ? 'ready' : 'degraded', checks, durationMs, timestamp, correlationId },
    { status: isReady ? 200 : 503 },
  )
}
