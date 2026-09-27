/**
 * Pack: tax-tags — the tag dimension.
 *
 * Categories are a single-choice classification; tags are the many-to-many layer
 * that `content_tags` joins and that recap templates narrow on
 * (`content_templates.source_filters.tag_slug`), so a template like "Music this
 * week" only works once tagged content exists.
 *
 * `tags` holds only a slug; every human label is in tag_translations (unique on
 * (tag_id, locale)), so EN and FR always travel together.
 */

/** [slug, nameEn, nameFr] */
const TAGS = [
    // places & mobility
    ["road-safety", "Road Safety", "Sécurité routière"],
    ["traffic", "Traffic", "Circulation"],
    ["water", "Water", "Eau"],
    ["power", "Power", "Électricité"],
    ["market-prices", "Market Prices", "Prix du marché"],
    // civic
    ["council", "City Council", "Conseil municipal"],
    ["elections", "Elections", "Élections"],
    ["accountability", "Accountability", "Reddition de comptes"],
    ["youth", "Youth", "Jeunesse"],
    ["women", "Women", "Femmes"],
    // culture & life
    ["music", "Music", "Musique"],
    ["food", "Food", "Cuisine"],
    ["festival", "Festival", "Festival"],
    ["traditional", "Traditional", "Traditionnel"],
    ["photography", "Photography", "Photographie"],
    ["heritage", "Heritage", "Patrimoine"],
    // schooling & health
    ["schools", "Schools", "Écoles"],
    ["exams", "Exams", "Examens"],
    ["scholarship", "Scholarship", "Bourse"],
    ["health", "Health", "Santé"],
    ["malaria", "Malaria", "Paludisme"],
    ["cholera", "Cholera", "Choléra"],
    // economy
    ["small-business", "Small Business", "Petit commerce"],
    ["farming", "Farming", "Agriculture"],
    ["employment", "Employment", "Emploi"],
    ["mobile-money", "Mobile Money", "Paiement mobile"],
    // participation formats
    ["eye-on-the-street", "Eye on the Street", "Regard de la rue"],
    ["then-and-now", "Then & Now", "Hier & aujourd'hui"],
    ["verified", "Verified", "Vérifié"],
    ["developing-story", "Developing Story", "Histoire en cours"],
    ["diaspora", "Diaspora", "Diaspora"],
    ["community-fundraiser", "Community Fundraiser", "Collecte communautaire"],
];

export default {
    id: "tax-tags",
    family: "taxonomy",
    tier: 1,
    audience: "prod-safe",
    title: "Topic tags",
    titleFr: "Étiquettes thématiques",
    what: "The many-to-many tag vocabulary, EN + FR — the filter input recap templates narrow on and the label layer content_tags joins.",
    tables: ["tags", "tag_translations"],
    async rows(ctx) {
        await ctx.load("tags");
        const out = [];
        for (const [slug, nameEn] of TAGS) {
            out.push({ table: "tags", row: { slug }, note: nameEn });
        }
        for (const [slug, nameEn, nameFr] of TAGS) {
            // ctx.id, never a hand-derived uuid: a tag that already exists holds a
            // different id, and a wrong FK here would fail the insert.
            const id = ctx.id("tags", slug);
            out.push({ table: "tag_translations", row: { tag_id: id, locale: "en", name: nameEn } });
            out.push({ table: "tag_translations", row: { tag_id: id, locale: "fr", name: nameFr } });
        }
        return out;
    },
};

