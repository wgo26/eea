/**
 * Production Turnstile behaviour (EEAD-002 — fail-closed in production).
 *
 * - TURNSTILE_SECRET_KEY set → verify against the siteverify endpoint;
 *   missing token or failed verification → false.
 * - TURNSTILE_SECRET_KEY unset + production (or TURNSTILE_REQUIRE=1) →
 *   false, so an unset secret can never silently disable bot protection on
 *   the live site. Set BOTH TURNSTILE_SECRET_KEY (server) and
 *   NEXT_PUBLIC_TURNSTILE_SITE_KEY (client widget) to enable.
 * - TURNSTILE_SECRET_KEY unset + non-production → true (local-dev
 *   convenience; the widget has no keys locally).
 */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/observability/logger", () => ({
    logger: { warn: vi.fn(), error: vi.fn() },
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    process.env = { ...ORIGINAL_ENV };
    delete process.env.TURNSTILE_SECRET_KEY;
    delete process.env.TURNSTILE_REQUIRE;
});

afterEach(() => {
    vi.unstubAllEnvs();
    process.env = { ...ORIGINAL_ENV };
});

async function verify(token?: string | null, nodeEnv?: string) {
    vi.stubEnv("NODE_ENV", nodeEnv ?? "test");
    const { verifyTurnstileToken } = await import("./turnstile");
    return verifyTurnstileToken(token);
}

describe("verifyTurnstileToken without a secret", () => {
    it("fails open outside production (local-dev convenience)", async () => {
        expect(await verify(null, "test")).toBe(true);
    });

    it("fails closed in production so bots cannot bypass the CAPTCHA", async () => {
        expect(await verify(null, "production")).toBe(false);
        expect(await verify("some-token", "production")).toBe(false);
    });

    it("fails closed in dev when TURNSTILE_REQUIRE=1 (production rehearsal)", async () => {
        process.env.TURNSTILE_REQUIRE = "1";
        expect(await verify(null, "test")).toBe(false);
    });
});
