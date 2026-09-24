import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAdminRoles, getUserRoles } from '@/lib/auth/roles'
import { effectiveCapabilities } from '@/lib/auth/admin-roles'
import { checkRateLimitForKey, buildRateLimitKey } from '@/lib/security/rate-limit'
import { getSystemMetrics } from '@/lib/observability/metrics'
import { logger } from '@/lib/observability/logger'

export const dynamic = 'force-dynamic'
// @aws-sdk (R2 probe) needs Node APIs; the metrics layer shares the ready-probe
// Node-only dependencies.
export const runtime = 'nodejs'

/**
 * Phase 4.4 — Aggregated platform metrics for the dashboard health widget and
 * the DEGRADED/CRITICAL state hook (spec §51/§52).
 *
 * Protection is the full spec §51 stack, in order:
 *   1. authenticated  — 401 when there is no session.
 *   2. authorized     — 403 unless the caller holds `viewDashboard` (legacy
 *      roles ∪ fine-grained admin roles, the same union pages use).
 *   3. rate-limited   — keyed by user id, fail-closed: this endpoint makes
 *      live database and object-storage round-trips, so a limiter outage must
 *      not open an unbounded dependency-drain.
 *
 * Response is the `SystemMetrics` aggregate — component statuses and latencies,
 * queue depth, background error rate and runtime facts. No credential, header
 * or environment value is ever included (spec §13).
 */
export async function GET() {
    const supabase = await createClient()
    const { data: userData } = await supabase.auth.getUser()
    const user = userData?.user
    if (!user) {
        return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 })
    }

    const roles = await getUserRoles(supabase, user.id)
    const adminRoles = await getAdminRoles(supabase, user.id)
    if (!effectiveCapabilities(roles, adminRoles).has('viewDashboard')) {
        return NextResponse.json({ error: 'Permission denied.' }, { status: 403 })
    }

    const limited = await checkRateLimitForKey(
        buildRateLimitKey('admin:metrics', user.id),
        { max: 30, windowMs: 60_000, policy: 'fail-closed' },
    )
    if (!limited.ok) {
        return NextResponse.json(
            { error: 'Too many requests.' },
            {
                status: 429,
                headers: { 'Retry-After': String(limited.retryAfterSeconds) },
            },
        )
    }

    try {
        const metrics = await getSystemMetrics()
        return NextResponse.json(metrics, { headers: { 'Cache-Control': 'no-store' } })
    } catch (err) {
        // getSystemMetrics degrades internally; this is the last-resort net.
        logger.error('metrics', 'metrics endpoint failed', {
            error: err instanceof Error ? err.message : String(err),
        })
        return NextResponse.json({ error: 'Metrics unavailable.' }, { status: 500 })
    }
}
