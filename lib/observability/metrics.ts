import 'server-only'

import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { createAdminClient } from '@/lib/supabase/admin'
import { storageConfig } from '@/lib/storage/config'
import { logger } from '@/lib/observability/logger'

/**
 * Phase 4.4 — Aggregated platform metrics (spec §52).
 *
 * The readiness probe (`/api/ready`) answers "may traffic be routed here?" with
 * a boolean. This module answers the follow-up an operator asks: *how* healthy
 * is each dependency, and is background work falling behind? It is the data
 * source for the dashboard health widget and the hook an automation would call
 * before activating the DEGRADED state (spec §52: "automatic state activation").
 *
 * Measured, not assumed:
 *   - api       — the process answered at all; latency is the probe round-trip.
 *   - database  — one `select id limit 1` on content_items, timed.
 *   - storage   — one list-object call per serving provider (Supabase bucket,
 *                 R2 bucket), timed. B2 is a cold mirror (see /api/ready).
 *   - queue     — row counts from the two durable work queues: `storage_tasks`
 *                 (media verify/backup/delete) and `notification_outbox`.
 *   - errorRate — share of background operations created in the window that
 *                 ended failed. This is deliberately NOT an HTTP 5xx rate: the
 *                 app keeps no per-request error store, and inventing one here
 *                 would report a number nobody can reconcile.
 *
 * Disclosure: latency, counts and short driver messages only. Never a bucket
 * credential, connection string or full env value (spec §13). Driver errors are
 * truncated and this module is only reached behind an authenticated admin
 * endpoint — the same rule /api/ready applies to its secret-holding callers.
 */

export type SystemStatus = 'healthy' | 'degraded' | 'unavailable' | 'unknown'
export type ComponentStatus = 'operational' | 'degraded' | 'down' | 'unknown'

export type MetricComponent = {
    id: 'api' | 'database' | 'storage' | 'queue'
    status: ComponentStatus
    /** Round-trip of the probe that produced `status`; null when not probed. */
    latencyMs: number | null
    /** Short, credential-free explanation — set whenever status is not `operational`. */
    detail: string | null
}

export type QueueHealth = {
    /** Work waiting or in flight right now. */
    pending: number
    /** Work that ended failed inside the window (needs a retry or a look). */
    failed: number
    /** Age of the oldest item still waiting — the queue's SLA clock. */
    oldestPendingAt: string | null
}

export type ErrorRate = {
    windowHours: number
    failedOps: number
    totalOps: number
    /** Rounded percentage, 0–100. 0 when nothing ran (not "perfectly clean"). */
    ratePct: number
}

export type RuntimeFacts = {
    uptimeSeconds: number
    version: string
    nodeVersion: string
    rssBytes: number
    heapUsedBytes: number
}

export type SystemMetrics = {
    status: SystemStatus
    timestamp: string
    durationMs: number
    components: MetricComponent[]
    queue: QueueHealth
    errorRate: ErrorRate
    runtime: RuntimeFacts
}

/* ------------------------------------------------------------------ */
/* Thresholds (spec §52 — the line between operational and degraded)   */
/* ------------------------------------------------------------------ */

/** A round-trip slower than this is "up but not healthy". */
export const SLOW_COMPONENT_MS = 1_500
/** Waiting work above this depth is a backlog. */
export const QUEUE_BACKLOG_DEGRADED = 25
/** Failed work above this count in the window is a failure spike. */
export const QUEUE_FAILED_DEGRADED = 10
/** Failed share of the window's work above this is a failure spike. */
export const ERROR_RATE_DEGRADED_PCT = 20
/** How far back the error rate looks. */
export const ERROR_WINDOW_HOURS = 24

const PROCESS_STARTED_AT = Date.now()

type Timed<T> = { result: T | null; latencyMs: number; error: string | null }

async function timed<T>(fn: () => Promise<T>): Promise<Timed<T>> {
    const start = Date.now()
    try {
        return { result: await fn(), latencyMs: Date.now() - start, error: null }
    } catch (err) {
        return {
            result: null,
            latencyMs: Date.now() - start,
            error: err instanceof Error ? err.message : String(err),
        }
    }
}

/** Driver errors are useful to an admin and must stay short and credential-free. */
function brief(detail: string): string {
    return detail.replace(/\s+/g, ' ').trim().slice(0, 200)
}

function worst(statuses: ComponentStatus[]): ComponentStatus {
    if (statuses.includes('down')) return 'down'
    if (statuses.includes('degraded')) return 'degraded'
    if (statuses.every((s) => s === 'unknown')) return 'unknown'
    return 'operational'
}

/** Healthy only when every probed component is operational and the queue is clear. */
export function deriveSystemStatus(components: MetricComponent[], queue: QueueHealth, errorRate: ErrorRate): SystemStatus {
    if (components.some((c) => c.status === 'unknown')) return 'unknown'
    if (components.some((c) => c.status === 'down')) return 'unavailable'
    if (components.some((c) => c.status === 'degraded')) return 'degraded'
    if (queue.pending > QUEUE_BACKLOG_DEGRADED || queue.failed > QUEUE_FAILED_DEGRADED) return 'degraded'
    if (errorRate.ratePct >= ERROR_RATE_DEGRADED_PCT && errorRate.failedOps > 0) return 'degraded'
    return 'healthy'
}

function runtimeFacts(): RuntimeFacts {
    const memory = process.memoryUsage()
    return {
        uptimeSeconds: Math.floor((Date.now() - PROCESS_STARTED_AT) / 1000),
        version: process.env.APP_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
        nodeVersion: process.version,
        rssBytes: memory.rss,
        heapUsedBytes: memory.heapUsed,
    }
}

/* ------------------------------------------------------------------ */
/* Component probes                                                    */
/* ------------------------------------------------------------------ */

async function probeDatabase(): Promise<MetricComponent> {
    const probe = await timed(async () => {
        const { error } = await createAdminClient().from('content_items').select('id').limit(1)
        if (error) throw new Error(error.message)
    })
    if (probe.error) {
        return { id: 'database', status: 'down', latencyMs: probe.latencyMs, detail: brief(probe.error) }
    }
    return {
        id: 'database',
        status: probe.latencyMs > SLOW_COMPONENT_MS ? 'degraded' : 'operational',
        latencyMs: probe.latencyMs,
        detail: null,
    }
}

async function probeStorage(): Promise<MetricComponent> {
    const supabaseProbe = await timed(async () => {
        const { error } = await createAdminClient().storage
            .from(storageConfig.supabase.bucket)
            .list('', { limit: 1 })
        if (error) throw new Error(error.message)
    })

    const r2Probe = await timed(async () => {
        if (!process.env.R2_ACCOUNT_ID || !process.env.R2_BUCKET) {
            throw new Error('R2 is not configured')
        }
        const client = new S3Client({
            region: 'auto',
            endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            forcePathStyle: true,
            credentials: {
                accessKeyId: process.env.R2_ACCESS_KEY_ID ?? '',
                secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? '',
            },
        })
        await client.send(new ListObjectsV2Command({ Bucket: process.env.R2_BUCKET, MaxKeys: 1 }))
    })

    const latencyMs = Math.max(supabaseProbe.latencyMs, r2Probe.latencyMs)
    const failures: string[] = []
    if (supabaseProbe.error) failures.push(`supabase: ${brief(supabaseProbe.error)}`)
    if (r2Probe.error) failures.push(`r2: ${brief(r2Probe.error)}`)

    if (failures.length > 0) {
        // Supabase storage is on the serving path for admin assets; R2 for
        // public photos. Either failing is a real outage, but losing both is
        // what makes the component unreachable rather than partly broken.
        const both = supabaseProbe.error && r2Probe.error
        return {
            id: 'storage',
            status: both ? 'down' : 'degraded',
            latencyMs,
            detail: failures.join(' · '),
        }
    }
    return {
        id: 'storage',
        status: latencyMs > SLOW_COMPONENT_MS ? 'degraded' : 'operational',
        latencyMs,
        detail: null,
    }
}

/* ------------------------------------------------------------------ */
/* Queue + error rate                                                  */
/* ------------------------------------------------------------------ */

type Countable = { count: number | null; error: { message: string } | null }

async function countOf(query: PromiseLike<Countable>): Promise<number | null> {
    try {
        const { count, error } = await query
        return error ? null : count ?? 0
    } catch {
        return null
    }
}

const EMPTY_QUEUE: QueueHealth = { pending: 0, failed: 0, oldestPendingAt: null }

async function probeQueue(since: string): Promise<{ component: MetricComponent; queue: QueueHealth; errorRate: ErrorRate }> {
    const started = Date.now()
    try {
        const db = createAdminClient()
        const [tasksPending, tasksFailed, outboxPending, outboxFailed, oldestTask, oldestOutbox, tasksTotal, outboxTotal] =
            await Promise.all([
                countOf(db.from('storage_tasks').select('id', { count: 'exact', head: true }).in('status', ['pending', 'processing'])),
                countOf(db.from('storage_tasks').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', since)),
                countOf(db.from('notification_outbox').select('id', { count: 'exact', head: true }).eq('status', 'pending')),
                countOf(db.from('notification_outbox').select('id', { count: 'exact', head: true }).eq('status', 'failed').gte('created_at', since)),
                db.from('storage_tasks').select('created_at').in('status', ['pending', 'processing']).order('created_at', { ascending: true }).limit(1),
                db.from('notification_outbox').select('created_at').eq('status', 'pending').order('created_at', { ascending: true }).limit(1),
                countOf(db.from('storage_tasks').select('id', { count: 'exact', head: true }).gte('created_at', since)),
                countOf(db.from('notification_outbox').select('id', { count: 'exact', head: true }).gte('created_at', since)),
            ])

        // A null count means that half of the queue could not be read — the
        // component is degraded rather than silently reporting zero backlog.
        const unreadable = [tasksPending, tasksFailed, outboxPending, outboxFailed].filter((n) => n === null).length
        const oldestPendingAt = earliest(
            (oldestTask.data ?? []) as { created_at: string | null }[],
            (oldestOutbox.data ?? []) as { created_at: string | null }[],
        )

        const queue: QueueHealth = {
            pending: (tasksPending ?? 0) + (outboxPending ?? 0),
            failed: (tasksFailed ?? 0) + (outboxFailed ?? 0),
            oldestPendingAt,
        }
        const totalOps = (tasksTotal ?? 0) + (outboxTotal ?? 0)
        const failedOps = queue.failed
        const errorRate: ErrorRate = {
            windowHours: ERROR_WINDOW_HOURS,
            failedOps,
            totalOps,
            ratePct: totalOps > 0 ? Math.round((failedOps / totalOps) * 100) : 0,
        }

        const backlogged = queue.pending > QUEUE_BACKLOG_DEGRADED || queue.failed > QUEUE_FAILED_DEGRADED
        const component: MetricComponent = {
            id: 'queue',
            status: unreadable > 0 || backlogged ? 'degraded' : 'operational',
            latencyMs: Date.now() - started,
            detail:
                unreadable > 0
                    ? `${unreadable} of 4 queue counts could not be read`
                    : backlogged
                      ? `${queue.pending} waiting, ${queue.failed} failed in ${ERROR_WINDOW_HOURS}h`
                      : null,
        }
        return { component, queue, errorRate }
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logger.warn('metrics', 'queue probe failed', { error: message })
        return {
            component: { id: 'queue', status: 'unknown', latencyMs: Date.now() - started, detail: brief(message) },
            queue: EMPTY_QUEUE,
            errorRate: { windowHours: ERROR_WINDOW_HOURS, failedOps: 0, totalOps: 0, ratePct: 0 },
        }
    }
}

function earliest(...groups: { created_at: string | null }[][]): string | null {
    const stamps = groups.flat().map((row) => row.created_at).filter((v): v is string => Boolean(v))
    if (stamps.length === 0) return null
    return stamps.reduce((min, cur) => (cur < min ? cur : min))
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** No service key = nothing can be probed. Reported, not thrown. */
function unconfiguredMetrics(started: number, detail: string): SystemMetrics {
    const components: MetricComponent[] = (['api', 'database', 'storage', 'queue'] as const).map((id) => ({
        id,
        status: 'unknown',
        latencyMs: null,
        detail: id === 'api' ? null : detail,
    }))
    return {
        status: 'unknown',
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - started,
        components,
        queue: EMPTY_QUEUE,
        errorRate: { windowHours: ERROR_WINDOW_HOURS, failedOps: 0, totalOps: 0, ratePct: 0 },
        runtime: runtimeFacts(),
    }
}

/**
 * One aggregation across every dependency (spec §52). Never throws: a probe
 * failure is data (the component's status), because the caller is a health
 * surface that must render during exactly the outage it is reporting on.
 */
export async function getSystemMetrics(): Promise<SystemMetrics> {
    const started = Date.now()

    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        return unconfiguredMetrics(started, 'Service-role credentials are not configured')
    }

    const since = new Date(Date.now() - ERROR_WINDOW_HOURS * 3_600_000).toISOString()
    const [database, storage, queueProbe] = await Promise.all([
        probeDatabase(),
        probeStorage(),
        probeQueue(since),
    ])

    const api: MetricComponent = {
        id: 'api',
        status: 'operational',
        latencyMs: Date.now() - started,
        detail: null,
    }

    const components = [api, database, storage, queueProbe.component]
    return {
        status: deriveSystemStatus([database, storage, queueProbe.component], queueProbe.queue, queueProbe.errorRate),
        timestamp: new Date().toISOString(),
        durationMs: Date.now() - started,
        components,
        queue: queueProbe.queue,
        errorRate: queueProbe.errorRate,
        runtime: runtimeFacts(),
    }
}

/**
 * The verdict alone — what a caller that only needs to branch on health reads.
 * Kept separate from `getSystemMetrics` so the DEGRADED-state hook (spec §52)
 * does not have to care about the shape of the evidence.
 */
export async function getSystemStatus(): Promise<SystemStatus> {
    try {
        return (await getSystemMetrics()).status
    } catch (err) {
        logger.warn('metrics', 'getSystemStatus failed', {
            error: err instanceof Error ? err.message : String(err),
        })
        return 'unknown'
    }
}
