/**
 * Pack: mp-demo-businesses — demo directory businesses.
 *
 * The buy-sell section and advertiser surface need real-looking businesses
 * (not just classified listings) so the /locations directory, business cards
 * and the advertiser→business relationship are exercised.
 *
 * Audience: staging. These are demo businesses; the listing items themselves
 * live in the editorial pack (ed-demo-content). This pack just adds the
 * business profiles that listings and ads reference.
 */

const BUSINESSES = [
    { slug: "nkwen-medical-centre", name: "Nkwen Health Centre", type: "health", loc: "nkwen", verified: true, phone: "+237 6 72 20 01 00", featured: true },
    { slug: "santa-central-market", name: "Santa Central Market", type: "market", loc: "santa", verified: true, phone: "+237 6 72 20 01 01", featured: true },
    { slug: "bamenda-tailor-shop", name: "Ngassa Tailors", type: "business", loc: "bamenda", verified: false, phone: "+237 6 72 20 01 02", featured: false },
    { slug: "bafut-art-studios", name: "Bafut Art Studios", type: "media", loc: "bafut", verified: true, phone: "+237 6 72 20 01 03", featured: true },
    { slug: "douala-tech-repair", name: "TechFix Douala", type: "services", loc: "douala", verified: false, phone: "+237 6 72 20 01 04", featured: false },
    { slug: "yaounde-books", name: "Librairie Centrale", type: "education", loc: "yaounde", verified: true, phone: "+237 6 72 20 01 05", featured: true },
];

export default {
    id: "mp-demo-businesses",
    family: "marketplace",
    tier: 0,
    audience: "staging",
    title: "Demo businesses",
    titleFr: "Entreprises de démonstration",
    what: "Directory business profiles so the marketplace directory and advertiser→business relationship have real entities. Listings themselves live in the editorial pack.",
    tables: ["businesses", "business_categories"],
    deps: ["tax-locations", "tax-categories", "people-demo"],
    async rows(ctx) {
        await ctx.load("businesses");
        await ctx.load("business_categories");
        await ctx.load("locations");
        await ctx.load("categories");

        const locId = (slug) => ctx.id("locations", slug);
        const catId = (type, slug) => ctx.id("categories", type, slug);
        const profileId = (slug) => ctx.uuid(`profile/${slug}`);

        const out = [];
        for (const b of BUSINESSES) {
            const id = ctx.uuid(`business/${b.slug}`);
            out.push({
                table: "businesses", row: {
                    id,
                    owner_id: b.featured ? profileId(b.slug === "nkwen-medical-centre" ? "sarah-n" : "eyong-b") : null,
                    location_id: locId(b.loc),
                    name: b.name, slug: b.slug,
                    description: `Demo business profile for ${b.name}.`,
                    phone: b.phone, email: null, whatsapp: b.phone,
                    website_url: null, instagram_url: null, facebook_url: null,
                    opening_hours: null, is_verified: b.verified, is_featured: b.featured,
                    status: "active",
                },
                note: `business ${b.slug}`,
            });

            // Link each business to "Services" in the listing category as a default.
            out.push({
                table: "business_categories", row: {
                    business_id: id,
                    category_id: catId("listing", "services"),
                },
                note: `default category link for ${b.slug}`,
            });
        }
        return out;
    },
};
