import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const startTime = Date.now()

/**
 * Phase 3.3 — Liveness probe (audit §5.2).
 * Fast, dependency-free: orchestrators / load balancers hit this to know the
 * Node process is up. Never touches the database or object storage — that is
 * the readiness probe's job (/api/ready).
 */
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    service: 'eea',
    version: process.env.APP_VERSION ?? process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? 'dev',
    uptimeSeconds: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  })
}
