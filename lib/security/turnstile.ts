import { logger } from "@/lib/observability/logger";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Feature switch: Turnstile is only enforced when the secret is configured. */
export function isTurnstileConfigured(): boolean {
    return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/**
 * Verifies a Cloudflare Turnstile token server-side (features.md: "CAPTCHA or
 * equivalent at submission").
 *
 * - Feature on (TURNSTILE_SECRET_KEY set): missing token or failed
 *   verification → false (fail closed).
 * - Feature off + production: fail closed (false) so an unset secret can
 *   never silently disable bot protection on the live site. Set BOTH
 *   TURNSTILE_SECRET_KEY (server) and NEXT_PUBLIC_TURNSTILE_SITE_KEY
 *   (client widget) to enable.
 * - Feature off + non-production: true (local-dev convenience; the widget
 *   has no keys locally). Override with TURNSTILE_REQUIRE=1 to rehearse the
 *   production behaviour in dev.
 */
export async function verifyTurnstileToken(
    token: string | null | undefined,
    remoteIp?: string,
): Promise<boolean> {
    const secret = process.env.TURNSTILE_SECRET_KEY;
    if (!secret) {
        if (process.env.NODE_ENV === "production" || process.env.TURNSTILE_REQUIRE === "1") {
            logger.warn("turnstile", "rejected: secret not configured (fail-closed)");
            return false;
        }
        return true;
    }
    if (!token) return false;

    try {
        const body = new URLSearchParams({ secret, response: token });
        if (remoteIp) body.set("remoteip", remoteIp);
        const res = await fetch(SITEVERIFY_URL, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body,
            cache: "no-store",
        });
        if (!res.ok) {
            logger.error("turnstile", "siteverify http", { status: res.status });
            return false;
        }
        const outcome = (await res.json()) as {
            success?: boolean;
            "error-codes"?: string[];
        };
        if (outcome.success !== true) {
            logger.warn("turnstile", "rejected", { codes: outcome["error-codes"]?.join(",") });
            return false;
        }
        return true;
    } catch (err) {
        // Verification transport failure must not wave bad traffic through.
        logger.error("turnstile", "siteverify failed", { error: err instanceof Error ? err.message : String(err) });
        return false;
    }
}