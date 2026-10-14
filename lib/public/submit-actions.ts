"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import { getSessionUser } from "@/lib/auth/guards";
import type { SubmitState } from "@/lib/public/types";
import { enqueueStaffAlert, enqueueUser } from "@/lib/notify/queue";
import { sendGuestReceipt } from "@/lib/notify/guest-receipts";
import {
    NOTICE_DIRECTION_KEYS,
    PAYLOAD_FIELDS,
    RATE_LIMITS,
    SUBMISSION_TYPES,
    SUBMIT_CURRENCIES,
    guardPublicSubmission,
    isEmail,
    str,
    submissionFingerprint,
    submissionTitleKey,
    validateSubmissionContent,
} from "./abuse";

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
    let guestEmail = str(formData.get("email")) || profileEmail;
    const guestPhone = str(formData.get("phone")) || profilePhone;
    const consentConfirmed = formData.get("consent") === "on";
    const rightsConfirmed = formData.get("rights") === "on";

    if (!guestName) return { ok: false, error: "missing_name" };
    // A malformed email is worse than none: the guest expects a receipt and
    // editors lose their contact channel. Drop it, then require at least one
    // working contact — marketplace listings without a seller contact are
    // unreviewable (and scam-prone), so buy_sell is NOT exempt.
    if (guestEmail && !isEmail(guestEmail)) guestEmail = "";
    if (!guestEmail && !guestPhone) {
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
        // Defense in depth: a direct POST can still carry coords — drop them.
        // (PAYLOAD_FIELDS no longer includes them, so this only fires on
        // hand-crafted requests; the DB trigger allowlist is updated in
        // 20261203000000's companion note — coords rejected at intake.)
        if (payload[key]) {
            delete payload[key];
        }
    }
    // Back-compat: the legacy `location` key mirrors the raw text so older
    // readers/admin views keep working.
    if (!payload.location && payload.location_text) {
        payload.location = payload.location_text;
    }
    // Constrained selects are free-text on a direct POST — keep only
    // allowlisted values so junk enums never reach the queue. Optional fields
    // (price/currency/dates) fall back to "absent" instead of failing: the
    // editor decides them. Required ones are enforced by
    // validateSubmissionContent below.
    if (payload.currency && !(SUBMIT_CURRENCIES as readonly string[]).includes(payload.currency)) {
        delete payload.currency;
    }
    if (payload.noticeDirection && !(NOTICE_DIRECTION_KEYS as readonly string[]).includes(payload.noticeDirection)) {
        delete payload.noticeDirection;
    }
    if (payload.noticeType !== "lost_found") delete payload.noticeDirection;
    if (payload.price && !/^\d+(\.\d{1,2})?$/.test(payload.price)) {
        delete payload.price;
    }
    for (const key of ["date", "expiry"] as const) {
        if (payload[key] && Number.isNaN(Date.parse(payload[key]))) {
            delete payload[key];
        }
    }

    const contentError = validateSubmissionContent(submissionType, payload);
    if (contentError) return { ok: false, error: contentError };

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
        // Duplicate-submit guard (mirrors the advertise 7-day check): a
        // double-click, retry, or double-tab within minutes with the same
        // title must not pile identical rows into the moderation queue. One
        // indexed recent-pendings lookup for this identity, compared in JS
        // (payload JSON matching is not index-friendly in PostgREST).
        const fingerprint = submissionFingerprint(payload);
        const titleKey = submissionTitleKey(payload);
        if (titleKey) {
            try {
                const since = new Date(Date.now() - 10 * 60_000).toISOString();
                let dupQuery = supabase
                    .from("submissions")
                    .select("payload")
                    .eq("submission_type", submissionType)
                    .eq("status", "pending")
                    .gte("created_at", since)
                    .limit(10);
                if (submittedBy) dupQuery = dupQuery.eq("submitted_by", submittedBy);
                else if (guestEmail) dupQuery = dupQuery.eq("guest_email", guestEmail);
                else if (guestPhone) dupQuery = dupQuery.eq("guest_phone", guestPhone);
                const { data: recent } = await dupQuery;
                const isDuplicate = ((recent ?? []) as { payload: unknown }[]).some(
                    (r) =>
                        r.payload &&
                        typeof r.payload === "object" &&
                        submissionFingerprint(r.payload as Record<string, string>) === fingerprint,
                );
                if (isDuplicate) return { ok: false, error: "duplicate" };
            } catch {
                // Guard outage must never block a genuine submission.
            }
            // Trigram near-duplicate net (P3, migration
            // 20261202000000_submission_similarity): paraphrased respam that
            // defeats the exact fingerprint above. Same-identity only — two
            // different people reporting the same fire are two reports, not
            // spam. Fail-open: a lagging DB without the rpc skips the check.
            if (titleKey.length >= 12) {
                try {
                    // Typed as unknown: the rpc ships in migration
                    // 20261202000000, after the generated database.types.ts
                    // snapshot — `npm run types:db` on staging absorbs it.
                    const rpc = supabase.rpc as unknown as (
                        fn: string,
                        args: { p_type: string; p_title: string; p_days: number },
                    ) => Promise<{ data: { id: string; sim: number }[] | null }>;
                    const { data: sims } = await rpc("similar_recent_submissions", {
                        p_type: submissionType,
                        p_title: titleKey.slice(0, 120),
                        p_days: 7,
                    });
                    const near = ((sims ?? []) as { id: string; sim: number }[]).filter(
                        (r) => r.sim >= 0.8,
                    );
                    if (near.length > 0) {
                        const { data: owners } = await supabase
                            .from("submissions")
                            .select("id, submitted_by, guest_email, guest_phone")
                            .in(
                                "id",
                                near.map((r) => r.id),
                            )
                            .limit(5);
                        const mine = ((owners ?? []) as {
                            submitted_by: string | null;
                            guest_email: string | null;
                            guest_phone: string | null;
                        }[]).some(
                            (o) =>
                                (submittedBy && o.submitted_by === submittedBy) ||
                                (guestEmail && o.guest_email === guestEmail) ||
                                (guestPhone && o.guest_phone === guestPhone),
                        );
                        if (mine) return { ok: false, error: "duplicate" };
                    }
                } catch {
                    // Guard outage must never block a genuine submission.
                }
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
        // The submission supersedes any saved draft for this user+type — drop
        // it so the next visit opens a clean form instead of re-offering
        // already-submitted text via initialDraft. Best-effort: never fails
        // the submission.
        if (submittedBy) {
            try {
                await supabase
                    .from("submissions")
                    .delete()
                    .eq("submitted_by", submittedBy)
                    .eq("submission_type", submissionType)
                    .eq("status", "draft");
            } catch {
                /* draft cleanup is best-effort */
            }
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
