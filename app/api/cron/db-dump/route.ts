import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger, generateCorrelationId } from "@/lib/observability/logger";
import { bearerMatches } from "@/lib/security/secrets";
import { storageConfig } from "@/lib/storage/config";
import { uploadToB2 } from "@/lib/storage/providers/b2";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

export const dynamic = "force-dynamic";

/**
 * Phase 5 — Nightly pg_dump to B2 (audit A12).
 * Runs via GitHub Actions scheduled job (scheduled-jobs.yml) → POST /api/cron/db-dump.
 * Produces a compressed custom-format dump and uploads to B2 with 30-day retention.
 *
 * Auth: CRON_SECRET bearer token. Production fails closed (missing secret = 500).
 * Uses the Supabase service-role connection string (pg_dump needs direct DB access).
 */
async function runDbDump(request: Request) {
  const startedAt = Date.now();
  const correlationId = generateCorrelationId();
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    logger.error("cron/db-dump", "CRON_SECRET not configured", { correlationId });
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { ok: false, error: "DB dump cron not configured" },
        { status: 500 },
      );
    }
    logger.warn("cron/db-dump", "running without CRON_SECRET (non-production only)", {
      correlationId,
    });
  } else if (!bearerMatches(authHeader, cronSecret)) {
    logger.warn("cron/db-dump", "unauthorized invocation", { correlationId });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    const msg = "SUPABASE_DB_URL not configured (required for pg_dump)";
    logger.error("cron/db-dump", msg, { correlationId });
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const dumpName = `eea-db-dump-${timestamp}.dump.gz`;

  try {
    const pgDump = spawn("pg_dump", [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--no-comments",
      dbUrl,
    ]);

    const gzip = createGzip({ level: 9 });
    const hasher = createHash("sha256");
    let uploadHash = "";
    let uploadSize = 0;

    // Collect gzipped dump into a buffer, then upload to B2.
    // For large dumps this could be memory-intensive; a streaming upload    // would be more efficient but requires extending the B2 provider.
    const chunks: Buffer[] = [];
    await pipeline(
      pgDump.stdout,
      gzip,
      async function* (source) {
        for await (const chunk of source) {
          hasher.update(chunk);
          uploadSize += chunk.length;
          chunks.push(Buffer.from(chunk));
          yield chunk;
        }
      },
    );

    uploadHash = hasher.digest("hex");

    const exitCode = await new Promise<number>((resolve) => {
      pgDump.on("close", resolve);
    });
    if (exitCode !== 0) {
      const stderr = await new Promise<string>((resolve) => {
        let stderr = "";
        pgDump.stderr.on("data", (c) => (stderr += c.toString()));
        pgDump.stderr.on("close", () => resolve(stderr));
      });
      throw new Error(`pg_dump exited with code ${exitCode}: ${stderr}`);
    }

    const dumpBuffer = Buffer.concat(chunks);
    await uploadToB2(storageConfig.b2.bucket, `db-dumps/${dumpName}`, dumpBuffer, "application/gzip");

    const supabase = createAdminClient();
    await supabase.from("db_dumps").insert({
      filename: dumpName,
      sha256: uploadHash,
      size_bytes: uploadSize,
      created_at: new Date().toISOString(),
      correlation_id: correlationId,
    });

    const durationMs = Date.now() - startedAt;
    logger.info("cron/db-dump", "dump completed", {
      correlationId,
      durationMs,
      filename: dumpName,
      sizeBytes: uploadSize,
      sha256: uploadHash.slice(0, 16),
    });

    return NextResponse.json({
      ok: true,
      timestamp: new Date().toISOString(),
      durationMs,
      correlationId,
      filename: dumpName,
      sizeBytes: uploadSize,
      sha256: uploadHash,
    });
  } catch (err) {
    const durationMs = Date.now() - startedAt;
    logger.error("cron/db-dump", "dump failed", {
      correlationId,
      durationMs,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "DB dump failed",
        correlationId,
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  return runDbDump(request);
}

export async function GET(request: Request) {
  return runDbDump(request);
}