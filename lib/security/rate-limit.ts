import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";

/**
 * Durable, multi-instance-safe rate limiting for public write surfaces.
 *
 * Backed by the `check_rate_limit` Postgres RPC (fixed-window counter in
 * `rate_limit_hits`, migration 20260918000000), so limits hold across every
 * Node instance — unlike the in-memory limiter in /api/uploads.
 *
 * Fail-open policy: if the limiter itself is unavailable, requests proceed and
 * the error is logged. Abuse protection must never take the site down; the
 * upload route's separate in-memory limiter still applies as a backstop there.
 */

export type RateLimitOptions = { max: number; windowMs: number };

export type RateLimitResult =
    | { ok: true }
    | { ok: false; retryAfterSeconds: number };

/** Builds the per-scope, per-identity counter key (pure, unit-tested). */
export function buildRateLimitKey(scope: string, identity: string): string {
    return `${scope}:${identity}`;
}

/**
 * Best-effort client identity from proxy headers. Hostinger terminates TLS
 * in front of the app, so x-forwarded-for's first hop is the client; it is
 * truncated to keep pathological headers out of the database key.
 */
export async function getClientIp(): Promise<string> {
    const requestHeaders = await headers();
    const forwarded = requestHeaders.get("x-forwarded-for");
    if (forwarded) {
        const first = forwarded.split(",")[0]?.trim();
        if (first) return first.slice(0, 64);
    }
    return (requestHeaders.get("x-real-ip") ?? "unknown").slice(0, 64);
}

/**
 * Counts one hit for the given scope + IP and reports whether the request
 * may proceed. Identity can be overridden (e.g. a user id for authenticated
 * quotas) via checkRateLimitForKey.
 */
export async function checkRateLimit(
    scope: string,
    options: RateLimitOptions,
): Promise<RateLimitResult> {
    const ip = await getClientIp();
    return checkRateLimitForKey(buildRateLimitKey(scope, ip), options);
}

export async function checkRateLimitForKey(
    key: string,
    options: RateLimitOptions,
): Promise<RateLimitResult> {
    const windowSeconds = Math.max(1, Math.ceil(options.windowMs / 1000));
    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase.rpc("check_rate_limit", {
            p_key: key,
            p_max: options.max,
            p_window_seconds: windowSeconds,
        });
        if (error) {
            logger.warn("rate-limit", "limiter query failed (fail-open)", { key, error: error.message });
            return { ok: true }; // fail open — availability over strictness
        }
        if (data === false) return { ok: false, retryAfterSeconds: windowSeconds };
        return { ok: true };
    } catch (err) {
        logger.warn("rate-limit", "limiter exception (fail-open)", { key, error: err instanceof Error ? err.message : String(err) });
        return { ok: true }; // fail open
    }
}