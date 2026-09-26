"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { getSessionUser } from "@/lib/auth/guards";
import type { SubmitState } from "@/lib/public/types";
import { checkRateLimit, getClientIp, type RateLimitOptions } from "@/lib/security/rate-limit";
import { isIpBlocked } from "@/lib/security/ip-blocklist";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { honeypotTripped } from "@/lib/security/honeypot";
import { enqueueStaffAlert, enqueueUser } from "@/lib/notify/queue";
import { sendGuestReceipt } from "@/lib/notify/guest-receipts";
import type { ReactionKind, ReactionState } from "@/lib/public/types";
import { REACTION_KINDS } from "@/lib/public/types";

/** Per-action abuse budgets (per IP, fixed window — migration 20260918000000). */
const RATE_LIMITS = {
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
const PAYLOAD_FIELDS = [
    "headline",
    "description",
    "what",
    "location",
    "location_id",
    "location_text",
    "latitude",
    "longitude",
    "date",
    "photos",
    "videos",
    "audios",
    "documents",
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
    // fail-closed: these paths write rows and send mail on behalf of a guest, so
    // a limiter outage must block rather than allow unlimited submissions.
    const limited = await checkRateLimit(scope, { ...limits, policy: "fail-closed" });
    if (!limited.ok) return { ok: false, error: "rate_limited" };
    // Chief-managed network block: reads as throttling so a blocked scanner
    // learns nothing.
    if (await isIpBlocked(await getClientIp())) return { ok: false, error: "rate_limited" };
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

    // Resolve the caller's profile first: signed-in contributors submit
    // under their account and inherit missing identity fields from it, so
    // the form can collapse name/email/phone for them.
    let submittedBy: string | null = null;
    let profileName = "";
    let profileEmail = "";
    let profilePhone = "";
    try {
        const session = await getSessionUser();
        submittedBy = session.user?.id ?? null;
        if (submittedBy) {
            try {
                const supabaseProfile = createAdminClient();
                const { data: profile } = await supabaseProfile
                    .from("profiles")
                    .select("display_name, full_name, email, phone")
                    .eq("id", submittedBy)
                    .maybeSingle();
                const p = (profile ?? {}) as {
                    display_name?: string | null;
                    full_name?: string | null;
                    email?: string | null;
                    phone?: string | null;
                };
                profileName = (p.display_name || p.full_name || "").trim();
                profileEmail = (p.email || session.user?.email || "").trim();
                profilePhone = (p.phone || "").trim();
            } catch {
                profileEmail = (session.user?.email || "").trim();
            }
        }
    } catch {
        submittedBy = null;
    }

    const guestName = str(formData.get("contributorName")) || profileName;
    const guestEmail = str(formData.get("email")) || profileEmail;
    const guestPhone = str(formData.get("phone")) || profilePhone;
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
    // photos/videos/audios/documents come as newline-separated links →
    // normalise to http(s)-only URL lists. Non-URL lines (and javascript:/data:
    // schemes) are dropped at intake so they can never reach stored payloads or
    // rendered href/src attributes.
    for (const key of ["photos", "videos", "audios", "documents"] as const) {
        if (payload[key]) {
            payload[key] = payload[key]
                .split("\n")
                .map((line) => line.trim())
                // Keep the full line (captions after " - " survive), but only
                // when it opens with an http(s) URL.
                .filter((line) => /^https?:\/\/\S+/i.test(line))
                .join("\n");
            if (!payload[key]) delete payload[key];
        }
    }
    // doc is a single supporting link — same http(s)-only rule.
    if (payload.doc && !/^https?:\/\/\S+$/i.test(payload.doc.trim())) {
        delete payload.doc;
    }
    // Validate the canonical location pick: it must reference an active
    // location, otherwise drop it and keep the free-text suggestion for
    // editors. Coordinates are kept only when they parse as numbers.
    if (payload.location_id) {
        if (!/^[0-9a-f-]{8,36}$/i.test(payload.location_id)) {
            delete payload.location_id;
        }
    }
    for (const key of ["latitude", "longitude"] as const) {
        if (payload[key] && !/^-?\d{1,3}(\.\d{1,6})?$/.test(payload[key])) {
            delete payload[key];
        }
    }
    // Back-compat: the legacy `location` key mirrors the raw text so older
    // readers/admin views keep working.
    if (!payload.location && payload.location_text) {
        payload.location = payload.location_text;
    }

    if (Object.keys(payload).length === 0) {
        return { ok: false, error: "missing_content" };
    }

    try {
        const supabase = createAdminClient();
        // submittedBy was resolved above (profile fallback) so
        // /account/dashboard history keeps working via RLS
        // (submitted_by = auth.uid()); guests stay null and fall back to
        // the guest_email policy.
        if (payload.location_id) {
            try {
                const { data: loc } = await supabase
                    .from("locations")
                    .select("id")
                    .eq("id", payload.location_id)
                    .eq("is_active", true)
                    .limit(1)
                    .maybeSingle();
                if (!loc) delete payload.location_id;
            } catch {
                delete payload.location_id;
            }
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
        // Notify (best-effort, never fails the submission): staff get a
        // moderation alert, signed-in contributors get an in-app receipt.
        const storyTitle =
            payload.headline || payload.item || payload.what || payload.message || submissionType;
        void enqueueStaffAlert("submission.received", {
            type: submissionType,
            title: storyTitle.slice(0, 140),
            from: guestName.slice(0, 80),
        });
        void enqueueUser("submission.confirmation", submittedBy, {
            title: storyTitle.slice(0, 140),
        }, "/account/submissions");
        // Guest receipt: signed-in users get the in-app loop above; guests
        // with a valid email get one direct SMTP receipt (best-effort).
        if (!submittedBy) void sendGuestReceipt("submission", guestEmail);
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
    const format = str(formData.get("format"));
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
            copy_text: [placement ? `[Placement: ${placement}]` : "", format ? `[Format: ${format}]` : "", message]
                .filter(Boolean)
                .join("\n\n"),
        });
        if (campError) {
            logger.error("advertise", "campaign insert failed", { error: campError.message });
            return { ok: false, error: "db" };
        }
        void enqueueStaffAlert("advertise.inquiry", {
            company: companyName.slice(0, 80),
            email: email.slice(0, 80),
            placement: placement || "unspecified",
            format: format || "unspecified",
        });
        void sendGuestReceipt("advertise", email);
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
        void enqueueStaffAlert("legal.contact", { from: `${name} <${email}>`.slice(0, 120), topic });
        void sendGuestReceipt("contact", email);
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
        void enqueueStaffAlert("legal.takedown", {
            from: `${name}${email ? ` <${email}>` : ""}`.slice(0, 120),
            url: contentUrl.slice(0, 200) || null,
        });
        void sendGuestReceipt("takedown", email);
        return { ok: true };
    } catch (err) {
        logger.error("takedown", "insert exception", { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: "db" };
    }
}

/**
 * Privacy / data request — access, deletion or contact follow-up. Stored in
 * `data_requests` with the requester's email so logged-out visitors can use
 * it. Writes go through the service-role client; reads are owner + staff only
 * (migration 20260921120000 closed the anonymous `requester_email` SELECT
 * branch — see scripts/verify-security-posture.mjs).
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
        void enqueueStaffAlert("legal.data_request", { from: email.slice(0, 120), type });
        void sendGuestReceipt("data_request", email);
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

        void enqueueStaffAlert("content.correction", { title: `article ${slug}`.slice(0, 140) });
        void sendGuestReceipt("correction", reporterEmail);
        return { ok: true };
    } catch (err) {
        logger.error("submitArticleCorrection", "insert exception", { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: "db" };
    }
}

const REPORT_TYPES = ["spam", "abuse", "misinformation", "other"] as const;

/**
 * Public content report (news / photo stories / culture / notices /
 * listings). Anyone may file one — the `reports` table has an
 * insert-for-all policy and the trust & safety queue is the triage UI, so
 * no staff alert is needed. Rate-limited + Turnstile-gated like the other
 * public intakes; signed-in reporters are linked, guests stay anonymous.
 */
export async function submitContentReport(input: {
    contentItemId: string;
    reportType: string;
    details?: string;
    turnstileToken?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
    if (!REPORT_TYPES.includes(input.reportType as (typeof REPORT_TYPES)[number])) {
        return { ok: false, error: "Unknown report reason." };
    }
    const limited = await checkRateLimit("public:report", {
        ...RATE_LIMITS.report,
        policy: "fail-closed",
    });
    if (!limited.ok) return { ok: false, error: "Too many reports. Please try again later." };
    if (!(await verifyTurnstileToken(input.turnstileToken ?? null))) {
        return { ok: false, error: "Please complete the human-verification step." };
    }
    try {
        const supabase = createAdminClient();
        const { data: item } = await supabase
            .from("content_items")
            .select("id")
            .eq("id", input.contentItemId)
            .limit(1)
            .maybeSingle();
        if (!item) return { ok: false, error: "Content not found." };
        const { user } = await getSessionUser();
        const { error } = await supabase.from("reports").insert({
            report_type: input.reportType,
            content_item_id: input.contentItemId,
            reporter_id: user?.id ?? null,
            description: input.details?.trim().slice(0, 2000) || null,
            status: "open",
        });
        if (error) {
            logger.error("submitContentReport", "insert failed", { error: error.message });
            return { ok: false, error: "Could not send the report." };
        }
        return { ok: true };
    } catch (err) {
        logger.error("submitContentReport", "insert exception", { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: "Could not send the report." };
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

    const limited = await checkRateLimit("public:reveal_contact", {
        ...RATE_LIMITS.revealContact,
        policy: "fail-closed",
    });
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

export type RevealNoticeContactResult =
    | {
          ok: true;
          contact: {
              phone: string | null;
              email: string | null;
          };
      }
    | {
          ok: false;
          error: "rate_limited" | "not_found" | "db";
      };

/**
 * Phase 0 — gated notice-contact reveal (parity with listings).
 *
 * Notices expose only `hasContact` in SSR HTML (`lib/queries/notices.ts`
 * `toNoticeData`); column-level REVOKEs (migration 20260921120000) block
 * direct PostgREST reads of `notices.contact_phone/contact_email` for
 * anon/authenticated. Values leave the server only through this
 * rate-limited action, and only for live, unexpired notices. Every attempt
 * is audit-logged best-effort (`contact_reveal` on moderation_log).
 */
export async function revealNoticeContact(noticeId: string): Promise<RevealNoticeContactResult> {
    if (!noticeId || typeof noticeId !== "string") {
        return { ok: false, error: "not_found" };
    }
    const identifier = noticeId.replace(/[,()%\\]/g, " ").trim().slice(0, 80);
    if (!identifier) {
        return { ok: false, error: "not_found" };
    }

    const limited = await checkRateLimit("public:reveal_notice_contact", {
        ...RATE_LIMITS.revealContact,
        policy: "fail-closed",
    });
    if (!limited.ok) {
        return { ok: false, error: "rate_limited" };
    }

    try {
        const supabase = createAdminClient();
        const { data: item, error: itemError } = await supabase
            .from("content_items")
            .select("id, slug, status, is_archived, notices!inner(expiry_date, contact_phone, contact_email)")
            .eq("type", "notice")
            .eq("status", "published")
            .eq("is_archived", false)
            .or(`id.eq.${identifier},slug.eq.${identifier}`)
            .limit(1)
            .maybeSingle();

        if (itemError || !item) {
            return { ok: false, error: "not_found" };
        }

        const row = item as {
            id: string;
            notices?: unknown;
        };
        const notice = (Array.isArray(row.notices) ? row.notices[0] : row.notices) as {
            expiry_date?: string | null;
            contact_phone?: string | null;
            contact_email?: string | null;
        } | null;
        if (!notice) {
            return { ok: false, error: "not_found" };
        }
        if (notice.expiry_date && new Date(notice.expiry_date).getTime() <= Date.now()) {
            return { ok: false, error: "not_found" };
        }
        const phone = notice.contact_phone?.trim() || null;
        const email = notice.contact_email?.trim() || null;
        if (!phone && !email) {
            return { ok: false, error: "not_found" };
        }

        try {
            await supabase.from("moderation_log").insert({
                content_item_id: row.id,
                action: "contact_reveal",
                notes: "notice contact revealed via rate-limited action",
            });
        } catch (logErr) {
            logger.warn("revealNoticeContact", "audit log insert failed", {
                error: logErr instanceof Error ? logErr.message : String(logErr),
            });
        }

        return { ok: true, contact: { phone, email } };
    } catch (err) {
        logger.error("revealNoticeContact", "lookup exception", { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: "db" };
    }
}

/**
 * Saves a draft submission for an authenticated user. (P1-6)
 * Upserts a single pending draft per user per submission type.
 */
export async function saveStoryDraft(
    _prev: SubmitState,
    formData: FormData,
): Promise<SubmitState> {
    const submissionType = str(formData.get("submissionType"));
    if (!SUBMISSION_TYPES.includes(submissionType as (typeof SUBMISSION_TYPES)[number])) {
        return { ok: false, error: "invalid_type" };
    }

    try {
        const { user } = await getSessionUser();
        if (!user) {
            return { ok: false, error: "auth" };
        }

        const payload: Record<string, string> = {};
        for (const field of PAYLOAD_FIELDS) {
            const value = str(formData.get(field));
            if (value) payload[field] = value;
        }

        if (Object.keys(payload).length === 0) {
            return { ok: true }; // Nothing to save
        }

        const supabase = createAdminClient();

        // Check if an existing draft exists for this user and type
        const { data: existingDraft } = await supabase
            .from("submissions")
            .select("id")
            .eq("submitted_by", user.id)
            .eq("submission_type", submissionType)
            .eq("status", "draft")
            .limit(1)
            .maybeSingle();

        if (existingDraft) {
            const { error: updateError } = await supabase
                .from("submissions")
                .update({ payload })
                .eq("id", existingDraft.id);
            
            if (updateError) {
                logger.error("saveStoryDraft", "update failed", { error: updateError.message });
                return { ok: false, error: "db" };
            }
        } else {
            const { error: insertError } = await supabase.from("submissions").insert({
                submission_type: submissionType,
                submitted_by: user.id,
                payload,
                status: "draft",
            });
            if (insertError) {
                logger.error("saveStoryDraft", "insert failed", { error: insertError.message });
                return { ok: false, error: "db" };
            }
        }

        return { ok: true };
    } catch (err) {
        logger.error("saveStoryDraft", "exception", { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: "db" };
    }
}

export type PriceWatchState = { watching: boolean; watchers: number };

/**
 * Phase 3 — price-drop alerts for marketplace savers.
 * Toggle a watch on a live listing; staff price drops (updateListing) notify
 * all watchers via the existing `listing.update` outbox event. Watching
 * requires sign-in (watch rows are keyed by user id).
 */
export async function getPriceWatchState(listingId: string): Promise<PriceWatchState> {
    try {
        const { user } = await getSessionUser();
        const supabase = createAdminClient();
        const { count } = await supabase
            .from("price_watches")
            .select("user_id", { count: "exact", head: true })
            .eq("content_item_id", listingId);
        if (!user) return { watching: false, watchers: count ?? 0 };
        const { data } = await supabase
            .from("price_watches")
            .select("content_item_id")
            .eq("user_id", user.id)
            .eq("content_item_id", listingId)
            .limit(1);
        return { watching: ((data as unknown[])?.length ?? 0) > 0, watchers: count ?? 0 };
    } catch {
        return { watching: false, watchers: 0 };
    }
}

export async function togglePriceWatch(
    listingId: string,
): Promise<{ ok: true; watching: boolean } | { ok: false; error: string }> {
    if (!listingId || typeof listingId !== "string") return { ok: false, error: "not_found" };
    const identifier = listingId.trim().slice(0, 80);
    if (!identifier) return { ok: false, error: "not_found" };
    const limited = await checkRateLimit("public:price_watch", {
        ...RATE_LIMITS.watch,
        policy: "fail-closed",
    });
    if (!limited.ok) return { ok: false, error: "rate_limited" };
    try {
        const { user } = await getSessionUser();
        if (!user) return { ok: false, error: "auth" };
        const supabase = createAdminClient();
        const { data: existing } = await supabase
            .from("price_watches")
            .select("content_item_id")
            .eq("user_id", user.id)
            .eq("content_item_id", identifier)
            .limit(1);
        const isWatching = ((existing as unknown[])?.length ?? 0) > 0;
        const { error } = isWatching
            ? await supabase.from("price_watches").delete().eq("user_id", user.id).eq("content_item_id", identifier)
            : await supabase.from("price_watches").insert({ user_id: user.id, content_item_id: identifier });
        if (error) {
            logger.error("priceWatch", "toggle failed", { error: error.message });
            return { ok: false, error: "db" };
        }
        return { ok: true, watching: !isWatching };
    } catch (err) {
        logger.error("priceWatch", "exception", { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: "db" };
    }
}

/* ------------------------------------------------------------------ */
/* Content reactions (W20, spec §16 first slice)                        */
/* ------------------------------------------------------------------ */

const EMPTY_REACTIONS: ReactionState = { likes: 0, helpful: 0, mine: [] };

function cleanReactionToken(token: unknown): string | null {
    if (typeof token !== "string") return null;
    const t = token.trim();
    return /^[A-Za-z0-9-]{8,64}$/.test(t) ? t : null;
}

function cleanContentId(id: unknown): string | null {
    if (typeof id !== "string") return null;
    const t = id.trim().slice(0, 80);
    return t ? t : null;
}

/**
 * Reaction tallies + the caller's own taps for a content item. Anonymous:
 * identity is the browser-held reactor token (mirrors poll voter_token).
 * Never throws — outage callers render the empty state.
 */
export async function getContentReactionState(
    contentItemId: string,
    reactorToken: string | null,
): Promise<ReactionState> {
    const identifier = cleanContentId(contentItemId);
    if (!identifier) return EMPTY_REACTIONS;
    const token = cleanReactionToken(reactorToken);
    try {
        const supabase = createAdminClient();
        // Tallies via exact head-counts on the table (not the aggregate view:
        // views are only typed when the generator runs against a live schema,
        // so view reads would break `tsc` on DDL-only regeneration).
        const [likeRes, helpfulRes] = await Promise.all([
            supabase
                .from("content_reactions")
                .select("id", { count: "exact", head: true })
                .eq("content_item_id", identifier)
                .eq("kind", "like"),
            supabase
                .from("content_reactions")
                .select("id", { count: "exact", head: true })
                .eq("content_item_id", identifier)
                .eq("kind", "helpful"),
        ]);
        const state: ReactionState = {
            likes: likeRes.count ?? 0,
            helpful: helpfulRes.count ?? 0,
            mine: [],
        };
        if (token) {
            const { data: mine } = await supabase
                .from("content_reactions")
                .select("kind")
                .eq("content_item_id", identifier)
                .eq("reactor_token", token);
            state.mine = ((mine ?? []) as { kind: string }[])
                .map((r) => r.kind)
                .filter((k): k is ReactionKind => (REACTION_KINDS as readonly string[]).includes(k));
        }
        return state;
    } catch {
        return EMPTY_REACTIONS;
    }
}

/**
 * Toggle one reaction tap. Rate-limited fail-closed (writes must not sail
 * through a limiter outage); the unique constraint makes double-taps safe.
 */
export async function toggleContentReaction(
    contentItemId: string,
    kind: string,
    reactorToken: string,
): Promise<{ ok: true; state: ReactionState } | { ok: false; error: string }> {
    const identifier = cleanContentId(contentItemId);
    const token = cleanReactionToken(reactorToken);
    if (!identifier || !token) return { ok: false, error: "invalid" };
    if (!(REACTION_KINDS as readonly string[]).includes(kind)) return { ok: false, error: "invalid" };
    const limited = await checkRateLimit("public:reactions", {
        ...RATE_LIMITS.reactions,
        policy: "fail-closed",
    });
    if (!limited.ok) return { ok: false, error: "rate_limited" };
    try {
        const supabase = createAdminClient();
        const { data: existing } = await supabase
            .from("content_reactions")
            .select("id")
            .eq("content_item_id", identifier)
            .eq("kind", kind)
            .eq("reactor_token", token)
            .limit(1);
        const tapped = ((existing as unknown[])?.length ?? 0) > 0;
        const { error } = tapped
            ? await supabase
                  .from("content_reactions")
                  .delete()
                  .eq("content_item_id", identifier)
                  .eq("kind", kind)
                  .eq("reactor_token", token)
            : await supabase.from("content_reactions").insert({
                  content_item_id: identifier,
                  kind,
                  reactor_token: token,
              });
        if (error) {
            // 23505 = lost the double-tap race — re-read instead of failing.
            if (!tapped && error.code === "23505") {
                return { ok: true, state: await getContentReactionState(identifier, token) };
            }
            logger.error("reactions", "toggle failed", { error: error.message });
            return { ok: false, error: "db" };
        }
        return { ok: true, state: await getContentReactionState(identifier, token) };
    } catch (err) {
        logger.error("reactions", "exception", { error: err instanceof Error ? err.message : String(err) });
        return { ok: false, error: "db" };
    }
}
