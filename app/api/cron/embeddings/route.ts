import { NextResponse } from 'next/server'
import { requireCronSecret } from '@/lib/security/cron-auth'
import { stampHeartbeat } from '@/lib/automation/heartbeat'

export const dynamic = 'force-dynamic'

/**
 * P5 — nightly embedding backfill (memory layer upkeep). Embeds up to 50
 * published items missing a vector so semantic related / dedupe / archive
 * search improve every morning. Bounded + best-effort: a missing key,
 * extension or column resolves to {embedded: 0, skipped: N}, never a 500.
 */
async function runEmbeddings(request: Request) {
  const denied = requireCronSecret(request, 'embeddings', 'embeddings-cron')
  if (denied) return denied
  const { aiEmbedMissing } = await import('@/lib/admin/actions/ai')
  const result = await aiEmbedMissing(50)
  return NextResponse.json({ ok: true, ...result })
}

export async function POST(request: Request) {
  return stampHeartbeat('embeddings', runEmbeddings(request))
}

export async function GET(request: Request) {
  return stampHeartbeat('embeddings', runEmbeddings(request))
}
