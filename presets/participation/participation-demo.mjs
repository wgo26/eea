/**
 * Pack: participation-demo — demo submissions + moderation queue.
 *
 * Seeds demo pending submissions so /admin/moderation has rows to review,
 * reject, and approve — exercising the full submit→moderate→publish flow
 * without waiting for real community intake. Each submission is tagged
 * data.demo = "seed-participation" for recognisability.
 *
 * Audience: staging.
 */

const SUBMISSIONS = [
    {
        slug: "demo-sub-new-bridge",
        type: "news",
        days: -2,
        loc: "bafut",
        cat: "infrastructure",
        verification: "community_submission",
        guestName: "Grace N.",
        guestEmail: "grace@example.com",
        guestPhone: "+237 6 72 40 02 01",
        enTitle: "New Bridge Being Built in Bafut — Community Hails Move",
        enExcerpt: "Construction began Monday on the bridge that has been missing since the 2022 floods.",
        enBody: "The new concrete bridge will replace the wooden crossing that was swept away two years ago. Local leaders say it will connect 200 households to the main road.",
        enShare: "Bafut's new bridge — construction starts to replace the one lost in the 2022 floods.",
        enSeo: "New bridge construction begins in Bafut, replacing 2022 flood-damaged crossing",
    },
    {
        slug: "demo-sub-water-outage",
        type: "notice",
        days: -1,
        loc: "mankon",
        cat: "community-alert",
        verification: "community_submission",
        guestName: "Samuel T.",
        guestEmail: "samuel@example.com",
        guestPhone: "+237 6 72 40 02 02",
        enTitle: "Water Outage — Mankon Lower Market Area, Tuesday 8 AM–4 PM",
        enExcerpt: "Maintenance on the main line will interrupt supply for eight hours.",
        enBody: "The Nkwen Water Authority will shut the line at 8 AM Tuesday for pipe replacement. Supply should return by 4 PM.",
        enShare: "Water outage in Mankon lower market Tuesday 8AM–4PM for pipe maintenance.",
        enSeo: "Mankon water outage announced for Tuesday 8AM to 4PM — pipe replacement",
    },
    {
        slug: "demo-sub-bike-for-sale",
        type: "listing",
        days: -3,
        loc: "bamenda",
        cat: "vehicles",
        verification: "community_submission",
        guestName: "Mireille K.",
        guestEmail: "mireille@example.com",
        guestPhone: "+237 6 72 40 02 03",
        enTitle: "Honda Motorcycle 2019 — For Sale",
        enExcerpt: "Clean condition, 22,000 km, recent service. 750,000 FCFA.",
        enBody: "Honda CG125, 2019 model, 22,000 km on the clock. Recently serviced, new chain, no accidents. Includes one helmet. Located in Nkwen.",
        enShare: "Honda CG125 2019 for sale — 22K km, 750K FCFA, clean condition.",
        enSeo: "Honda CG125 2019 motorcycle for sale in Bamenda — 750,000 FCFA",
    },
];

export default {
    id: "participation-demo",
    family: "participation",
    tier: 0,
    audience: "staging",
    title: "Demo submissions & moderation",
    titleFr: "Soumissions et modération de démonstration",
    what: "Demo pending submissions across news, notice and listing types so /admin/moderation demonstrates the review→approve/reject flow. All tagged demo=seed-participation.",
    tables: ["submissions", "content_items", "content_translations", "media_assets", "notices", "listings"],
    deps: ["tax-locations", "tax-categories"],
    async rows(ctx) {
        await ctx.load("submissions");
        await ctx.load("content_items");
        await ctx.load("locations");
        await ctx.load("categories");

        const locId = (slug) => ctx.id("locations", slug);
        const catId = (type, slug) => ctx.id("categories", type, slug);
        const out = [];
        const now = ctx.now.toISOString();

        for (const s of SUBMISSIONS) {
            const subId = ctx.uuid(`submission/${s.slug}`);
            const contentId = ctx.uuid(`submission-content/${s.slug}`);

            out.push({
                table: "submissions", row: {
                    id: subId,
                    submission_type: s.type,
                    submitted_by: null,
                    guest_name: s.guestName,
                    guest_email: s.guestEmail,
                    guest_phone: s.guestPhone,
                    content_item_id: contentId,
                    status: "pending",
                    received_at: ctx.iso(s.days),
                    data: JSON.stringify({ demo: "seed-participation", slug: s.slug }),
                },
                note: `demo submission ${s.slug}`,
            });

            // The submission creates a draft content item the moderator will publish.
            out.push({
                table: "content_items", row: {
                    id: contentId,
                    type: s.type,
                    slug: s.slug,
                    status: "draft",
                    verification: s.verification,
                    location_id: locId(s.loc),
                    category_id: catId(s.type, s.cat),
                    submitted_by: null, author_id: null,
                    is_featured: false, is_archived: false,
                    published_at: null, scheduled_for: null, expires_at: null,
                    created_at: ctx.iso(s.days), updated_at: now,
                },
                note: `draft content for ${s.slug}`,
            });

            out.push({
                table: "content_translations", row: {
                    id: ctx.uuid(`submission/${s.slug}/en`),
                    content_item_id: contentId, locale: "en", voice: "formal",
                    title: s.enTitle, excerpt: s.enExcerpt, body: s.enBody,
                    social_share_text: s.enShare, whatsapp_share_text: s.enShare,
                    seo_title: s.enTitle, seo_description: s.enSeo,
                },
            });
            out.push({
                table: "content_translations", row: {
                    id: ctx.uuid(`submission/${s.slug}/fr`),
                    content_item_id: contentId, locale: "fr", voice: "formal",
                    title: s.enTitle, excerpt: s.enExcerpt, body: s.enBody,
                    social_share_text: s.enShare, whatsapp_share_text: s.enShare,
                    seo_title: s.enTitle, seo_description: s.enSeo,
                },
                note: "FR placeholder (moderator fills)",
            });
        }

        return out;
    },
};
