"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/observability/logger";
import type { SubmitState } from "@/lib/public/types";
import { enqueueStaffAlert } from "@/lib/notify/queue";
import { sendGuestReceipt } from "@/lib/notify/guest-receipts";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { isCurrentRequestIpBlocked } from "@/lib/security/ip-blocklist";
import { RATE_LIMITS, guardPublicSubmission, isEmail, str } from "./abuse";

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

    // IP block first: contact reveal is the PII gate, blocked scrapers must
    // not consume rate-limit slots.
    if (await isCurrentRequestIpBlocked()) {
        return { ok: false, error: "rate_limited" };
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
            .select("id, slug, status, is_archived, expires_at, listings(listing_status)")
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
        } | null;
        if (!listing || listing.listing_status !== "active") {
            return { ok: false, error: "not_found" };
        }

        // PII lives in `seller_contacts` (Phase A migration); legacy
        // `listings` columns are the fallback until Phase B drops them.
        let phone: string | null = null;
        let email: string | null = null;
        let whatsapp: string | null = null;
        try {
            const { data: sc } = await supabase
                .from("seller_contacts")
                .select("contact_phone, contact_email, whatsapp_number")
                .eq("content_item_id", row.id)
                .limit(1);
            const c = ((sc ?? []) as {
                contact_phone?: string | null;
                contact_email?: string | null;
                whatsapp_number?: string | null;
            }[])[0];
            if (c) {
                phone = c.contact_phone?.trim() || null;
                email = String(c.contact_email ?? "").trim() || null;
                whatsapp = c.whatsapp_number?.trim() || null;
            }
        } catch {
            phone = null;
            email = null;
            whatsapp = null;
        }
        if (!phone && !email && !whatsapp) {
            try {
                const { data: leg } = await supabase
                    .from("listings")
                    .select("contact_phone, contact_email, whatsapp_number")
                    .eq("content_item_id", row.id)
                    .limit(1);
                const l = ((leg ?? []) as {
                    contact_phone?: string | null;
                    contact_email?: string | null;
                    whatsapp_number?: string | null;
                }[])[0];
                phone = l?.contact_phone?.trim() || null;
                email = String(l?.contact_email ?? "").trim() || null;
                whatsapp = l?.whatsapp_number?.trim() || null;
            } catch {
                /* fail-closed below: no contact, no reveal */
            }
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
                phone,
                email,
                whatsapp,
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

    // IP block first: same PII-gate reasoning as seller-contact reveal.
    if (await isCurrentRequestIpBlocked()) {
        return { ok: false, error: "rate_limited" };
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
