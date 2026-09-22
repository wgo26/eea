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
 * Failure policy is per-call (see RateLimitPolicy): cheap, non-mutating reads
 * fail OPEN so a limiter outage never takes the site down, while credential,
 * write and spend surfaces fail CLOSED so an outage cannot be converted into an
 * unlimited-requests window.
 *
 * Identity comes from a trusted-proxy contract (resolveClientIp) rather than a
 * blind read of x-forwarded-for: the client can prepend forged hops, so the
 * client address must be taken relative to the number of trusted proxies in
 * front of the app.
 */

export type RateLimitPolicy = "fail-open" | "fail-closed";

export type RateLimitOptions = {
    max: number;
    windowMs: number;
    /**
     * What to do when the limiter itself cannot answer (RPC error/exception):
     *  - "fail-closed" — block the request. For credential, write and spend
     *    surfaces (login, signup, submissions, votes, uploads, contact reveal):
     *    the alternative is unlimited abuse for the duration of the outage.
     *  - "fail-open" (default) — allow the request. For cheap, non-mutating
     *    reads, where a limiter blip must not break the page.
     */
    policy?: RateLimitPolicy;
};

export type RateLimitResult =
    | { ok: true }
    | { ok: false; retryAfterSeconds: number };

/** Builds the per-scope, per-identity counter key (pure, unit-tested). */
export function buildRateLimitKey(scope: string, identity: string): string {
    return `${scope}:${identity}`;
}

/**
 * Trusted-proxy contract. `X-Forwarded-For` is appendable by the client, so an
 * attacker can prepend arbitrary hops; only entries to the RIGHT of the trusted
 * proxies are trustworthy. With N trusted proxies the client address sits at
 * index `hops.length - N`, which is correct whether the proxy APPENDS
 * (`$proxy_add_x_forwarded_for`) or OVERWRITES (`$remote_addr`) the header:
 *
 *   overwrite, N=1: forged "1.2.3.4" → "realclient"        → idx 0 = client
 *   append,    N=1: forged "1.2.3.4" → "1.2.3.4,realclient" → idx 1 = client
 *
 * The forged prefix is discarded in both cases. Defaults to 1 (the deployment
 * terminates TLS in front of the app); set TRUSTED_PROXY_COUNT=0 only when the
 * app is reached directly, in which case forwarded headers are unusable.
 */
export const TRUSTED_PROXY_COUNT_DEFAULT = 1;

/** Upper bound for the configured proxy depth — a bad env value cannot widen trust. */
export const TRUSTED_PROXY_COUNT_MAX = 8;

/** Clamps the env value to a sane proxy depth (pure, unit-tested). */
export function parseTrustedProxyCount(raw: string | undefined): number {
    const parsed = Number.parseInt((raw ?? "").trim(), 10);
    if (!Number.isFinite(parsed) || parsed < 0) return TRUSTED_PROXY_COUNT_DEFAULT;
    return Math.min(parsed, TRUSTED_PROXY_COUNT_MAX);
}

/**
 * Pure resolver: header lookup in, client identity out. Kept free of
 * `next/headers` so it can be unit-tested against forged chains.
 */
export function resolveClientIpFromHeaders(
    get: (name: string) => string | null,
    trustedProxyCount: number = TRUSTED_PROXY_COUNT_DEFAULT,
): string {
    if (trustedProxyCount > 0) {
        const forwarded = get("x-forwarded-for");
        if (forwarded) {
            const hops = forwarded
                .split(",")
                .map((hop) => hop.trim())
                .filter(Boolean);
            if (hops.length >= trustedProxyCount) {
                return hops[hops.length - trustedProxyCount].slice(0, 64);
            }
        }
    }
    // Either no trusted proxy is configured (forwarded data is unattributable)
    // or the chain is shorter than the trusted depth. `x-real-ip` is only set by
    // the proxy itself, so it is a better fallback than a forged xff hop.
    const realIp = get("x-real-ip")?.trim();
    if (realIp) return realIp.slice(0, 64);
    return "unknown";
}

/**
 * Client identity for rate-limit keys. Prefer `checkRateLimit`, which applies
 * the configured proxy depth and an explicit failure policy.
 */
export async function getClientIp(): Promise<string> {
    const requestHeaders = await headers();
    return resolveClientIpFromHeaders(
        (name) => requestHeaders.get(name),
        getTrustedProxyCount(),
    );
}

/**
 * Phase 0 — request-scoped IP resolution for Route Handlers.
 *
 * `getClientIp()` reads `next/headers`, which is unavailable in some handler
 * contexts and untestable against forged chains. Route handlers already hold
 * the `Request`, so resolve directly from its headers with the same
 * trusted-proxy contract (`resolveClientIpFromHeaders`). Never read
 * `x-forwarded-for.split(',')[0]` inline — the client can prepend forged
 * hops and rotate the throttle key.
 */
export function resolveClientIpFromRequest(request: Request): string {
    return resolveClientIpFromHeaders(
        (name) => request.headers.get(name),
        getTrustedProxyCount(),
    );
}

/** Proxy depth from the environment (evaluated per call so tests can stub it). */
export function getTrustedProxyCount(): number {
    return parseTrustedProxyCount(process.env.TRUSTED_PROXY_COUNT);
}

/**
 * Counts one hit for the given scope + IP and reports whether the request
 * may proceed. Identity can be overridden (e.g. a user id for authenticated
 * quotas) via checkRateLimitForKey.
 *
 * Pass `policy: "fail-closed"` on credential, write and spend surfaces.
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
    const policy: RateLimitPolicy = options.policy ?? "fail-open";
    const denied: RateLimitResult = { ok: false, retryAfterSeconds: windowSeconds };

    const onLimiterFailure = (kind: "query" | "exception", detail: string): RateLimitResult => {
        logger.warn("rate-limit", `limiter ${kind} failed (${policy})`, { key, error: detail });
        // Fail closed: refuse rather than convert a limiter outage into an
        // unlimited-requests window on a high-risk surface.
        return policy === "fail-closed" ? denied : { ok: true };
    };

    try {
        const supabase = createAdminClient();
        const { data, error } = await supabase.rpc("check_rate_limit", {
            p_key: key,
            p_max: options.max,
            p_window_seconds: windowSeconds,
        });
        if (error) return onLimiterFailure("query", error.message);
        if (data === false) return denied;
        return { ok: true };
    } catch (err) {
        return onLimiterFailure(
            "exception",
            err instanceof Error ? err.message : String(err),
        );
    }
}