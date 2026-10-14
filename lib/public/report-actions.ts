"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { getSessionUser } from "@/lib/auth/guards";
import type { SubmitState } from "@/lib/public/types";
import { enqueueStaffAlert } from "@/lib/notify/queue";
import { sendGuestReceipt } from "@/lib/notify/guest-receipts";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { isCurrentRequestIpBlocked } from "@/lib/security/ip-blocklist";
import { verifyTurnstileToken } from "@/lib/security/turnstile";
import { RATE_LIMITS, REPORT_TYPES, guardPublicSubmission, isEmail, str } from "./abuse";

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
    // IP block first so blocked scanners never consume rate-limit slots.
    if (await isCurrentRequestIpBlocked()) {
        return { ok: false, error: "Too many reports. Please try again later." };
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
