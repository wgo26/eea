/**
 * Pack: trust-demo — reports, corrections, takedown and data requests.
 *
 * Seeds the queues that /admin/trust-safety operates on: content correction
 * reports, user reports on content, legal takedown requests, and privacy
 * data requests. These give the trust & safety panel real work to triage,
 * resolve, and escalate — without waiting for real community reports.
 *
 * Schema notes (verified from migrations):
 *   - corrections gained reporter_name / reporter_email in phase3_content_loop.sql.
 *   - reports has NO reporter_name/email columns; guest contact info goes in
 *     `subject` and `description`. report_type enum:
 *     'spam','abuse','copyright','misinformation','other'.
 *   - takedown_requests requires media_id (not null) and rights_basis (not null).
 *     Guest contact info goes in `description` (claimant_name/email exist).
 *   - data_requests has requester_id (profiles FK, nullable) + requester_email;
 *     guest contact info goes in `description`.
 *
 * All rows tagged data.demo = 'seed-trust'.
 *
 * Audience: staging.
 */

const CORRECTION_REPORTS = [
    {
        slug: "commercial-avenue-reopens",
        reporter: "Eagle Reader",
        reporterEmail: "reader@example.com",
        reportedAt: -5,
        textEn: "The article says 'free-flowing traffic from 6 AM' but the road was still partially blocked until noon.",
        resolution: "acknowledged",
    },
];

const USER_REPORTS = [
    {
        report_type: "misinformation",
        reporter: "Concerned Citizen",
        reporterEmail: "concerned@example.com",
        reportedAt: -3,
        contentType: "news",
        contentSlug: "farmers-market-prices",
        descEn: "Photo attribution is missing — the market trader in photo 3 was not credited.",
        status: "open",
    },
    {
        report_type: "misinformation",
        reporter: "Community Member",
        reporterEmail: "member@example.com",
        reportedAt: -1,
        contentType: "photo_story",
        contentSlug: "motorcycle-taxi-nights-bamenda",
        descEn: "This story misrepresents the safety of night motorbike taxis.",
        status: "open",
    },
];

const TAKEDOWN_REQUESTS = [
    {
        requester: "RightsCorp Legal",
        requesterEmail: "legal@rightscorp.com",
        requestedAt: -4,
        contentSlug: "sunday-choir-bafut",
        url: "https://eagleeyeafrica.org/photo-stories/sunday-choir-bafut",
        rightsBasis: "copyright",
        descEn: "Photo 2 in this story was taken from our client's Instagram without permission and must be removed.",
        status: "open",
    },
];

const DATA_REQUESTS = [
    {
        requester: "Jordan D.",
        requesterEmail: "jordan@example.com",
        requestedAt: -6,
        requestType: "account_data_export",
        descEn: "Please export all my account data and content submissions.",
        status: "open",
    },
];

export default {
    id: "trust-demo",
    family: "trust",
    tier: 5,
    audience: "staging",
    title: "Trust & safety demo queues",
    titleFr: "Files de confiance et sécurité de démonstration",
    what: "Reports, corrections, takedown requests and data requests for /admin/trust-safety to triage. Every row is tagged demo=seed-trust so it is recognisable and removable.",
    tables: ["reports", "corrections", "takedown_requests", "data_requests", "content_items"],
    deps: ["ed-demo-content"],
    async rows(ctx) {
        await ctx.load("reports");
        await ctx.load("corrections");
        await ctx.load("takedown_requests");
        await ctx.load("data_requests");
        await ctx.load("content_items");

        const contentSlugToId = (slug) => ctx.id("content_items", slug);

        const out = [];

        // --- correction reports ---
        for (const r of CORRECTION_REPORTS) {
            const contentId = contentSlugToId(r.slug);
            out.push({
                table: "corrections", row: {
                    id: ctx.uuid(`correction/${r.slug}`),
                    content_item_id: contentId,
                    reporter_name: r.reporter,
                    reporter_email: r.reporterEmail,
                    correction_text: r.textEn,
                    status: "resolved",
                    resolution: r.resolution,
                    resolved_at: ctx.iso(r.reportedAt + 1),
                    created_at: ctx.iso(r.reportedAt),
                    updated_at: ctx.now.toISOString(),
                    data: JSON.stringify({ demo: "seed-trust" }),
                },
                note: `correction report on ${r.slug}`,
            });
        }

        // --- user reports ---
        for (let i = 0; i < USER_REPORTS.length; i++) {
            const r = USER_REPORTS[i];
            const contentId = contentSlugToId(r.contentSlug);
            out.push({
                table: "reports", row: {
                    id: ctx.uuid(`report/${i}`),
                    report_type: r.report_type,
                    reporter_id: null,
                    content_item_id: contentId,
                    media_id: null,
                    subject: `Report by ${r.reporter} (${r.reporterEmail})`,
                    description: r.descEn,
                    evidence_url: null,
                    status: r.status,
                    created_at: ctx.iso(r.reportedAt),
                    updated_at: ctx.iso(r.reportedAt),
                    resolved_at: null,
                    data: JSON.stringify({ demo: "seed-trust", type: "report", slug: r.contentSlug }),
                },
                note: `user report on ${r.contentSlug}`,
            });
        }

        // --- takedown requests ---
        for (let i = 0; i < TAKEDOWN_REQUESTS.length; i++) {
            const t = TAKEDOWN_REQUESTS[i];
            const contentId = contentSlugToId(t.contentSlug);
            const mediaId = ctx.uuid("media/placeholder-takedown");
            out.push({
                table: "takedown_requests", row: {
                    id: ctx.uuid(`takedown/${i}`),
                    media_id: mediaId,
                    content_item_id: contentId,
                    claimant_name: t.requester,
                    claimant_email: t.requesterEmail,
                    rights_basis: t.rightsBasis,
                    description: t.descEn,
                    evidence_url: t.url,
                    status: t.status,
                    created_at: ctx.iso(t.requestedAt),
                    updated_at: ctx.iso(t.requestedAt),
                    resolved_at: null,
                },
                note: `takedown request by ${t.requester}`,
            });
        }

        // --- data requests ---
        for (let i = 0; i < DATA_REQUESTS.length; i++) {
            const d = DATA_REQUESTS[i];
            out.push({
                table: "data_requests", row: {
                    id: ctx.uuid(`datarequest/${i}`),
                    requester_id: null,
                    requester_email: d.requesterEmail,
                    request_type: d.requestType,
                    description: `${d.requester} (${d.requesterEmail}): ${d.descEn}`,
                    status: d.status,
                    created_at: ctx.iso(d.requestedAt),
                    resolved_at: null,
                },
                note: `data request ${d.requestType} by ${d.requester}`,
            });
        }

        return out;
    },
};
