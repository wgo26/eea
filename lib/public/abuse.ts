import type { SubmitState } from "@/lib/public/types";
import { checkRateLimit, type RateLimitOptions } from "@/lib/security/rate-limit";
import { isCurrentRequestIpBlocked } from "@/lib/security/ip-blocklist";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { honeypotTripped } from "@/lib/security/honeypot";

/**
 * Shared abuse budgets + allowlists + guards for the public server actions.
 *
 * Plain module (no `use server`): the leaf action modules
 * (`submit-actions`, `contact-actions`, `report-actions`,
 * `engagement-actions`) import from here, and unit tests import the pure
 * validators directly. Splitting keeps each action file single-responsibility
 * without tripping `scripts/verify-server-actions.mjs` (a `use server`
 * barrel may not re-export values).
 */

/** Per-action abuse budgets (per IP, fixed window — migration 20260918000000). */
export const RATE_LIMITS = {
    story: { max: 5, windowMs: 10 * 60_000 },
    advertise: { max: 5, windowMs: 60 * 60_000 },
    contact: { max: 5, windowMs: 60 * 60_000 },
    takedown: { max: 5, windowMs: 60 * 60_000 },
    dataRequest: { max: 5, windowMs: 60 * 60_000 },
    revealContact: { max: 10, windowMs: 10 * 60_000 },
    report: { max: 10, windowMs: 60 * 60_000 },
    watch: { max: 20, windowMs: 60 * 60_000 },
    reactions: { max: 30, windowMs: 60 * 60_000 },
} satisfies Record<string, RateLimitOptions>;

/**
 * Field names that make up a submission's `payload` JSON (per type).
 *
 * Phase 4.3: this list is mirrored — field-for-field — by the DB trigger
 * `enforce_submission_payload_shape()` (migration 20260921000000), which
 * rejects unknown/oversized fields for every writer, service_role included.
 * Keep the two lists in sync when adding a form field.
 */
export const PAYLOAD_FIELDS = [
    "headline",
    "description",
    "what",
    "location",
    "location_id",
    "location_text",
    // Lean cut (audit §3.6): latitude/longitude dropped — precise reporter
    // coordinates are a privacy risk for vulnerable reporters. Location is
    // `location_id` (canonical place) + free-text only. Any posted lat/lng
    // is stripped below and never reaches the queue.
    "date",
    "photos",
    "videos",
    "audios",
    "documents",
    "noticeType",
    "noticeDirection",
    "organization",
    "expiry",
    "item",
    "category",
    "price",
    "currency",
    "doc",
    "message",
    "contributorName",
    "email",
    "phone",
] as const;

export const SUBMISSION_TYPES = [
    "photo_story",
    "news",
    "culture",
    "notice",
    "buy_sell",
] as const;

/**
 * Allowlist mirrors for the submit form enums. Client `required` attributes
 * and `<select>` options are bypassable with a direct POST, so the server
 * re-validates every constrained value. Keep in sync with:
 * - `NOTICE_TYPE_META` keys (`lib/notice-types.ts`) + the notice `<select>`
 *   in `components/submit/submit-form.tsx`,
 * - the buy-sell category `<select>` in the same file,
 * - `CURRENCIES` in the same file.
 */
export const NOTICE_TYPE_KEYS = [
    "public_notice",
    "lost_found",
    "road_closure",
    "community_alert",
    "missing_person",
    "service_announcement",
    "government_notice",
    "school_notice",
    "organization_notice",
    "other",
] as const;

export const NOTICE_DIRECTION_KEYS = ["lost", "found"] as const;

export const BUY_SELL_CATEGORIES = [
    "phones",
    "vehicles",
    "property",
    "furniture",
    "fashion",
    "jobs",
    "agriculture",
    "household",
    "business",
    "other",
] as const;

export const SUBMIT_CURRENCIES = ["XAF", "XOF", "CDF", "USD", "EUR", "NGN", "GHS"] as const;

export const REPORT_TYPES = ["spam", "abuse", "misinformation", "other"] as const;

/**
 * Per-type minimum content for `submitStory`. Returns the SubmitState error
 * code when the payload cannot produce a reviewable submission, or null when
 * it passes. This is the server-side twin of the form's `required`
 * attributes — without it a direct POST with a single free-text field would
 * land a content-less row in the moderation queue.
 */
export function validateSubmissionContent(
    submissionType: string,
    payload: Record<string, string>,
): string | null {
    switch (submissionType) {
        case "photo_story":
            return payload.what ? null : "missing_content";
        case "news":
        case "culture":
            return payload.headline && payload.description ? null : "missing_content";
        case "notice":
            if (
                !payload.noticeType ||
                !(NOTICE_TYPE_KEYS as readonly string[]).includes(payload.noticeType)
            ) {
                return "missing_content";
            }
            if (
                payload.noticeType === "lost_found" &&
                !(NOTICE_DIRECTION_KEYS as readonly string[]).includes(payload.noticeDirection)
            ) {
                return "missing_content";
            }
            return payload.item && payload.message ? null : "missing_content";
        case "buy_sell":
            if (
                !payload.category ||
                !(BUY_SELL_CATEGORIES as readonly string[]).includes(payload.category)
            ) {
                return "missing_content";
            }
            return payload.item && payload.description ? null : "missing_content";
        default:
            return "missing_content";
    }
}

/** Canonical title key used by the duplicate-submit guard below. */
export function submissionTitleKey(payload: Record<string, string>): string {
    return (payload.headline || payload.item || payload.what || payload.message || "")
        .trim()
        .slice(0, 120);
}

/**
 * Full fingerprint for the duplicate guard: title plus the body field. Title
 * alone false-positives when one person files two different stories under
 * similar headlines ("Market fire") within minutes; the body makes that
 * collision near-impossible while a true double-click still matches exactly.
 */
export function submissionFingerprint(payload: Record<string, string>): string {
    const body = (payload.description || payload.message || "").trim().slice(0, 200);
    return `${submissionTitleKey(payload)}|${body}`;
}

export function str(value: FormDataEntryValue | null): string {
    if (typeof value === "string") return value.trim();
    return "";
}

export function isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Shared abuse gate for anonymous public forms, checked before any write:
 *   1. honeypot — bots get a fake success (nothing is written);
 *   2. durable per-IP fixed-window rate limit (migration 20260918000000);
 *   3. Turnstile verification — enforced only when TURNSTILE_SECRET_KEY is
 *      set (features.md: "CAPTCHA or equivalent at submission").
 * Returns the SubmitState to return when blocked, or null to continue.
 */
export async function guardPublicSubmission(
    scope: string,
    limits: RateLimitOptions,
    formData: FormData,
): Promise<SubmitState | null> {
    if (honeypotTripped(formData)) return { ok: true };
    // Chief-managed network block first: blocked scanners must not consume
    // rate-limit slots, and read as throttling so they learn nothing.
    // fail-closed: these paths write rows and send mail on behalf of a guest, so
    // a limiter outage must block rather than allow unlimited submissions.
    if (await isCurrentRequestIpBlocked()) return { ok: false, error: "rate_limited" };
    const limited = await checkRateLimit(scope, { ...limits, policy: "fail-closed" });
    if (!limited.ok) return { ok: false, error: "rate_limited" };
    const tokenValue = formData.get("cf-turnstile-response");
    if (!(await verifyTurnstileToken(typeof tokenValue === "string" ? tokenValue : null))) {
        return { ok: false, error: "captcha" };
    }
    return null;
}
