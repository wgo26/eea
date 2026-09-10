"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { getSessionUser } from "@/lib/auth/guards";
import type { SubmitState } from "@/lib/public/types";
import { checkRateLimit, type RateLimitOptions } from "@/lib/security/rate-limit";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { honeypotTripped } from "@/lib/security/honeypot";

/** Per-action abuse budgets (per IP, fixed window — migration 20260918000000). */
const RATE_LIMITS = {
    story: { max: 5, windowMs: 10 * 60_000 },
    advertise: { max: 5, windowMs: 60 * 60_000 },
    contact: { max: 5, windowMs: 60 * 60_000 },
    takedown: { max: 5, windowMs: 60 * 60_000 },
    dataRequest: { max: 5, windowMs: 60 * 60_000 },
    revealContact: { max: 10, windowMs: 10 * 60_000 },
} satisfies Record<string, RateLimitOptions>;

/**
 * Field names that make up a submission's `payload` JSON (per type).
 *
 * Phase 4.3: this list is mirrored — field-for-field — by the DB trigger
 * `enforce_submission_payload_shape()` (migration 20260921000000), which
 * rejects unknown/oversized fields for every writer, service_role included.
 * Keep the two lists in sync when adding a form field.
 */
const PAYLOAD_FIELDS = [
    "headline",
    "description",
    "what",
    "location",
    "date",
    "photos",
    "noticeType",
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

const SUBMISSION_TYPES = [
    "photo_story",
    "news",
    "culture",
    "notice",
    "buy_sell",
] as const;

function str(value: FormDataEntryValue | null): string {
    if (typeof value === "string") return value.trim();
    return "";
}

/**
 * Shared abuse gate for anonymous public forms, checked before any write:
 *   1. honeypot — bots get a fake success (nothing is written);
 *   2. durable per-IP fixed-window rate limit (migration 20260918000000);
 *   3. Turnstile verification — enforced only when TURNSTILE_SECRET_KEY is
 *      set (features.md: "CAPTCHA or equivalent at submission").
 * Returns the SubmitState to return when blocked, or null to continue.
 */
async function guardPublicSubmission(
    scope: string,
    limits: RateLimitOptions,
    formData: FormData,
): Promise<SubmitState | null> {
    if (honeypotTripped(formData)) return { ok: true };
    const limited = await checkRateLimit(scope, limits);
    if (!limited.ok) return { ok: false, error: "rate_limited" };
    const tokenValue = formData.get("cf-turnstile-response");
    if (!(await verifyTurnstileToken(typeof tokenValue === "string" ? tokenValue : null))) {
        return { ok: false, error: "captcha" };
    }
    return null;
}

/**
 * Public "Submit a Story" funnel. No account required: guests' details and
 * the full form payload land in `submissions` for the editorial queue. Uses
 * the service-role client so unauthenticated visitors can write.
 */
export async function submitStory(
    _prev: SubmitState,
    formData: FormData,
): Promise<SubmitState> {
    const blocked = await guardPublicSubmission("public:story", RATE_LIMITS.story, formData);
    if (blocked) return blocked;

    const submissionType = str(formData.get("submissionType"));
    if (!SUBMISSION_TYPES.includes(submissionType as (typeof SUBMISSION_TYPES)[number])) {
        return { ok: false, error: "invalid_type" };
    }

    const guestName = str(formData.get("contributorName"));
    const guestEmail = str(formData.get("email"));
    const guestPhone = str(formData.get("phone"));
    const consentConfirmed = formData.get("consent") === "on";
    const rightsConfirmed = formData.get("rights") === "on";

    if (!guestName) return { ok: false, error: "missing_name" };
    if (submissionType !== "buy_sell" && !guestEmail && !guestPhone) {
        return { ok: false, error: "missing_contact" };
    }
    if (!consentConfirmed || !rightsConfirmed) {
        return { ok: false, error: "missing_consent" };
    }

    const payload: Record<string, string> = {};
    for (const field of PAYLOAD_FIELDS) {
        const value = str(formData.get(field));
        if (value) payload[field] = value;
    }
    // photos come as newline-separated links → normalise to an array
    if (payload.photos) {
        payload.photos = payload.photos
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean)
            .join("\n");
    }

    if (Object.keys(payload).length === 0) {
        return { ok: false, error: "missing_content" };
    }

    try {
        const supabase = createAdminClient();
        // Link authenticated submits to the account so /account/dashboard can
        // show history via RLS (submitted_by = auth.uid()). Guests stay null
        // and fall back to the guest_email policy.
        let submittedBy: string | null = null;
        try {
            const session = await getSessionUser();
            submittedBy = session.user?.id ?? null;
        } catch {
            submittedBy = null;
        }
        const { error } = await supabase.from("submissions").insert({
            submission_type: submissionType,
            submitted_by: submittedBy,
            guest_name: guestName,
            guest_email: guestEmail || null,
            guest_phone: guestPhone || null,
            payload,
            consent_confirmed: consentConfirmed,
            rights_confirmed: rightsConfirmed,
            status: "pending",
        });
        if (error) {
            logger.error("submitStory", "insert failed", { error: error.message });
            return { ok: false, error: "db" };
        }
        return { ok: true };
    } catch (err) {
        logger.error("submitStory", "insert exception", { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: "db" };
    }
}

/**
 * Advertise inquiry. Inserts an `advertisers` row, then an `ad_campaigns` row
 * (status 'pending') so the request lands in the admin ads queue.
 */
export async function submitAdvertiseInquiry(
    _prev: SubmitState,
    formData: FormData,
): Promise<SubmitState> {
    const blocked = await guardPublicSubmission("public:advertise", RATE_LIMITS.advertise, formData);
    if (blocked) return blocked;

    const companyName = str(formData.get("company"));
    const contactName = str(formData.get("contactName"));
    const email = str(formData.get("email"));
    const phone = str(formData.get("phone"));
    const placement = str(formData.get("placement"));
    const message = str(formData.get("message"));

    if (!companyName || !email) {
        return { ok: false, error: "missing_required" };
    }

    try {
        const supabase = createAdminClient();

        // Duplicate-inquiry detection (Phase 4 omission): one pending campaign
        // per contact email per week — retries within the window are rejected
        // instead of piling identical rows into the admin ads queue.
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60_000).toISOString();
        const { data: existingAdvertiser } = await supabase
            .from("advertisers")
            .select("id")
            .eq("email", email)
            .limit(1);
        if (existingAdvertiser && existingAdvertiser.length > 0) {
            const { data: pendingCampaign } = await supabase
                .from("ad_campaigns")
                .select("id")
                .eq("advertiser_id", existingAdvertiser[0].id)
                .eq("status", "pending")
                .gte("created_at", sevenDaysAgo)
                .limit(1);
            if (pendingCampaign && pendingCampaign.length > 0) {
                return { ok: false, error: "duplicate" };
            }
        }

        const { data: advertiser, error: advError } = await supabase
            .from("advertisers")
            .insert({
                company_name: companyName,
                contact_name: contactName || null,
                email: email || null,
                phone: phone || null,
            })
            .select("id")
            .limit(1)
            .single();

        if (advError) {
            logger.error("advertise", "advertiser insert failed", { error: advError.message });
            return { ok: false, error: "db" };
        }

        const { error: campError } = await supabase.from("ad_campaigns").insert({
            advertiser_id: advertiser?.id ?? null,
            name: companyName,
            status: "pending",
            copy_text: [placement ? `[Placement: ${placement}]` : "", message]
                .filter(Boolean)
                .join("\n\n"),
        });
        if (campError) {
            logger.error("advertise", "campaign insert failed", { error: campError.message });
            return { ok: false, error: "db" };
        }
        return { ok: true };
    } catch (err) {
        logger.error("advertise", "insert exception", { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: "db" };
    }
}

function isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Contact inquiry — stored as a `data_requests` row (request_type 'contact')
 * so the editorial queue in the admin area can triage it alongside privacy
 * requests. No account required.
 */
export async function submitContactRequest(
    _prev: SubmitState,
    formData: FormData,
): Promise<SubmitState> {
    const blocked = await guardPublicSubmission("public:contact", RATE_LIMITS.contact, formData);
    if (blocked) return blocked;

    const name = str(formData.get("name"));
    const email = str(formData.get("email"));
    const topic = str(formData.get("topic")) || "other";
    const message = str(formData.get("message"));

    if (!name || !isEmail(email) || !message) {
        return { ok: false, error: "invalid" };
    }

    try {
        const supabase = createAdminClient();
        const { error } = await supabase.from("data_requests").insert({
            requester_email: email,
            request_type: `contact:${topic}`,
            description: `From: ${name}\nTopic: ${topic}\n\n${message}`.slice(0, 4000),
            status: "open",
        });
        if (error) {
            logger.error("contact", "insert failed", { error: error.message });
            return { ok: false, error: "db" };
        }
        return { ok: true };
    } catch (err) {
        logger.error("contact", "insert exception", { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: "db" };
    }
}

/**
 * Copyright takedown request — a dedicated flow separate from generic abuse
 * reports (features.md Gap-Fill §19). Stored as a `reports` row with
 * report_type 'copyright' so it lands in the trust & safety queue without
 * requiring a media_id up front (takedown_requests.media_id is NOT NULL).
 */
export async function submitTakedownReport(
    _prev: SubmitState,
    formData: FormData,
): Promise<SubmitState> {
    const blocked = await guardPublicSubmission("public:takedown", RATE_LIMITS.takedown, formData);
    if (blocked) return blocked;

    const name = str(formData.get("name"));
    const email = str(formData.get("email"));
    const contentUrl = str(formData.get("contentUrl"));
    const basis = str(formData.get("basis"));
    const details = str(formData.get("details"));

    if (!name || !basis) {
        return { ok: false, error: "invalid" };
    }

    try {
        const supabase = createAdminClient();
        const { error } = await supabase.from("reports").insert({
            report_type: "copyright",
            subject: `Takedown — ${name}`.slice(0, 200),
            description: [
                `Claimant: ${name}`,
                email ? `Email: ${email}` : null,
                contentUrl ? `URL: ${contentUrl}` : null,
                `Rights basis: ${basis}`,
                details ? `\n${details}` : null,
            ]
                .filter(Boolean)
                .join("\n")
                .slice(0, 4000),
            evidence_url: contentUrl?.startsWith("http") ? contentUrl : null,
            status: "open",
        });
        if (error) {
            logger.error("takedown", "insert failed", { error: error.message });
            return { ok: false, error: "db" };
        }
        return { ok: true };
    } catch (err) {
        logger.error("takedown", "insert exception", { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: "db" };
    }
}

/**
 * Privacy / data request — access, deletion or contact follow-up. Stored in
 * `data_requests` with the requester's email so logged-out visitors can use
 * it (the "Own data requests" RLS policy permits email-scoped rows).
 */
export async function submitDataRequest(
    _prev: SubmitState,
    formData: FormData,
): Promise<SubmitState> {
    const blocked = await guardPublicSubmission("public:data-request", RATE_LIMITS.dataRequest, formData);
    if (blocked) return blocked;

    const email = str(formData.get("email"));
    const type = str(formData.get("type")) || "access";
    const details = str(formData.get("details"));

    if (!isEmail(email) || !details) {
        return { ok: false, error: "invalid" };
    }

    try {
        const supabase = createAdminClient();
        const { error } = await supabase.from("data_requests").insert({
            requester_email: email,
            request_type: type,
            description: details.slice(0, 4000),
            status: "open",
        });
        if (error) {
            logger.error("data-request", "insert failed", { error: error.message });
            return { ok: false, error: "db" };
        }
        return { ok: true };
    } catch (err) {
        logger.error("data-request", "insert exception", { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: "db" };
    }
}

/**
 * Article correction submission. Stores the factual correction report in
 * `public.corrections` linked to the target article.
 */
export async function submitArticleCorrection(
    _prev: SubmitState,
    formData: FormData,
): Promise<SubmitState> {
    const blocked = await guardPublicSubmission("public:correction", RATE_LIMITS.takedown, formData);
    if (blocked) return blocked;

    const slug = str(formData.get("slug"));
    const reporterName = str(formData.get("name"));
    const reporterEmail = str(formData.get("email"));
    const wrong = str(formData.get("wrong"));
    const suggested = str(formData.get("suggested"));

    if (!slug || !wrong || !reporterEmail) {
        return { ok: false, error: "missing_required" };
    }

    if (!isEmail(reporterEmail)) {
        return { ok: false, error: "invalid" };
    }

    try {
        const supabase = createAdminClient();
        const { data: item, error: itemError } = await supabase
            .from("content_items")
            .select("id")
            .or(`id.eq.${slug},slug.eq.${slug}`)
            .limit(1)
            .maybeSingle();

        if (itemError || !item) {
            return { ok: false, error: "not_found" };
        }

        const { user } = await getSessionUser();

        const fullCorrection = [
            `What is wrong:\n${wrong}`,
            suggested ? `\nSuggested correction:\n${suggested}` : "",
        ]
            .filter(Boolean)
            .join("\n");

        const { error: insertError } = await supabase.from("corrections").insert({
            content_item_id: item.id,
            reporter_name: reporterName || null,
            reporter_email: reporterEmail,
            reporter_id: user?.id ?? null,
            correction_text: fullCorrection.slice(0, 4000),
            status: "open",
        });

        if (insertError) {
            logger.error("submitArticleCorrection", "insert failed", { error: insertError.message });
            return { ok: false, error: "db" };
        }

        return { ok: true };
    } catch (err) {
        logger.error("submitArticleCorrection", "insert exception", { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: "db" };
    }
}

/**
 * Acceptance trail for logged-in users: records that the current user
 * accepted the given policy version. Guests are covered instead by the
 * consent booleans stored on their `submissions` row — policy_acceptances
 * requires a user_id.
 */
export async function recordPolicyAcceptance(
    policyVersionId: string,
): Promise<SubmitState> {
    try {
        const { supabase, user } = await getSessionUser();
        if (!user) return { ok: false, error: "auth" };
        const { error } = await supabase.from("policy_acceptances").insert({
            user_id: user.id,
            policy_version_id: policyVersionId,
        });
        // Unique violations just mean "already accepted" — treat as success.
        if (error && !/duplicate|unique/i.test(error.message)) {
            logger.error("policy-accept", "insert failed", { error: error.message });
            return { ok: false, error: "db" };
        }
        return { ok: true };
    } catch (err) {
        logger.error("policy-accept", "insert exception", { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: "db" };
    }
}

export type RevealContactResult =
    | {
          ok: true;
          contact: {
              phone: string | null;
              email: string | null;
              whatsapp: string | null;
          };
      }
    | {
          ok: false;
          error: "rate_limited" | "not_found" | "db";
      };

/**
 * On-demand, rate-limited server action for retrieving seller contact details.
 * Prevents raw PII (phone, email, WhatsApp) from being serialized into the initial
 * server-rendered HTML of Buy & Sell listings.
 *
 * Production hardening (audit §1.1):
 *   - identifier is sanitized (PostgREST `or()` metacharacters stripped);
 *   - only live listings are revealable (published, unarchived, listing_status
 *     'active', not expired);
 *   - every reveal attempt is logged best-effort to `moderation_log`
 *     (action 'contact_reveal') for anti-scraping anomaly detection — a logging
 *     failure never blocks the response.
 */
export async function revealSellerContact(listingId: string): Promise<RevealContactResult> {
    if (!listingId || typeof listingId !== "string") {
        return { ok: false, error: "not_found" };
    }
    const identifier = listingId.replace(/[,()%\\]/g, " ").trim().slice(0, 80);
    if (!identifier) {
        return { ok: false, error: "not_found" };
    }

    const limited = await checkRateLimit("public:reveal_contact", RATE_LIMITS.revealContact);
    if (!limited.ok) {
        return { ok: false, error: "rate_limited" };
    }

    try {
        const supabase = createAdminClient();
        const { data: item, error: itemError } = await supabase
            .from("content_items")
            .select("id, slug, status, is_archived, expires_at, listings(listing_status, contact_phone, contact_email, whatsapp_number)")
            .eq("type", "listing")
            .eq("status", "published")
            .eq("is_archived", false)
            .or(`id.eq.${identifier},slug.eq.${identifier}`)
            .limit(1)
            .maybeSingle();

        if (itemError || !item) {
            return { ok: false, error: "not_found" };
        }

        // Expired or non-active listings must not reveal seller PII.
        if (item.expires_at && new Date(item.expires_at).getTime() <= Date.now()) {
            return { ok: false, error: "not_found" };
        }
        const row = item as {
            id: string;
            expires_at?: string | null;
            listings?: unknown;
        };
        const listing = (Array.isArray(row.listings) ? row.listings[0] : row.listings) as {
            listing_status?: string | null;
            contact_phone?: string | null;
            contact_email?: string | null;
            whatsapp_number?: string | null;
        } | null;
        if (!listing || listing.listing_status !== "active") {
            return { ok: false, error: "not_found" };
        }

        // Best-effort anti-scraping trail (moderation_log is staff-read-only;
        // the insert uses the service-role client and must never fail the reveal).
        try {
            await supabase.from("moderation_log").insert({
                content_item_id: row.id,
                action: "contact_reveal",
                notes: "seller contact revealed via rate-limited action",
            });
        } catch (logErr) {
            logger.warn("revealSellerContact", "audit log insert failed", {
                error: logErr instanceof Error ? logErr.message : String(logErr),
            });
        }

        return {
            ok: true,
            contact: {
                phone: listing?.contact_phone?.trim() || null,
                email: listing?.contact_email?.trim() || null,
                whatsapp: listing?.whatsapp_number?.trim() || null,
            },
        };
    } catch (err) {
        logger.error("revealSellerContact", "lookup exception", { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: "db" };
    }
}

