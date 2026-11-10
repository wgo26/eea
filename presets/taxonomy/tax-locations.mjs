/**
 * Pack: tax-locations — the place hierarchy the whole platform filters on.
 *
 * seed-demo.mjs shipped 7 places. Every location-scoped surface (the homepage
 * place rail, /locations pages, the location filter, per-place personalized
 * briefs via digest_slots.location_id, user_place_preferences, and Then & Now
 * photo_pairs) is only as good as this table, so it is worth seeding properly:
 * continent → country → region → division → town → quarter, with parent chains
 * and coordinates.
 *
 * NEW (Phase 1+2): every place now carries a typed tier via location_type_id,
 * EN+FR names via location_translations, and optional alt_names / tags.
 * Rows are keyed by slug, so a re-run upserts the same place instead of creating
 * a second "bamenda" — and a place the legacy scripts/seed-demo.mjs made (with a
 * random uuid) is adopted through that slug rather than duplicated.
 */

/**
 * [slug, nameEn, nameFr, tierSlug, parentSlug, lat, lng, descEn, descFr, altNames]
 * North West first — the platform's home ground — then the rest of Cameroon.
 * @type {Array<[string, string, string, string, string|null, number, number, string, string, string[]]>}
 */
const PLACES = [
    // --- continent -----------------------------------------------------------
    ["africa", "Africa", "Afrique", "continent", null, 9.1, 18.0, "The continent Eagle Eye Africa serves.", "Le continent qu'Eagle Eye Africa dessert.", []],
    // --- country -------------------------------------------------------------
    ["cameroon", "Cameroon", "Cameroun", "country", "africa", 7.4, 12.4, "Central African country; Eagle Eye Africa's home ground.", "Pays d'Afrique centrale, terre d'Eagle Eye Africa.", ["Cameroun", "Kamerun"]],
    // --- regions -------------------------------------------------------------
    ["north-west", "North West", "Nord-Ouest", "region", "cameroon", 6.2, 10.3, "Anglophone highland region; Eagle Eye Africa's home ground.", "Région anglophone des hauts plateaux; terre d'Eagle Eye Africa.", ["North West Region"]],
    ["south-west", "South West", "Sud-Ouest", "region", "cameroon", 4.1, 9.1, "Anglophone coastal region around Limbe and Buea.", "Région anglophone côtière autour de Limbe et Buéa.", ["South West Region"]],
    ["littoral", "Littoral", "Littoral", "region", "cameroon", 4.05, 9.7, "Economic capital region, around Douala.", "Région économique, autour de Douala.", []],
    ["centre", "Centre", "Centre", "region", "cameroon", 3.9, 11.5, "Political capital region, around Yaounde.", "Région politique, autour de Yaoundé.", []],
    ["west", "West", "Ouest", "region", "cameroon", 5.3, 10.3, "Grassfields region around Bafoussam.", "Région des Grassfields autour de Bafoussam.", []],
    // --- divisions -----------------------------------------------------------
    ["mezam", "Mezam", "Mezam", "division", "north-west", 5.95, 10.15, "Division containing Bamenda, the regional capital.", "Division contenant Bamenda, chef-lieu.", []],
    ["ngoaketunjia", "Ngoa-Ketunjia", "Ngoa-Ketunjia", "division", "north-west", 6.15, 10.35, "Division north of Mezam; Ndop and Babadjou.", "Division au nord de Mezam; Ndop et Babadjou.", []],
    ["boyo", "Boyo", "Boyo", "division", "north-west", 6.4, 10.5, "Division around Fundong and Belo.", "Division autour de Fundong et Belo.", []],
    ["bui", "Bui", "Bui", "division", "north-west", 6.05, 10.6, "Division headed by Mbengwi.", "Division dirigée par Mbengwi.", []],
    ["donga-mantung", "Donga-Mantung", "Donga-Mantung", "division", "north-west", 6.7, 10.1, "Division headed by Wum, with Bali on the northern road.", "Division dirigée par Wum, avec Bali au nord.", []],
    ["menchum", "Menchum", "Menchum", "division", "north-west", 6.9, 9.9, "Division headed by Akwaya in the north-west corner.", "Division dirigée par Akwaya.", []],
    ["fako", "Fako", "Fako", "division", "south-west", 4.1, 9.35, "Coastal division: Limbe, Tiko, Mutengene.", "Division côtière: Limbe, Tiko, Mutengene.", []],
    ["mount-cameroun", "Mount Cameroun", "Mont Cameroun", "division", "south-west", 4.15, 9.25, "Division around Buea, at the volcano's foot.", "Division autour de Buéa, au pied du volcan.", []],
    ["meme", "Meme", "Mémé", "division", "south-west", 5.0, 9.5, "Division around Kumba and Mundemba.", "Division autour de Kumba.", []],
    ["wouri", "Wouri", "Wouri", "division", "littoral", 4.05, 9.7, "Division of Douala.", "Division de Douala.", []],
    ["mfoundi", "Mfoundi", "Mfoundi", "division", "centre", 3.87, 11.51, "Division of Yaounde.", "Division de Yaoundé.", []],
    // --- cities & towns ------------------------------------------------------
    ["bamenda", "Bamenda", "Bamenda", "city", "mezam", 5.954, 10.155, "Regional capital of the North West, a hill city of about a million.", "Capitale régionale du Nord-Ouest, ville de collines.", []],
    ["nkwen", "Nkwen", "Nkwen", "city", "mezam", 5.952, 10.171, "Fast-growing municipality east of Bamenda town.", "Commune en croissance rapide à l'est de Bamenda.", []],
    ["bafut", "Bafut", "Bafut", "town", "mezam", 5.96, 10.12, "Historic fondom on the western edge of Bamenda.", "Fondom historique à l'ouest de Bamenda.", []],
    ["bali", "Bali", "Bali", "town", "donga-mantung", 6.68, 10.2, "Fondom town on the northern road, known for its market.", "Ville du nord connue pour son marché.", []],
    ["santa", "Santa", "Santa", "town", "mezam", 6.09, 10.23, "Trade town on the Bamenda-Nkambe road.", "Ville commerçante sur la route Bamenda-Nkambe.", []],
    ["mbengwi", "Mbengwi", "Mbengwi", "town", "bui", 6.05, 10.58, "Divisional head of Bui.", "Chef-lieu du Bui.", []],
    ["fundong", "Fundong", "Fundong", "town", "boyo", 6.43, 10.52, "Divisional head of Boyo.", "Chef-lieu du Boyo.", []],
    ["wum", "Wum", "Wum", "town", "donga-mantung", 6.73, 10.23, "Divisional head of Donga-Mantung.", "Chef-lieu du Donga-Mantung.", []],
    ["bamessing", "Bamessing", "Bamessing", "town", "ngoaketunjia", 6.17, 10.32, "Fondom town of the Ngoa-Ketunjia plain.", "Ville du plateau Ngoa-Ketunjia.", []],
    ["ndop", "Ndop", "Ndop", "town", "ngoaketunjia", 6.15, 10.36, "Divisional head of Ngoa-Ketunjia.", "Chef-lieu du Ngoa-Ketunjia.", []],
    ["buea", "Buea", "Buéa", "city", "mount-cameroun", 4.156, 9.244, "Historic capital of the South West, on the mountainside.", "Capitale historique du Sud-Ouest.", ["Buéa"]],
    ["limbe", "Limbe", "Limbe", "city", "fako", 4.021, 9.212, "Coastal city of black sand beaches and the botanical garden.", "Ville côtière aux plages de sable noir.", []],
    ["mutengene", "Mutengene", "Mutengene", "town", "fako", 4.06, 9.31, "Commercial junction between Tiko and Limbe.", "Carrefour commercial entre Tiko et Limbe.", []],
    ["kumba", "Kumba", "Kumba", "city", "meme", 4.673, 9.443, "Trade city of the Meme division.", "Ville commerciale du Meme.", []],
    ["douala", "Douala", "Douala", "city", "wouri", 4.051, 9.7, "Economic capital and port city.", "Capitale économique et portuaire.", ["Duala"]],
    ["yaounde", "Yaounde", "Yaoundé", "city", "mfoundi", 3.848, 11.502, "Political capital, the city of seven hills.", "Capitale politique, ville des sept collines.", ["Youndé"]],
    ["bafoussam", "Bafoussam", "Bafoussam", "city", "west", 5.478, 10.416, "Capital of the West region, Grassfields market town.", "Capitale de la région de l'Ouest.", []],
    ["bamusso", "Bamusso", "Bamusso", "town", "fako", 3.83, 9.17, "Fishing village that hosts the annual Ngola festival.", "Village de pêche, siège du festival Ngola.", []];
];

/**
 * Quarters — the neighbourhood-level detail the location filter exists for.
 * [slug, nameEn, nameFr, parentSlug, lat, lng, descEn, descFr, altNames]
 * @type {Array<[string, string, string, string, number, number, string, string, string[]]>}
 */
const QUARTERS = [
    ["mankon", "Mankon", "Mankon", "bamenda", 5.943, 10.149, "Historic fondom quarter south-west of the city centre; the market and the university.", "Quartier historique au sud-ouest; marché et université.", []],
    ["fungoh", "Fu'ngoh", "Fu'ngoh", "bamenda", 5.947, 10.16, "Quarter of the regional hospital and the sub-stations.", "Quartier de l'hôpital régional.", []],
    ["banghou", "Banghou", "Banghou", "bamenda", 5.965, 10.132, "Hillside quarter on the road to Bafut.", "Quartier sur les hauteurs vers Bafut.", []],
    ["bambill", "Bambill", "Bambill", "bamenda", 5.936, 10.152, "Quarter of the night markets and the bypass.", "Quartier des marchés de nuit.", []],
    ["commercial-avenue", "Commercial Avenue", "Avenue Commerciale", "bamenda", 5.9527, 10.1565, "The city's main commercial street.", "Rue commerciale principale.", []],
    ["bamenda-town", "Bamenda Town", "Bamenda Town", "bamenda", 5.955, 10.152, "The old town centre around the central market.", "Centre ancien autour du marché central.", []],
    ["nku", "Nku", "Nku", "mankon", 5.94, 10.14, "Riverside area toward the Mankon fan.", "Zone riveraine vers Mankon.", []],
    ["esum", "Esum", "Esum", "nkwen", 5.951, 10.18, "Residential expansion east of Nkwen.", "Extension résidentielle à l'est.", []],
    ["mile-2", "Mile 2", "Mile 2", "nkwen", 5.953, 10.19, "Junction town on the Douala road.", "Carrefour sur la route de Douala.", []],
    ["great-mile", "Great Mile", "Great Mile", "buea", 4.13, 9.24, "Neighbourhood up the mountain road from Buea town.", "Quartier sur la route de montagne.", []],
    ["small-mile", "Small Mile", "Small Mile", "buea", 4.14, 9.24, "Residential area below the university.", "Zone résidentielle sous l'université.", []],
    ["molyko", "Molyko", "Molyko", "buea", 4.153, 9.238, "Neighbourhood of the university and the market.", "Quartier de l'université et du marché.", []],
    ["bonaberi", "Bonabéri", "Bonabéri", "douala", 4.05, 9.66, "Riverside quarter reached by the ferry.", "Quartier fluvial par le ferry.", ["Bonaberi"]],
    ["akwa", "Akwa", "Akwa", "douala", 4.05, 9.69, "Dense commercial quarter of Douala.", "Quartier commercial dense.", []],
    ["bonapriso", "Bonapriso", "Bonapriso", "douala", 4.06, 9.68, "Business and upscale residential district.", "Quartier d'affaires et résidentiel.", []],
    ["deido", "Deïdo", "Deïdo", "douala", 4.02, 9.74, "Vast residential township of Douala.", "Grand quartier résidentiel.", ["Deido"]],
    ["new-deido", "New Deido", "New Deido", "douala", 4.036, 9.678, "Neighbourhood on the river side of Deïdo.", "Quartier côté fleuve.", []],
    ["bastos", "Bastos", "Bastos", "yaounde", 3.89, 11.52, "Diplomatic quarter of Yaounde.", "Quartier diplomatique.", []],
    ["emombo", "Emombo", "Emombo", "yaounde", 3.86, 11.49, "Hillside residential quarter.", "Quartier résidentiel sur la colline.", []],
    ["odza", "Odza", "Odza", "yaounde", 3.88, 11.51, "Busy market quarter on the main avenue.", "Quartier animé du marché.", []],
    ["mvan", "Mvan", "Mvan", "yaounde", 3.95, 11.51, "Northern gateway suburb of Yaounde.", "Faubourg nord.", []];
];

/** Both levels, one shape: continent → country → region → division → town → quarter, parents first. */
const ALL_PLACES = [
    ...PLACES,
    ...QUARTERS.map(([slug, nameEn, nameFr, parent, lat, lng, en, fr, alts]) => [slug, nameEn, nameFr, "quarter", parent, lat, lng, en, fr, alts]),
];

// NOTE: `slug` is globally unique (20261009000002), so one place is one row.
// The French name/description now live in location_translations (EN + FR always
// travel together), and alt_names holds variant spellings (e.g. "Buéa", "Duala").

const LOCATION_TYPES = [
    // [slug, nameEn, nameFr, icon, color, sortOrder]
    ["continent", "Continent", "Continent", "Globe", "#0ea5e9", 0],
    ["country", "Country", "Pays", "Map", "#059669", 1],
    ["region", "Region", "Région", "MapPin", "#0891b2", 2],
    ["division", "Division", "Division", "Building2", "#0f766e", 3],
    ["city", "City", "Ville", "Building", "#0d9488", 4],
    ["town", "Town", "Ville", "Building", "#14b8a6", 5],
    ["quarter", "Quarter", "Quartier", "Home", "#0891b2", 6],
    ["landmark", "Landmark", "Lieu remarquable", "Landmark", "#2563eb", 7],
];

/** Place tags — independent of content tags; a place can carry several. */
const LOCATION_TAGS = [
    // [slug, nameEn, nameFr, color]
    ["market", "Market", "Marché", "#b45309"],
    ["historical", "Historical", "Historique", "#7c3aed"],
    ["fondom", "Fondom", "Fondom", "#1d4ed8"],
    ["flood-prone", "Flood-prone", "Sujet aux inondations", "#dc2626"],
    ["border-town", "Border town", "Ville frontalière", "#be185d"],
    ["university-town", "University town", "Ville universitaire", "#047857"],
    ["capital", "Capital", "Capitale", "#0f172a"],
];

/**
 * Which places get which tags, by slug.
 * @type {Record<string, string[]>}
 */
const PLACE_TAGS = {
    bamenda: ["capital", "fondom", "historical"],
    mankon: ["fondom", "market"],
    bafut: ["fondom", "historical"],
    bali: ["fondom", "market"],
    douala: ["capital", "university-town"],
    buea: ["capital", "historical", "border-town"],
    yaounde: ["capital", "university-town"],
    limbe: ["border-town"],
    kumba: ["market"],
    bafoussam: ["capital"],
};

export default {
    id: "tax-locations",
    family: "taxonomy",
    tier: 1,
    audience: "prod-safe",
    title: "Location hierarchy",
    titleFr: "Hiérarchie des lieux",
    what: "Continent, country, regions, divisions, cities and quarters with typed tiers, parent chains, coordinates, EN+FR names and optional tags — the backbone of every location filter, the map and per-place briefs.",
    tables: ["location_types", "locations", "location_translations", "location_tags", "location_taggings"],
    async rows(ctx) {
        // Load first: parent_id / location_type_id below are resolved through
        // ctx.id(), which returns the id the database ACTUALLY holds for a slug.
        await ctx.load("location_types");
        await ctx.load("locations");
        await ctx.load("location_tags");
        const out = [];

        // --- tier registry (written first, everything else FKs into it) -----
        for (const [slug, nameEn, nameFr, icon, color, sortOrder] of LOCATION_TYPES) {
            out.push({
                table: "location_types",
                row: { slug, name_en: nameEn, name_fr: nameFr, icon, color, sort_order: sortOrder },
                note: `tier ${slug}`,
            });
        }

        // Helper: resolve a tier slug to its location_type id.
        const typeId = (tierSlug) => ctx.id("location_types", tierSlug);

        // --- places: parents before children --------------------------------
        for (const [slug, nameEn, nameFr, tierSlug, parentSlug, lat, lng, descEn, descFr, altNames] of ALL_PLACES) {
            out.push({
                table: "locations",
                row: {
                    slug,
                    // `name`/`description` hold the English value for
                    // backward compatibility with existing reads that don't
                    // join location_translations.
                    name: nameEn,
                    description: descEn,
                    locale: "en",
                    location_type: tierSlug,
                    location_type_id: typeId(tierSlug),
                    parent_id: parentSlug ? ctx.id("locations", parentSlug) : null,
                    latitude: lat,
                    longitude: lng,
                    alt_names: altNames.length ? altNames : null,
                    is_active: true,
                },
                note: slug,
            });
        }

        // --- bilingual translations (EN + FR always travel together) --------
        for (const [slug, nameEn, nameFr] of ALL_PLACES.map(([s, e, f]) => [s, e, f])) {
            const id = ctx.id("locations", slug);
            out.push({ table: "location_translations", row: { location_id: id, locale: "en", name: nameEn, description: null }, note: `en ${slug}` });
            out.push({ table: "location_translations", row: { location_id: id, locale: "fr", name: nameFr, description: null }, note: `fr ${slug}` });
        }

        // --- location tags --------------------------------------------------
        for (const [slug, nameEn, nameFr, color] of LOCATION_TAGS) {
            out.push({ table: "location_tags", row: { slug, name_en: nameEn, name_fr: nameFr, color }, note: `tag ${slug}` });
        }

        // --- taggings -------------------------------------------------------
        for (const [placeSlug, tagSlugs] of Object.entries(PLACE_TAGS)) {
            for (const tagSlug of tagSlugs) {
                out.push({
                    table: "location_taggings",
                    row: { location_id: ctx.id("locations", placeSlug), tag_id: ctx.id("location_tags", tagSlug) },
                    note: `${placeSlug} tagged ${tagSlug}`,
                });
            }
        }

        return out;
    },
};
