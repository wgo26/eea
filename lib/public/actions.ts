"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionUser } from "@/lib/auth/guards";
import type { SubmitState } from "@/lib/public/types";

/** Field names that make up a submission's `payload` JSON (per type). */
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
 * Public "Submit a Story" funnel. No account required: guests' details and
 * the full form payload land in `submissions` for the editorial queue. Uses
 * the service-role client so unauthenticated visitors can write.
 */
export async function submitStory(
    _prev: SubmitState,
    formData: FormData,
): Promise<SubmitState> {
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
        const { error } = await supabase.from("submissions").insert({
            submission_type: submissionType,
            guest_name: guestName,
            guest_email: guestEmail || null,
            guest_phone: guestPhone || null,
            payload,
            consent_confirmed: consentConfirmed,
            rights_confirmed: rightsConfirmed,
            status: "pending",
        });
        if (error) {
            console.error("[submitStory]", error.message);
            return { ok: false, error: "db" };
        }
        return { ok: true };
    } catch (err) {
        console.error("[submitStory]", err);
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
            console.error("[advertise] advertiser", advError.message);
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
            console.error("[advertise] campaign", campError.message);
            return { ok: false, error: "db" };
        }
        return { ok: true };
    } catch (err) {
        console.error("[advertise]", err);
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
            console.error("[contact]", error.message);
            return { ok: false, error: "db" };
        }
        return { ok: true };
    } catch (err) {
        console.error("[contact]", err);
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
            console.error("[takedown]", error.message);
            return { ok: false, error: "db" };
        }
        return { ok: true };
    } catch (err) {
        console.error("[takedown]", err);
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
            console.error("[data-request]", error.message);
            return { ok: false, error: "db" };
        }
        return { ok: true };
    } catch (err) {
        console.error("[data-request]", err);
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
            console.error("[policy-accept]", error.message);
            return { ok: false, error: "db" };
        }
        return { ok: true };
    } catch (err) {
        console.error("[policy-accept]", err);
        return { ok: false, error: "db" };
    }
}
