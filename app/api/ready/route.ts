import { NextResponse } from 'next/server'
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { createAdminClient } from '@/lib/supabase/admin'
import { storageConfig } from '@/lib/storage/config'
import { logger, generateCorrelationId } from '@/lib/observability/logger'
import { bearerMatches } from '@/lib/security/secrets'

export const dynamic = 'force-dynamic'
// lib/security/secrets.ts uses node:crypto and @aws-sdk needs Node APIs.
export const runtime = 'nodejs'

/**
 * Phase 3.3 — Readiness probe (audit §5.2), hardened per audit P1.
 *
 * Verifies database + object-storage connectivity before production traffic is
 * routed. Returns 200 `ready` only when every check passes, else 503 `degraded`.
 *
 * Checks:
 *   - environment: required env vars present (Supabase, R2).
 *   - database: SELECT 1 against content_items via service role.
 *   - storage/supabase: list 1 object in the admin-asset bucket.
 *   - storage/r2: ListObjectsV2 MaxKeys=1 (no body download).
 * B2 is intentionally excluded: it is a cold mirror, not a serving path —
 * its health is covered by the backup verify job, not traffic routing.
 *
 * ## Disclosure model
 * This route is reachable by anyone. Public callers receive ONLY the status
 * code, a timestamp and a correlation ID — never the check names, the missing
 * environment-variable names, or raw driver error strings, which previously
 * told an anonymous prober exactly which secrets were unset. Callers presenting
 * the dedicated probe secret (`READY_PROBE_SECRET`) get
 * full per-check detail so an alert can name the failing dependency. Phase 0:
 * no fallback to CRON_SECRET.
 *
 * ## Cost control
 * Each probe makes four live dependency round-trips, so an anonymous caller
 * could otherwise force unbounded DB/storage load by looping this endpoint.
 * Results are reused for PROBE_TTL_MS and concurrent callers share one
 * in-flight probe. The cache is per server instance (module scope), which
 * bounds the drain rate to one probe per instance per TTL without shared state.
 */

interface CheckOutcome {
  ok: boolean
  latencyMs: number
  detail?: string
}

interface ProbeResult {
  isReady: boolean
  checks: Record<string, CheckOutcome>
  durationMs: number
  timestamp: string
}

/** How long a completed probe is reused before re-checking dependencies. */
const PROBE_TTL_MS = 15_000

let cachedProbe: { completedAt: number; result: ProbeResult } | null = null
let probeInFlight: Promise<ProbeResult> | null = null

/** Secret that unlocks per-check detail. Phase 0: dedicated secret only —
 * no fallback to CRON_SECRET (one secret must not unlock jobs + probe). */
function probeSecret(): string | undefined {
  return process.env.READY_PROBE_SECRET
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

async function runProbe(): Promise<ProbeResult> {
  const startedAt = Date.now()
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
  if (!process.env.R2_PUBLIC_BASE_URL && !process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL) {
    envMissing.push('R2_PUBLIC_BASE_URL or NEXT_PUBLIC_R2_PUBLIC_BASE_URL')
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
      // R2's S3 API has no virtual-hosted DNS — path-style addressing only.
      forcePathStyle: true,
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

  return { isReady, checks, durationMs: Date.now() - startedAt, timestamp }
}

/**
 * Returns a probe result, reusing a recent one unless `forceFresh` is set.
 *
 * Single-flight: concurrent callers await the same in-flight probe instead of
 * each starting one, so a burst of anonymous requests (or a retrying monitor)
 * costs exactly one set of dependency round-trips.
 */
async function getProbeResult(forceFresh: boolean): Promise<ProbeResult> {
  if (!forceFresh && cachedProbe && Date.now() - cachedProbe.completedAt < PROBE_TTL_MS) {
    return cachedProbe.result
  }
  if (probeInFlight) return probeInFlight

  const pending = runProbe()
    .then((result) => {
      cachedProbe = { completedAt: Date.now(), result }
      return result
    })
    .finally(() => {
      // Cleared in `finally` so a throwing probe cannot wedge the cache forever.
      probeInFlight = null
    })

  probeInFlight = pending
  return pending
}

export async function GET(request: Request): Promise<NextResponse> {
  const correlationId = generateCorrelationId()
  const authorized = bearerMatches(request.headers.get('authorization'), probeSecret())
  // `?fresh=1` is an authenticated-only escape hatch: letting anonymous callers
  // bypass PROBE_TTL_MS would hand back the unbounded-probe drain this cache
  // exists to prevent.
  const forceFresh =
    authorized && new URL(request.url).searchParams.get('fresh') === '1'

  const noStore = { 'Cache-Control': 'no-store' } as const

  let result: ProbeResult
  try {
    result = await getProbeResult(forceFresh)
  } catch (error) {
    logger.error('ready', 'readiness probe threw', { correlationId, error })
    return NextResponse.json(
      { status: 'degraded', timestamp: new Date().toISOString(), correlationId },
      { status: 503, headers: noStore },
    )
  }

  const status = result.isReady ? 200 : 503

  if (!result.isReady) {
    // Logged per degradation, not per request, but correlated to the caller so
    // an alert can be matched to the response the monitor saw.
    logger.warn('ready', 'readiness degraded', {
      correlationId,
      durationMs: result.durationMs,
      checks: result.checks,
    })
  }

  // Public callers get the verdict and a correlation ID only. Check names,
  // missing env-var names and driver errors are behind the probe secret.
  const body = authorized
    ? {
        status: result.isReady ? 'ready' : 'degraded',
        checks: result.checks,
        durationMs: result.durationMs,
        timestamp: result.timestamp,
        correlationId,
      }
    : {
        status: result.isReady ? 'ready' : 'degraded',
        timestamp: result.timestamp,
        correlationId,
      }

  return NextResponse.json(body, { status, headers: noStore })
}
