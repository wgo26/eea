import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { logger } from "@/lib/observability/logger";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VOICES = new Set(["formal", "pidgin", "camfranglais"]);
const LOCALES = new Set(["en", "fr"]);

/**
 * POST /api/content/[id]/share — per-content share counter bump + aggregate
 * share-voice beacon in one tap.
 *
 * Body: `{ voice?: "formal"|"pidgin"|"camfranglais", locale?: "en"|"fr" }`.
 * Both writes are aggregate-only (no identity stored). The per-content
 * `share_count` powers the public ">10 shares" proof + admin top-shared
 * tables; the `share-{voice}` aggregate surface powers the voice-register
 * breakdown in admin insights without any schema change.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Unknown content." }, { status: 400 });
  }

  const limited = await checkRateLimit("content:share", {
    max: 60,
    windowMs: 60_000,
    policy: "fail-open",
  });
  if (!limited.ok) {
    return new NextResponse(null, { status: 429 });
  }

  let voice = "formal";
  let locale = "en";
  try {
    const body = (await request.json()) as {
      voice?: unknown;
      locale?: unknown;
    };
    if (typeof body.voice === "string" && VOICES.has(body.voice)) {
      voice = body.voice;
    }
    if (typeof body.locale === "string" && LOCALES.has(body.locale)) {
      locale = body.locale;
    }
  } catch {
    /* empty body — defaults apply */
  }

  try {
    const db = createAdminClient();
    // See view route: `content_share_bump` lands in the generated types
    // once the migration is applied to the typed DB.
    const bump = db.rpc as unknown as (
      fn: string,
      args: Record<string, string | number>,
    ) => Promise<{ error: { message: string } | null }>;
    const { error: shareErr } = await bump("content_share_bump", {
      p_id: id,
    });
    if (shareErr) throw new Error(shareErr.message);
    // Aggregate voice-register counter (same contract as the W21 beacon).
    const { error: voiceErr } = await db.rpc("analytics_bump", {
      p_surface: `share-${voice}`,
      p_locale: locale,
      p_place: "",
      p_delta: 1,
    });
    if (voiceErr) throw new Error(voiceErr.message);
  } catch (err) {
    logger.warn("content/share", "bump failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new NextResponse(null, { status: 204 });
  }

  return new NextResponse(null, { status: 204 });
}
