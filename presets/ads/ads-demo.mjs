/**
 * Pack: ads-demo — advertiser + slot + campaign demo data.
 *
 * Migrates the homepage ad slots and demo campaigns from
 * scripts/seed-demo.mjs into the preset system, and adds the advertiser
 * profile that owns them. This gives /admin/ads a populated queue to
 * demonstrate the inquiry → approval → live lifecycle, impression beacons,
 * and the status filters — without waiting for real revenue.
 *
 * Audience: staging (demo ads that no one will click on a live site).
 */

const AD_SLOTS = [
    { slot_key: "homepage-banner", name: "Homepage Banner", placement: "homepage", dimensions: "970x250", currency: "XAF" },
    { slot_key: "homepage-rail-top", name: "Homepage Rail (Top)", placement: "homepage", dimensions: "300x400", currency: "XAF" },
    { slot_key: "homepage-inline-mid", name: "Homepage Inline (Mid)", placement: "homepage", dimensions: "728x90", currency: "XAF" },
    { slot_key: "homepage-inline-bottom", name: "Homepage Inline (Bottom)", placement: "homepage", dimensions: "728x90", currency: "XAF" },
    { slot_key: "news-detail-rail", name: "News Detail Rail", placement: "news-rail", dimensions: "300x250", currency: "XAF" },
    { slot_key: "photo-story-rail", name: "Photo Story Rail", placement: "photo-story-rail", dimensions: "300x400", currency: "XAF" },
];

const ADVERTISERS = [
    {
        slug: "nkwen-building-supplies",
        business_slug: "nkwen-medical-centre",
        contact_name: "Grace M.",
        company_name: "Nkwen Building Supplies",
        email: "hello@nkwenbuilding.cm",
        phone: "+237 6 72 30 01 01",
    },
    {
        slug: "santa-central-market",
        business_slug: "santa-central-market",
        contact_name: "Samuel T.",
        company_name: "Santa Central Market",
        email: "info@santamarket.cm",
        phone: "+237 6 72 30 01 02",
    },
];

const CAMPAIGNS = [
    {
        advertiserSlug: "nkwen-building-supplies",
        slotKey: "homepage-banner",
        name: "Nkwen Building Supplies — Launch Campaign",
        status: "active",
        copy: "Cement, roofing and tools delivered across Bamenda. Call 6 70 00 00 00.",
        destination: "https://example.com/nkwen-building",
        price: 150000,
    },
    {
        advertiserSlug: "santa-central-market",
        slotKey: "homepage-rail-top",
        name: "Santa Central Market — Weekend Special",
        status: "active",
        copy: "Fresh produce, spices and fabric at wholesale prices. Santa Market, Bamenda — Saturdays from 6 AM.",
        destination: "https://example.com/santa-market",
        price: 80000,
    },
];

export default {
    id: "ads-demo",
    family: "ads",
    tier: 5,
    audience: "staging",
    title: "Advertising demo data",
    titleFr: "Données publicitaires de démonstration",
    what: "Advertiser profiles, ad slot definitions and two active demo campaigns so /admin/ads demonstrates the full inquiry→approval→live lifecycle with real revenue slots.",
    tables: ["advertisers", "ad_slots", "ad_campaigns"],
    deps: ["mp-demo-businesses"],
    async rows(ctx) {
        await ctx.load("ad_slots");
        await ctx.load("advertisers");
        await ctx.load("ad_campaigns");
        await ctx.load("locations");
        await ctx.load("categories");

        const locId = (slug) => ctx.id("locations", slug);
        const out = [];

        // --- ad slots ---
        for (const slot of AD_SLOTS) {
            out.push({
                table: "ad_slots", row: {
                    id: ctx.uuid(`adslot/${slot.slot_key}`),
                    slot_key: slot.slot_key,
                    name: slot.name,
                    placement: slot.placement,
                    dimensions: slot.dimensions,
                    description: `Demo slot: ${slot.placement} ${slot.dimensions}`,
                    currency: slot.currency,
                    is_active: true,
                },
                note: `ad slot ${slot.slot_key}`,
            });
        }

        // --- advertisers (linked to businesses) ---
        const advertiserIds = new Map();
        for (const adv of ADVERTISERS) {
            const id = ctx.uuid(`advertiser/${adv.slug}`);
            advertiserIds.set(adv.slug, id);
            out.push({
                table: "advertisers", row: {
                    id,
                    user_id: null,
                    business_id: ctx.uuid(`business/${adv.business_slug}`),
                    contact_name: adv.contact_name,
                    company_name: adv.company_name,
                    email: adv.email,
                    phone: adv.phone,
                    created_at: ctx.now.toISOString(),
                },
                note: `advertiser ${adv.slug}`,
            });
        }

        // --- campaigns ---
        const slotByKey = new Map();
        for (const slot of AD_SLOTS) {
            slotByKey.set(slot.slot_key, ctx.uuid(`adslot/${slot.slot_key}`));
        }
        for (const c of CAMPAIGNS) {
            out.push({
                table: "ad_campaigns", row: {
                    id: ctx.uuid(`adcamp/${c.advertiserSlug}/${c.slotKey}`),
                    advertiser_id: advertiserIds.get(c.advertiserSlug),
                    ad_slot_id: slotByKey.get(c.slotKey),
                    name: c.name,
                    status: c.status,
                    creative_media_id: null,
                    destination_url: c.destination,
                    copy_text: c.copy,
                    starts_at: ctx.iso(-1),
                    ends_at: ctx.iso(60),
                    agreed_price: c.price,
                    currency: "XAF",
                    payment_status: "paid",
                    created_at: ctx.now.toISOString(), updated_at: ctx.now.toISOString(),
                },
                note: `campaign ${c.name}`,
            });
        }

        return out;
    },
};
