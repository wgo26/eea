import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
    headers: async () => new Headers(),
}));
vi.mock("@/lib/supabase/admin", () => ({
    createAdminClient: () => ({ rpc }),
}));

import {
    buildRateLimitKey,
    checkRateLimitForKey,
    getTrustedProxyCount,
    parseTrustedProxyCount,
    resolveClientIpFromHeaders,
    TRUSTED_PROXY_COUNT_DEFAULT,
    TRUSTED_PROXY_COUNT_MAX,
} from "./rate-limit";

/** Header lookup from a plain object, mirroring the real (lowercase) names. */
function headerLookup(map: Record<string, string>) {
    return (name: string) => map[name] ?? null;
}

describe("parseTrustedProxyCount", () => {
    it("defaults to 1 when unset or unparseable", () => {
        expect(parseTrustedProxyCount(undefined)).toBe(TRUSTED_PROXY_COUNT_DEFAULT);
        expect(parseTrustedProxyCount("")).toBe(TRUSTED_PROXY_COUNT_DEFAULT);
        expect(parseTrustedProxyCount("nonsense")).toBe(TRUSTED_PROXY_COUNT_DEFAULT);
    });

    it("defaults rather than trusting a negative depth", () => {
        expect(parseTrustedProxyCount("-1")).toBe(TRUSTED_PROXY_COUNT_DEFAULT);
    });

    it("accepts explicit depth including zero", () => {
        expect(parseTrustedProxyCount("0")).toBe(0);
        expect(parseTrustedProxyCount("2")).toBe(2);
        expect(parseTrustedProxyCount(" 3 ")).toBe(3);
    });

    it("clamps absurd depths so a bad value cannot widen trust", () => {
        expect(parseTrustedProxyCount("999999")).toBe(TRUSTED_PROXY_COUNT_MAX);
    });
});

describe("resolveClientIpFromHeaders (trusted-proxy contract)", () => {
    it("returns the client for an overwrite-mode proxy (N=1)", () => {
        const get = headerLookup({ "x-forwarded-for": "203.0.113.7" });
        expect(resolveClientIpFromHeaders(get, 1)).toBe("203.0.113.7");
    });

    it("ignores a forged prefix in append-mode (N=1)", () => {
        // Attacker sent "1.2.3.4"; the proxy appended the real peer address.
        const get = headerLookup({ "x-forwarded-for": "1.2.3.4, 203.0.113.7" });
        expect(resolveClientIpFromHeaders(get, 1)).toBe("203.0.113.7");
    });

    it("ignores multi-hop forgeries (N=1)", () => {
        const get = headerLookup({
            "x-forwarded-for": "9.9.9.9, 8.8.8.8, 203.0.113.7",
        });
        expect(resolveClientIpFromHeaders(get, 1)).toBe("203.0.113.7");
    });

    it("stops one hop short of the app behind two trusted proxies (N=2)", () => {
        // CDN -> nginx: xff = "client, cdn-edge". The app's own hop is not in xff.
        const get = headerLookup({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" });
        expect(resolveClientIpFromHeaders(get, 2)).toBe("198.51.100.4");
    });

    it("cannot be spoofed by a forged prefix in front of a legit chain (N=2)", () => {
        const get = headerLookup({
            "x-forwarded-for": "1.2.3.4, 198.51.100.4, 10.0.0.1",
        });
        expect(resolveClientIpFromHeaders(get, 2)).toBe("198.51.100.4");
    });

    it("does not trust forwarded headers at all when N=0", () => {
        const get = headerLookup({ "x-forwarded-for": "1.2.3.4" });
        expect(resolveClientIpFromHeaders(get, 0)).toBe("unknown");
    });

    it("prefers the proxy-set x-real-ip when the chain is too short", () => {
        const get = headerLookup({ "x-real-ip": "203.0.113.9" });
        expect(resolveClientIpFromHeaders(get, 1)).toBe("203.0.113.9");
    });

    it("falls back to x-real-ip when a chain is shorter than the trusted depth", () => {
        const get = headerLookup({
            "x-forwarded-for": "1.2.3.4",
            "x-real-ip": "203.0.113.9",
        });
        expect(resolveClientIpFromHeaders(get, 3)).toBe("203.0.113.9");
    });

    it("returns 'unknown' when no identity header is present", () => {
        expect(resolveClientIpFromHeaders(headerLookup({}), 1)).toBe("unknown");
    });

    it("tolerates whitespace and empty hops", () => {
        const get = headerLookup({ "x-forwarded-for": "  1.2.3.4 , , 203.0.113.7  " });
        expect(resolveClientIpFromHeaders(get, 1)).toBe("203.0.113.7");
    });

    it("truncates pathological values to keep DB keys bounded", () => {
        const long = "a".repeat(300);
        const get = headerLookup({ "x-forwarded-for": long });
        expect(resolveClientIpFromHeaders(get, 1)).toHaveLength(64);
    });
});

describe("getTrustedProxyCount", () => {
    const original = process.env.TRUSTED_PROXY_COUNT;
    afterEach(() => {
        if (original === undefined) delete process.env.TRUSTED_PROXY_COUNT;
        else process.env.TRUSTED_PROXY_COUNT = original;
    });

    it("reads the env var", () => {
        process.env.TRUSTED_PROXY_COUNT = "2";
        expect(getTrustedProxyCount()).toBe(2);
    });

    it("falls back to the default when unset", () => {
        delete process.env.TRUSTED_PROXY_COUNT;
        expect(getTrustedProxyCount()).toBe(TRUSTED_PROXY_COUNT_DEFAULT);
    });
});

describe("buildRateLimitKey", () => {
    it("namespaces the identity by scope", () => {
        expect(buildRateLimitKey("auth:login", "203.0.113.7")).toBe(
            "auth:login:203.0.113.7",
        );
    });
});

describe("checkRateLimitForKey failure policy", () => {
    beforeEach(() => {
        rpc.mockReset();
    });

    it("allows the request when the limiter errors and no policy is given", async () => {
        rpc.mockResolvedValue({ data: null, error: { message: "db down" } });
        const result = await checkRateLimitForKey("k", { max: 5, windowMs: 60_000 });
        expect(result.ok).toBe(true);
    });

    it("blocks the request when the limiter errors under fail-closed", async () => {
        rpc.mockResolvedValue({ data: null, error: { message: "db down" } });
        const result = await checkRateLimitForKey("auth:login:1.2.3.4", {
            max: 5,
            windowMs: 60_000,
            policy: "fail-closed",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.retryAfterSeconds).toBe(60);
    });

    it("blocks the request when the limiter throws under fail-closed", async () => {
        rpc.mockRejectedValue(new Error("network reset"));
        const result = await checkRateLimitForKey("upload:ip:1.2.3.4", {
            max: 5,
            windowMs: 30_000,
            policy: "fail-closed",
        });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.retryAfterSeconds).toBe(30);
    });

    it("allows the request when the limiter throws under fail-open", async () => {
        rpc.mockRejectedValue(new Error("network reset"));
        const result = await checkRateLimitForKey("search:suggest:1.2.3.4", {
            max: 5,
            windowMs: 30_000,
            policy: "fail-open",
        });
        expect(result.ok).toBe(true);
    });

    it("denies when the limiter reports over-quota, under either policy", async () => {
        rpc.mockResolvedValue({ data: false, error: null });
        const closed = await checkRateLimitForKey("k", {
            max: 5,
            windowMs: 60_000,
            policy: "fail-closed",
        });
        expect(closed.ok).toBe(false);

        rpc.mockResolvedValue({ data: false, error: null });
        const open = await checkRateLimitForKey("k", { max: 5, windowMs: 60_000 });
        expect(open.ok).toBe(false);
    });

    it("allows a first hit inside the window", async () => {
        rpc.mockResolvedValue({ data: true, error: null });
        const result = await checkRateLimitForKey("k", {
            max: 5,
            windowMs: 60_000,
            policy: "fail-closed",
        });
        expect(result.ok).toBe(true);
    });

    it("passes the ceiling and a whole-second window to the RPC", async () => {
        rpc.mockResolvedValue({ data: true, error: null });
        await checkRateLimitForKey("k", { max: 7, windowMs: 1500 });
        expect(rpc).toHaveBeenCalledWith("check_rate_limit", {
            p_key: "k",
            p_max: 7,
            p_window_seconds: 2,
        });
    });
});