/**
 * Pack: tax-categories — the full category taxonomy, per content type, EN + FR.
 *
 * seed-demo.mjs covered 4–5 categories per type. Every category is a filter chip
 * on a section index, a choice in the content form, a follow target
 * (content_follows.category_id) and a digest/recap template filter input, so a
 * thin taxonomy is felt on every page.
 *
 * TWO THINGS THIS PACK MUST NOT BREAK
 *
 *  1. Slug compatibility. The legacy slugs used by scripts/seed-demo.mjs are
 *     reproduced verbatim, because they are hardcoded in three lockstep places
 *     (lib/admin/demo-data.ts, scripts/teardown-demo.mjs, scripts/verify-clean.mjs).
 *     Renaming one would silently make "does this DB still hold demo data?" wrong.
 *     Lines marked `// legacy:` are exactly those rows.
 *  2. Categories have no name column — labels live only in category_translations
 *     (unique on (category_id, locale)), so a category without an EN row is an
 *     invisible category. Both locales are always written together.
 *
 * Ids come from ctx.id(), so a category the old seeder already created (random
 * uuid) is adopted by its (content_type, slug) key rather than duplicated.
 */

/**
 * [content_type, slug, nameEn, nameFr, descriptionEn]
 * @type {Array<[string, string, string, string, string]>}
 */
const CATEGORIES = [
    // --- photo_story: the platform's strongest product, so the richest set ----
    ["photo_story", "photo_story-culture", "Culture", "Culture", "Ceremony, festivals and the visual life of the community."], // legacy:
    ["photo_story", "photo_story-community", "Community", "Communauté", "People together: meetings, work, worship, celebration."], // legacy:
    ["photo_story", "photo_story-infrastructure", "Infrastructure", "Infrastructure", "Roads, water, power, bridges and public works."], // legacy:
    ["photo_story", "photo_story-people", "People", "Gens", "Portraits and the faces behind the stories."], // legacy:
    ["photo_story", "photo_story-everyday-africa", "Everyday Africa", "Afrique de tous les jours", "Ordinary streets, ordinary hours, told with care."], // legacy:
    ["photo_story", "photo_story-environment", "Environment", "Environnement", "Farming, forest, water and the weather that changes them."],
    ["photo_story", "photo_story-education", "Education", "Éducation", "Schools, classrooms, exams and school life."],
    ["photo_story", "photo_story-business", "Business", "Économie", "Markets, trade, workshops and money changing hands."],
    ["photo_story", "photo_story-events", "Events", "Événements", "Public gatherings, launches and ceremonies."],
    ["photo_story", "photo_story-public-life", "Public Life", "Vie publique", "Councils, courts, officials and civic process."],
    ["photo_story", "photo_story-sport", "Sport", "Sport", "Football, athletics and the crowds that follow them."],
    ["photo_story", "photo_story-health", "Health", "Santé", "Clinics, campaigns and care in the community."],
    // --- news ---------------------------------------------------------------
    ["news", "news-community", "Community", "Communauté", "Stories people submitted about their own streets."], // legacy:
    ["news", "news-infrastructure", "Infrastructure", "Infrastructure", "Roads, water and power, and what happens to them."], // legacy:
    ["news", "news-education", "Education", "Éducation", "Schools, teachers, examinations and policy."], // legacy:
    ["news", "news-business", "Business", "Économie", "Trade, prices, markets and livelihoods."], // legacy:
    ["news", "news-security", "Security", "Sécurité", "Crime, policing and personal safety — reported, never sensationalised."],
    ["news", "news-health", "Health", "Santé", "Clinics, disease alerts and public health."],
    ["news", "news-politics", "Politics", "Politique", "Elections, governance and civic accountability."],
    ["news", "news-agriculture", "Agriculture", "Agriculture", "Farming, harvests, cooperatives and prices at the farm gate."],
    ["news", "news-technology", "Technology", "Technologie", "Connectivity, mobile money and digital life."],
    ["news", "news-sport", "Sport", "Sport", "Clubs, tournaments and local talent."],
    ["news", "news-exams", "Exams & Results", "Examens et résultats", "Seasonal exam news, results and corrections."],
    ["news", "news-diaspora", "Diaspora", "Diaspora", "What the hometown looks like from far away."],
    // --- notice: the community board ----------------------------------------
    ["notice", "notice-public-notice", "Public Notice", "Avis public", "General notices the public needs to know."], // legacy:
    ["notice", "notice-road-closure", "Road Closure", "Fermeture de route", "Closures, detours and road works."], // legacy:
    ["notice", "notice-community-alert", "Community Alert", "Alerte communautaire", "Urgent community safety and health alerts."], // legacy:
    ["notice", "notice-lost-found", "Lost & Found", "Objets trouvés", "Documents, keys, phones and pets."], // legacy:
    ["notice", "notice-missing-person", "Missing Person", "Personne disparue", "Appeals to find someone, and their outcomes."],
    ["notice", "notice-service-announcement", "Service Announcement", "Annonce de service", "Water, power, banking and transport schedules."],
    ["notice", "notice-government", "Government Notice", "Avis gouvernemental", "Official notices from councils and ministries."],
    ["notice", "notice-school", "School Notice", "Avis scolaire", "Term dates, fees, admissions and closures."],
    ["notice", "notice-organisation", "Organization Notice", "Avis d'organisation", "Announcements from associations and NGOs."],
    ["notice", "notice-other", "Other Notice", "Autre avis", "Board material that fits nowhere else."],
    // --- listing: buy & sell -------------------------------------------------
    ["listing", "listing-electronics", "Phones & Electronics", "Téléphones & Électronique", "Handsets, laptops, TVs and accessories."], // legacy:
    ["listing", "listing-vehicles", "Vehicles", "Véhicules", "Cars, motorcycles, spare parts and commercial vehicles."], // legacy:
    ["listing", "listing-property", "Property", "Immobilier", "Rooms to rent, land and buildings for sale."], // legacy:
    ["listing", "listing-household", "Household", "Maison", "Furniture, appliances and everything a home needs."], // legacy:
    ["listing", "listing-fashion", "Fashion & Beauty", "Mode & Beauté", "Clothing, fabrics, wigs and beauty stock."],
    ["listing", "listing-agriculture", "Farming & Agriculture", "Agriculture", "Livestock, feed, tools and land equipment."],
    ["listing", "listing-services", "Services", "Services", "Repairs, tailoring, moving, tutoring and labour."],
    ["listing", "listing-jobs", "Jobs", "Emplois", "Vacancies and work offered locally."],
    ["listing", "listing-building", "Building Materials", "Matériaux de construction", "Cement, roofing, iron rods and sand."],
    ["listing", "listing-kids", "Baby & Kids", "Bébé & Enfants", "Strollers, clothes, school items and toys."],
    ["listing", "listing-sport", "Sport & Outdoors", "Sport & Plein air", "Kit, bicycles and sporting goods."],
    ["listing", "listing-free", "Free / Giveaway", "Gratuit", "Items given away at no charge."],
    // --- culture -------------------------------------------------------------
    ["culture", "culture-music", "Music", "Musique", "Artists, releases, videos and live shows."], // legacy:
    ["culture", "culture-events", "Events", "Événements", "Festivals, launches and nights out."], // legacy:
    ["culture", "culture-food", "Food", "Cuisine", "Dishes, markets, recipes and where to eat."], // legacy:
    ["culture", "culture-film", "Film & TV", "Cinéma & TV", "Screenings, series and the people who make them."],
    ["culture", "culture-comedy", "Comedy", "Humour", "Stands, skits and the comics behind them."],
    ["culture", "culture-dance", "Dance", "Danse", "Crews, battles and traditional movement."],
    ["culture", "culture-fashion", "Fashion", "Mode", "Designers, tailors and street style."],
    ["culture", "culture-tradition", "Tradition", "Tradition", "Fondoms, rites, titles and ceremonies."],
    ["culture", "culture-arts", "Arts & Crafts", "Art & Artisanat", "Painters, sculptors and makers."],
    ["culture", "culture-literature", "Books & Poetry", "Livres & Poésie", "Readings, releases and spoken word."],
    ["culture", "culture-history", "History", "Histoire", "Then & Now, archives and remembered places."],
];

/** categories dedupe on (content_type, slug), which is the registry's unique key. */
const pack = {
    id: "tax-categories",
    family: "taxonomy",
    tier: 1,
    audience: "prod-safe",
    title: "Category taxonomy",
    titleFr: "Taxonomie des catégories",
    what: "Every category the five content types filter and publish into, with EN and FR labels — including the legacy seed-demo slugs so the cleanup lists stay accurate.",
    tables: ["categories", "category_translations"],
    async rows(ctx) {
        // Loaded first so ctx.id() below adopts any category the legacy seeder
        // already created (its uuid is random) instead of duplicating it.
        await ctx.load("categories");
        const out = [];
        // Two passes: every category row must be planned before any translation
        // resolves its id, so the runner writes the parent table first.
        for (const [type, slug, nameEn] of CATEGORIES) {
            out.push({
                table: "categories",
                row: { content_type: type, slug, sort_order: 0, is_active: true },
                note: `${type}: ${nameEn}`,
            });
        }
        for (const [type, slug, nameEn, nameFr, descriptionEn] of CATEGORIES) {
            const id = ctx.id("categories", type, slug);
            out.push({ table: "category_translations", row: { category_id: id, locale: "en", name: nameEn, description: descriptionEn } });
            out.push({ table: "category_translations", row: { category_id: id, locale: "fr", name: nameFr } });
        }
        return out;
    },
};

export default pack;


