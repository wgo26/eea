import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger, generateCorrelationId } from '@/lib/observability/logger'

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
 */
async function runMaintenance(request: Request) {
  const startedAt = Date.now()
  const correlationId = generateCorrelationId()
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    logger.error('cron/db-maintenance', 'CRON_SECRET not configured', { correlationId })
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ ok: false, error: 'Maintenance cron not configured' }, { status: 500 })
    }
    // Non-production without a secret: allow (local drills) but log loudly.
    logger.warn('cron/db-maintenance', 'running without CRON_SECRET (non-production only)', { correlationId })
  } else if (authHeader !== `Bearer ${cronSecret}`) {
    logger.warn('cron/db-maintenance', 'unauthorized invocation', { correlationId })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const purgeParam = Number(url.searchParams.get('purgeSeconds') ?? '86400')
  const purgeSeconds = Number.isFinite(purgeParam)
    ? Math.min(Math.max(purgeParam, 3600), 30 * 86_400)
    : 86_400

  try {
    const supabase = createAdminClient()
    const { data, error } = await supabase.rpc('db_maintenance_report', {
      p_purge_older_than_seconds: purgeSeconds,
    })
    if (error) throw new Error(error.message)

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
  return runMaintenance(request)
}

// Vercel Cron invokes scheduled jobs with GET — same auth semantics as POST
// so the nightly maintenance actually runs in production.
export async function GET(request: Request) {
  return runMaintenance(request)
}
