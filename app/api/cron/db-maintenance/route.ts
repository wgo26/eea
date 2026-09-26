import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger, generateCorrelationId } from '@/lib/observability/logger'
import { requireCronSecret } from '@/lib/security/cron-auth'
import { stampHeartbeat } from '@/lib/automation/heartbeat'

export const dynamic = 'force-dynamic'

/**
 * Phase 4.2 — scheduled database maintenance runner (audit §4.2).
 * Vercel Cron (vercel.json) → GET /api/cron/db-maintenance nightly, with POST
 * supported for manual triggers. Calls the db_maintenance_report() RPC
 * (migration 20260921000000) which:
 *   1. deep-purges stale rate_limit_hits buckets (the limiter's in-band GC
 *      only prunes 10x its short window);
 *   2. reports dead-tuple/autovacuum telemetry for the counter table
 *      (VACUUM/ANALYZE cannot run inside an RPC — autovacuum, tuned by the
 *      same migration, is the automated vacuum mechanism);
 *   3. verifies the schema objects earlier migrations rely on exist, plus the
 *      applied-migration trail (supabase_migrations.schema_migrations).
 *
 * Auth: CRON_SECRET bearer token — same fail-closed pattern as
 * /api/cron/storage-backup (in production a missing secret is a 500, a wrong
 * secret a 401). No lease is needed: the report is idempotent and cheap, and
 * two overlapping runs just purge nothing the second time.
 *
 * Retention (System & Infrastructure hygiene): the audit trail and finished
 * storage tasks grow unbounded otherwise. `audit_events` older than
 * AUDIT_RETENTION_DAYS (default 365) and `completed` storage tasks older
 * than 30 days are hard-deleted here — best-effort, never failing the run.
 * `moderation_log` (per-item editorial history) and `credential_events`
 * (key lifecycle) are intentionally kept: small, and needed for forensics.
 */
async function runMaintenance(request: Request) {
  const startedAt = Date.now()
  const correlationId = generateCorrelationId()
  const denied = requireCronSecret(request, 'db-maintenance', correlationId)
  if (denied) return denied

  const url = new URL(request.url)
  const purgeParam = Number(url.searchParams.get('purgeSeconds') ?? '86400')
  const purgeSeconds = Number.isFinite(purgeParam)
    ? Math.min(Math.max(purgeParam, 3600), 30 * 86_400)
    : 86_400

  try {
    // Phase 2: chunked-upload temp sessions live on local disk
    // (lib/uploads/server.ts, 12 h TTL). Previously purged only
    // opportunistically on chunk-resume GETs — now swept nightly here too.
    // Best-effort: never fails the maintenance run. Multi-instance note:
    // each instance sweeps its own tmpdir; a shared store is still TODO.
    try {
      const { purgeStaleSessions } = await import("@/lib/uploads/server");
      await purgeStaleSessions();
    } catch (purgeErr) {
      logger.warn("cron/db-maintenance", "upload-session purge failed", {
        correlationId,
        error: purgeErr instanceof Error ? purgeErr.message : String(purgeErr),
      });
    }
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('db_maintenance_report', {
      p_purge_older_than_seconds: purgeSeconds,
    })
    if (error) throw new Error(error.message)

    // Retention sweeps (best-effort, reported, never fatal).
    const retentionDaysRaw = Number(process.env.AUDIT_RETENTION_DAYS ?? '365')
    const retentionDays = Number.isFinite(retentionDaysRaw)
      ? Math.min(Math.max(Math.floor(retentionDaysRaw), 30), 3650)
      : 365
    let purgedAuditRows: number | null = null
    let purgedTaskRows: number | null = null
    try {
      const auditCutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString()
      const { error: auditPurgeError, count: auditCount } = await supabase
        .from('audit_events')
        .delete({ count: 'exact' })
        .lt('created_at', auditCutoff)
      if (auditPurgeError) throw auditPurgeError
      purgedAuditRows = auditCount ?? 0
    } catch (purgeErr) {
      logger.warn('cron/db-maintenance', 'audit retention purge failed', {
        correlationId,
        error: purgeErr instanceof Error ? purgeErr.message : String(purgeErr),
      })
    }
    try {
      const taskCutoff = new Date(Date.now() - 30 * 86_400_000).toISOString()
      const { error: taskPurgeError, count: taskCount } = await supabase
        .from('storage_tasks')
        .delete({ count: 'exact' })
        .eq('status', 'completed')
        .lt('updated_at', taskCutoff)
      if (taskPurgeError) throw taskPurgeError
      purgedTaskRows = taskCount ?? 0
    } catch (purgeErr) {
      logger.warn('cron/db-maintenance', 'storage-task retention purge failed', {
        correlationId,
        error: purgeErr instanceof Error ? purgeErr.message : String(purgeErr),
      })
    }

    const report = (data ?? {}) as {
      checkedAt?: string
      purgedRateLimitRows?: number
      rateLimitTable?: Record<string, unknown>
      missingObjects?: string[]
      migrations?: Record<string, unknown>
    }

    const result = {
      ok: report.missingObjects && report.missingObjects.length > 0 ? false : true,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      correlationId,
      purgeSeconds,
      purgedRateLimitRows: report.purgedRateLimitRows ?? null,
      purgedAuditRows,
      auditRetentionDays: retentionDays,
      purgedCompletedTasks: purgedTaskRows,
      rateLimitTable: report.rateLimitTable ?? null,
      migrations: report.migrations ?? null,
      missingObjects: report.missingObjects ?? [],
    }

    if (result.missingObjects.length > 0) {
      logger.error('cron/db-maintenance', 'schema verification failed — missing objects', {
        correlationId,
        missingObjects: result.missingObjects,
      })
    } else {
      logger.info('cron/db-maintenance', 'maintenance run complete', {
        correlationId,
        durationMs: result.durationMs,
        purgedRateLimitRows: result.purgedRateLimitRows,
        rateLimitTable: result.rateLimitTable,
      })
    }
    return NextResponse.json(result, { status: result.ok ? 200 : 500 })
  } catch (err) {
    logger.error('cron/db-maintenance', 'maintenance run failed', {
      correlationId,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Maintenance job failed', correlationId },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  return stampHeartbeat('db-maintenance', runMaintenance(request))
}

// Vercel Cron invokes scheduled jobs with GET — same auth semantics as POST
// so the nightly maintenance actually runs in production.
export async function GET(request: Request) {
  return runMaintenance(request)
}
