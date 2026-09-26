import { NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { gzip as gzipCallback } from 'node:zlib'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger, generateCorrelationId } from '@/lib/observability/logger'
import { requireCronSecret } from '@/lib/security/cron-auth'
import { stampHeartbeat } from '@/lib/automation/heartbeat'
import { verifyChainWindow } from '@/lib/security/audit-chain'
import { uploadToB2 } from '@/lib/storage/providers/b2'
import { storageConfig } from '@/lib/storage/config'

export const dynamic = 'force-dynamic'

/**
 * Monthly cold archive of the audit trail (System & Infrastructure → Audit).
 *
 * `db-maintenance` hard-deletes `audit_events` past the retention window, so
 * without this job old evidence simply vanishes. On the 1st of each month
 * this route:
 *
 *   1. verifies the hash chain from genesis (paged, carrying continuity —
 *      a break aborts the archive loudly instead of sealing a lie);
 *   2. dumps every not-yet-archived `audit_events` row to CSV (bounded per
 *      run; the watermark advances only on success);
 *   3. gzips + SHA-256s the bundle into B2 `audit-archive/` and ledgers it
 *      in `audit_archives` (filename, hash, byte size, row range, count).
 *
 * `moderation_log` is intentionally excluded — per-item editorial history is
 * kept in the database indefinitely. Auth: CRON_SECRET, fail-closed.
 */

const PAGE_SIZE = 5000
const MAX_ROWS_PER_RUN = 50000

function csv(value: unknown): string {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function gzipAsync(input: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    gzipCallback(input, (err, result) => (err ? reject(err) : resolve(result)))
  })
}

async function runArchive(request: Request) {
  const startedAt = Date.now()
  const correlationId = generateCorrelationId()
  const denied = requireCronSecret(request, 'audit-archive', correlationId)
  if (denied) return denied

  try {
    const supabase = createAdminClient()

    // Watermark: everything up to the newest archived row is already cold.
    const { data: lastArchive } = await supabase
      .from('audit_archives')
      .select('to_ts')
      .order('to_ts', { ascending: false })
      .limit(1)
      .maybeSingle()
    const since = (lastArchive as unknown as { to_ts: string | null } | null)?.to_ts ?? null

    // 1. Chain verification from genesis, carrying continuity page to page.
    // Unbounded in pages but each page is bounded; a break aborts loudly.
    let prev: string | null | undefined
    let anchored = false
    for (;;) {
      const verdict = await verifyChainWindow(
        anchored ? { limit: PAGE_SIZE, prev: prev ?? null } : { limit: PAGE_SIZE },
      )
      if (!verdict.ok) {
        logger.error('cron/audit-archive', 'hash chain broken — archive aborted', {
          correlationId,
          brokenAt: verdict.brokenAt,
          checked: verdict.checked,
        })
        return NextResponse.json(
          { ok: false, error: 'Audit hash chain broken — refusing to seal the archive', brokenAt: verdict.brokenAt, correlationId },
          { status: 500 },
        )
      }
      prev = verdict.endHash
      anchored = true
      if (verdict.checked < PAGE_SIZE) break
    }

    // 2. Rows since the watermark, oldest first.
    let query = supabase
      .from('audit_events')
      .select('id, action, actor_id, actor_role, resource_type, resource_id, request_id, source, metadata, created_at, prev_hash, entry_hash')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(MAX_ROWS_PER_RUN + 1)
    if (since) query = query.gt('created_at', since)
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as Record<string, unknown>[]
    const sealed = rows.length > MAX_ROWS_PER_RUN
    const batch = sealed ? rows.slice(0, MAX_ROWS_PER_RUN) : rows
    if (batch.length === 0) {
      return NextResponse.json({
        ok: true,
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        correlationId,
        archived: 0,
        reason: 'no-new-rows',
      })
    }

    const header = 'id,action,actor_id,actor_role,resource_type,resource_id,request_id,source,metadata,created_at,prev_hash,entry_hash'
    const lines = batch.map((row) =>
      [
        row.id,
        row.action,
        row.actor_id,
        row.actor_role,
        row.resource_type,
        row.resource_id,
        row.request_id,
        row.source,
        JSON.stringify(row.metadata ?? {}),
        row.created_at,
        row.prev_hash,
        row.entry_hash,
      ]
        .map(csv)
        .join(','),
    )
    const body = `${header}\n${lines.join('\n')}\n`
    const gzipped = await gzipAsync(body)
    const sha256 = createHash('sha256').update(gzipped).digest('hex')
    const toTs = batch[batch.length - 1].created_at as string
    const fromTs = batch[0].created_at as string
    const filename = `audit-${toTs.slice(0, 7)}-${(batch[0].id as string).slice(0, 8)}.csv.gz`

    // 3. Seal: upload, then advance the watermark. Ledger first would lie if
    // the upload failed; upload first risks a re-archive on ledger failure —
    // re-archiving is idempotent (filename unique → conflict surfaces), so
    // upload-first is the safe order.
    await uploadToB2(storageConfig.b2.bucket, `audit-archive/${filename}`, gzipped, 'application/gzip')
    const { error: ledgerError } = await supabase.from('audit_archives').insert({
      filename,
      sha256,
      size_bytes: gzipped.length,
      from_ts: fromTs,
      to_ts: toTs,
      row_count: batch.length,
    })
    if (ledgerError) throw new Error(ledgerError.message)

    const result = {
      ok: true,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      correlationId,
      archived: batch.length,
      filename,
      sha256,
      sizeBytes: gzipped.length,
      fromTs,
      toTs,
      complete: !sealed,
    }
    logger.info('cron/audit-archive', 'archive bundle sealed', {
      correlationId,
      durationMs: result.durationMs,
      archived: result.archived,
      filename,
    })
    return NextResponse.json(result)
  } catch (err) {
    logger.error('cron/audit-archive', 'archive failed', {
      correlationId,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Archive failed', correlationId },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  return stampHeartbeat('audit-archive', runArchive(request))
}

// Vercel Cron invokes scheduled jobs with GET — same auth semantics as POST.
export async function GET(request: Request) {
  return runArchive(request)
}
