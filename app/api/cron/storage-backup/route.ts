import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  acquireBackupLease,
  releaseBackupLease,
  mirrorPendingMediaToBackup,
  verifyBackedUpMedia,
  BACKUP_LEASE_SECONDS,
} from '@/lib/storage/backup'
import { logger, generateCorrelationId } from '@/lib/observability/logger'

export const dynamic = 'force-dynamic'

/**
 * Phase 3.1/3.2 — Scheduled cold-backup runner.
 * Vercel Cron (vercel.json) → GET /api/cron/storage-backup nightly (Vercel
 * Cron issues GET requests), with POST supported for manual triggers.
 * Mirrors pending R2 / Supabase Storage media assets to Backblaze B2 with
 * SHA-256 verification, then verifies previously mirrored rows.
 *
 * Concurrency: Postgres lease (try_acquire_backup_lease, 10 min). A second
 * overlapping invocation gets 409 so retries don't double-mirror.
 * Auth: CRON_SECRET bearer token. In production the secret is required —
 * without it the route returns 500 (fail closed) instead of running open.
 */
async function runBackup(request: Request) {
  const startedAt = Date.now()
  const correlationId = generateCorrelationId()
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    logger.error('cron/storage-backup', 'CRON_SECRET not configured', { correlationId });
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ ok: false, error: 'Backup cron not configured' }, { status: 500 })
    }
    // Non-production without a secret: allow (local drills) but log loudly.
    logger.warn('cron/storage-backup', 'running without CRON_SECRET (non-production only)', { correlationId })
  } else if (authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('cron/storage-backup', 'unauthorized invocation', { correlationId })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const owner = `cron-${correlationId}`
  const supabase = createAdminClient()

  const leaseOk = await acquireBackupLease(supabase, owner, BACKUP_LEASE_SECONDS)
  if (!leaseOk) {
    logger.warn('cron/storage-backup', 'lease held by another worker, skipping', { correlationId, owner })
    return NextResponse.json({ ok: false, skipped: true, reason: 'lease-held' }, { status: 409 })
  }

  try {
    const url = new URL(request.url)
    const batchParam = Number(url.searchParams.get('batch') ?? '50')
    const batch = Number.isFinite(batchParam) ? Math.min(Math.max(1, batchParam), 200) : 50
    const doVerify = url.searchParams.get('verify') !== '0'

    const mirror = await mirrorPendingMediaToBackup(supabase, batch, { correlationId })
    const verify = doVerify
      ? await verifyBackedUpMedia(supabase, batch, { correlationId })
      : { verified: 0, mismatched: 0, errors: 0 }

    const result = {
      ok: true,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      correlationId,
      mirror,
      verify,
    }
    await releaseBackupLease(supabase, owner, result)
    logger.info('cron/storage-backup', 'backup run complete', { correlationId, durationMs: result.durationMs, ...result.mirror, ...result.verify })
    return NextResponse.json(result)
  } catch (err) {
    logger.error('cron/storage-backup', 'backup run failed', {
      correlationId,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    })
    await releaseBackupLease(supabase, owner, { ok: false, error: err instanceof Error ? err.message : 'Backup job failed' })
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Backup job failed', correlationId },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  return runBackup(request)
}

// Vercel Cron invokes scheduled jobs with GET — same auth + lease semantics
// as POST so the nightly mirror actually runs in production.
export async function GET(request: Request) {
  return runBackup(request)
}
