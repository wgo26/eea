/**
 * Pack: tax-locations — the place hierarchy the whole platform filters on.
 *
 * seed-demo.mjs shipped 7 places. Every location-scoped surface (the homepage
 * place rail, /locations pages, the location filter, per-place personalized
 * briefs via digest_slots.location_id, user_place_preferences, and Then & Now
 * photo_pairs) is only as good as this table, so it is worth seeding properly:
 * region → division → town → quarter, with parent chains and coordinates.
 *
 * Rows are keyed by slug, so a re-run upserts the same place instead of creating
 * a second "bamenda" — and a place the legacy scripts/seed-demo.mjs made (with a
 * random uuid) is adopted through that slug rather than duplicated.
 */

/**
 * [slug, name, type, parentSlug, lat, lng, descriptionEn, descriptionFr]
 * North West first — the platform's home ground — then the rest of Cameroon.
 * @type {Array<[string, string, string, string|null, number, number, string, string]>}
 */
const PLACES = [
    // --- regions -----------------------------------------------------------
    ["north-west", "North West", "region", null, 6.2, 10.3, "Anglophone highland region; Eagle Eye Africa's home ground.", "Région anglophone des hauts plateaux; terre d'Eagle Eye Africa."],
    ["south-west", "South West", "region", null, 4.1, 9.1, "Anglophone coastal region around Limbe and Buea.", "Région anglophone côtière autour de Limbe et Buéa."],
    ["littoral", "Littoral", "region", null, 4.05, 9.7, "Economic capital region, around Douala.", "Région économique, autour de Douala."],
    ["centre", "Centre", "region", null, 3.9, 11.5, "Political capital region, around Yaounde.", "Région politique, autour de Yaoundé."],
    ["west", "West", "region", null, 5.3, 10.3, "Grassfields region around Bafoussam.", "Région des Grassfields autour de Bafoussam."],
    // --- divisions ---------------------------------------------------------
    ["mezam", "Mezam", "division", "north-west", 5.95, 10.15, "Division containing Bamenda, the regional capital.", "Division contenant Bamenda, chef-lieu."],
    ["ngoaketunjia", "Ngoa-Ketunjia", "division", "north-west", 6.15, 10.35, "Division north of Mezam; Ndop and Babadjou.", "Division au nord de Mezam; Ndop et Babadjou."],
    ["boyo", "Boyo", "division", "north-west", 6.4, 10.5, "Division around Fundong and Belo.", "Division autour de Fundong et Belo."],
    ["bui", "Bui", "division", "north-west", 6.05, 10.6, "Division headed by Mbengwi.", "Division dirigée par Mbengwi."],
    ["donga-mantung", "Donga-Mantung", "division", "north-west", 6.7, 10.1, "Division headed by Wum, with Bali on the northern road.", "Division dirigée par Wum, avec Bali au nord."],
    ["menchum", "Menchum", "division", "north-west", 6.9, 9.9, "Division headed by Akwaya in the north-west corner.", "Division dirigée par Akwaya."],
    ["fako", "Fako", "division", "south-west", 4.1, 9.35, "Coastal division: Limbe, Tiko, Mutengene.", "Division côtière: Limbe, Tiko, Mutengene."],
    ["mount-cameroun", "Mount Cameroun", "division", "south-west", 4.15, 9.25, "Division around Buea, at the volcano's foot.", "Division autour de Buéa, au pied du volcan."],
    ["meme", "Meme", "division", "south-west", 5.0, 9.5, "Division around Kumba and Mundemba.", "Division autour de Kumba."],
    ["wouri", "Wouri", "division", "littoral", 4.05, 9.7, "Division of Douala.", "Division de Douala."],
    ["mfoundi", "Mfoundi", "division", "centre", 3.87, 11.51, "Division of Yaounde.", "Division de Yaoundé."],
    // --- cities & towns ----------------------------------------------------
    ["bamenda", "Bamenda", "city", "mezam", 5.954, 10.155, "Regional capital of the North West, a hill city of about a million.", "Capitale régionale du Nord-Ouest, ville de collines."],
    ["nkwen", "Nkwen", "city", "mezam", 5.952, 10.171, "Fast-growing municipality east of Bamenda town.", "Commune en croissance rapide à l'est de Bamenda."],
    ["bafut", "Bafut", "town", "mezam", 5.96, 10.12, "Historic fondom on the western edge of Bamenda.", "Fondom historique à l'ouest de Bamenda."],
    ["bali", "Bali", "town", "donga-mantung", 6.68, 10.2, "Fondom town on the northern road, known for its market.", "Ville du nord connue pour son marché."],
    ["santa", "Santa", "town", "mezam", 6.09, 10.23, "Trade town on the Bamenda-Nkambe road.", "Ville commerçante sur la route Bamenda-Nkambe."],
    ["mbengwi", "Mbengwi", "town", "bui", 6.05, 10.58, "Divisional head of Bui.", "Chef-lieu du Bui."],
    ["fundong", "Fundong", "town", "boyo", 6.43, 10.52, "Divisional head of Boyo.", "Chef-lieu du Boyo."],
    ["wum", "Wum", "town", "donga-mantung", 6.73, 10.23, "Divisional head of Donga-Mantung.", "Chef-lieu du Donga-Mantung."],
    ["bamessing", "Bamessing", "town", "ngoaketunjia", 6.17, 10.32, "Fondom town of the Ngoa-Ketunjia plain.", "Ville du plateau Ngoa-Ketunjia."],
    ["ndop", "Ndop", "town", "ngoaketunjia", 6.15, 10.36, "Divisional head of Ngoa-Ketunjia.", "Chef-lieu du Ngoa-Ketunjia."],
    ["buea", "Buea", "city", "mount-cameroun", 4.156, 9.244, "Historic capital of the South West, on the mountainside.", "Capitale historique du Sud-Ouest."],
    ["limbe", "Limbe", "city", "fako", 4.021, 9.212, "Coastal city of black sand beaches and the botanical garden.", "Ville côtière aux plages de sable noir."],
    ["mutengene", "Mutengene", "town", "fako", 4.06, 9.31, "Commercial junction between Tiko and Limbe.", "Carrefour commercial entre Tiko et Limbe."],
    ["kumba", "Kumba", "city", "meme", 4.673, 9.443, "Trade city of the Meme division.", "Ville commerciale du Meme."],
    ["douala", "Douala", "city", "wouri", 4.051, 9.7, "Economic capital and port city.", "Capitale économique et portuaire."],
    ["yaounde", "Yaounde", "city", "mfoundi", 3.848, 11.502, "Political capital, the city of seven hills.", "Capitale politique, ville des sept collines."],
    ["bafoussam", "Bafoussam", "city", "west", 5.478, 10.416, "Capital of the West region, Grassfields market town.", "Capitale de la région de l'Ouest."],
    ["bamusso", "Bamusso", "town", "fako", 3.83, 9.17, "Fishing village that hosts the annual Ngola festival.", "Village de pêche, siège du festival Ngola."],
];

/**
 * Quarters — the neighbourhood-level detail the location filter exists for.
 * [slug, name, parentSlug, lat, lng, descriptionEn, descriptionFr]
 * @type {Array<[string, string, string, number, number, string, string]>}
 */
const QUARTERS = [
    ["mankon", "Mankon", "bamenda", 5.943, 10.149, "Historic fondom quarter south-west of the city centre; the market and the university.", "Quartier historique au sud-ouest; marché et université."],
    ["fungoh", "Fu'ngoh", "bamenda", 5.947, 10.16, "Quarter of the regional hospital and the sub-stations.", "Quartier de l'hôpital régional."],
    ["banghou", "Banghou", "bamenda", 5.965, 10.132, "Hillside quarter on the road to Bafut.", "Quartier sur les hauteurs vers Bafut."],
    ["bambill", "Bambill", "bamenda", 5.936, 10.152, "Quarter of the night markets and the bypass.", "Quartier des marchés de nuit."],
    ["commercial-avenue", "Commercial Avenue", "bamenda", 5.9527, 10.1565, "The city's main commercial street.", "Rue commerciale principale."],
    ["bamenda-town", "Bamenda Town", "bamenda", 5.955, 10.152, "The old town centre around the central market.", "Centre ancien autour du marché central."],
    ["nku", "Nku", "mankon", 5.94, 10.14, "Riverside area toward the Mankon fan.", "Zone riveraine vers Mankon."],
    ["esum", "Esum", "nkwen", 5.951, 10.18, "Residential expansion east of Nkwen.", "Extension résidentielle à l'est."],
    ["mile-2", "Mile 2", "nkwen", 5.953, 10.19, "Junction town on the Douala road.", "Carrefour sur la route de Douala."],
    ["great-mile", "Great Mile", "buea", 4.13, 9.24, "Neighbourhood up the mountain road from Buea town.", "Quartier sur la route de montagne."],
    ["small-mile", "Small Mile", "buea", 4.14, 9.24, "Residential area below the university.", "Zone résidentielle sous l'université."],
    ["molyko", "Molyko", "buea", 4.153, 9.238, "Neighbourhood of the university and the market.", "Quartier de l'université et du marché."],
    ["bonaberi", "Bonabéri", "douala", 4.05, 9.66, "Riverside quarter reached by the ferry.", "Quartier fluvial par le ferry."],
    ["akwa", "Akwa", "douala", 4.05, 9.69, "Dense commercial quarter of Douala.", "Quartier commercial dense."],
    ["bonapriso", "Bonapriso", "douala", 4.06, 9.68, "Business and upscale residential district.", "Quartier d'affaires et résidentiel."],
    ["deido", "Deïdo", "douala", 4.02, 9.74, "Vast residential township of Douala.", "Grand quartier résidentiel."],
    ["new-deido", "New Deido", "douala", 4.036, 9.678, "Neighbourhood on the river side of Deïdo.", "Quartier côté fleuve."],
    ["bastos", "Bastos", "yaounde", 3.89, 11.52, "Diplomatic quarter of Yaounde.", "Quartier diplomatique."],
    ["emombo", "Emombo", "yaounde", 3.86, 11.49, "Hillside residential quarter.", "Quartier résidentiel sur la colline."],
    ["odza", "Odza", "yaounde", 3.88, 11.51, "Busy market quarter on the main avenue.", "Quartier animé du marché."],
    ["mvan", "Mvan", "yaounde", 3.95, 11.51, "Northern gateway suburb of Yaounde.", "Faubourg nord."],
];

/** Both levels, one shape: region → division → town → quarter, parents first. */
const ALL_PLACES = [
    ...PLACES,
    ...QUARTERS.map(([slug, name, parent, lat, lng, en, fr]) => [slug, name, "quarter", parent, lat, lng, en, fr]),
];

// NOTE: locations has no *_translations table (unlike categories and tags), and
// `slug` is globally unique — so one place is one row, and only the English
// description lands. The French strings above are held deliberately for the day
// locations gain a translations table; see docs/seeding.md "known limitations".

export default {
    id: "tax-locations",
    family: "taxonomy",
    tier: 1,
    audience: "prod-safe",
    title: "Location hierarchy",
    titleFr: "Hiérarchie des lieux",
    what: "Regions, divisions, cities and quarters with parent chains and coordinates — the backbone of every location filter, the map and per-place briefs.",
    tables: ["locations"],
    async rows(ctx) {
        // Load first: parent_id below is resolved through ctx.id(), which returns
        // the id the database ACTUALLY holds for a slug. A pack that derived the
        // parent's uuid itself would break the FK against a place the legacy
        // scripts/seed-demo.mjs created (random uuid) — the adoption case.
        await ctx.load("locations");
        const out = [];
        // Parents before children: the array order is region → division → town →
        // quarter, and the runner writes a table's rows in the order given.
        for (const [slug, name, type, parentSlug, lat, lng, description] of ALL_PLACES) {
            out.push({
                table: "locations",
                row: {
                    // No `id`: the runner settles it — the existing row's own id
                    // when there is one, a deterministic new id otherwise.
                    slug,
                    name,
                    // `slug` is globally unique (20261009000002), so a place is one
                    // row rather than one per locale; `locale` records the language
                    // the name and description are held in.
                    locale: "en",
                    location_type: type,
                    parent_id: parentSlug ? ctx.id("locations", parentSlug) : null,
                    latitude: lat,
                    longitude: lng,
                    description,
                    is_active: true,
                },
                note: slug,
            });
        }
        return out;
    },
};

