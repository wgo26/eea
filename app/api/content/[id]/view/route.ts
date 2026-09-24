import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/observability/logger";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * POST /api/content/[id]/view — per-content view counter bump.
 *
 * Privacy contract: increments `content_items.view_count` only. No IP, UA,
 * referrer, or user id is persisted. Observational: failures are swallowed
 * (204) so a counter outage never breaks reading. Rate-limited per IP,
 * fail-open like the aggregate analytics beacon.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Unknown content." }, { status: 400 });
  }

  const limited = await checkRateLimit("content:view", {
    max: 60,
    windowMs: 60_000,
    policy: "fail-open",
  });
  if (!limited.ok) {
    return new NextResponse(null, { status: 429 });
  }

  try {
    // Typed against the generated schema once
    // `scripts/generate-database-types.mjs` runs against the migrated DB
    // (migration 20260925000000_content_counters adds this RPC).
    const { error } = await (
      createAdminClient().rpc as unknown as (
        fn: string,
        args: Record<string, string>,
      ) => Promise<{ error: { message: string } | null }>
    )("content_view_bump", { p_id: id });
    if (error) throw new Error(error.message);
  } catch (err) {
    logger.warn("content/view", "bump failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(null, { status: 204 });
}
