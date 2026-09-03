/**
 * Seeds demo content into the online Supabase project so the homepage
 * renders fully. Idempotent: skips if content_items already has rows.
 *
 * Run: node scripts/seed-demo.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

// --- env (parse .env manually; no dotenv dependency) ---
const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const get = (k) => {
    const m = env.match(new RegExp(`^${k}=(\\S+)`, "m"));
    return m?.[1];
};
const URL_ = get("NEXT_PUBLIC_SUPABASE_URL");
const KEY = get("SUPABASE_SERVICE_ROLE_KEY");
if (!URL_ || !KEY) throw new Error("Missing Supabase env vars in .env");

const db = createClient(URL_, KEY, { auth: { persistSession: false } });
const log = (...a) => console.log(...a);

const daysAgo = (d, h = 9) => {
    const t = new Date();
    t.setUTCDate(t.getUTCDate() - d);
    t.setUTCHours(h, 15 - (d % 45), 0, 0);
    return t.toISOString();
};
const inDays = (d) => {
    const t = new Date();
    t.setUTCDate(t.getUTCDate() + d);
    return t.toISOString();
};
const img = (seed, w = 1200, h = 800) =>
    `https://picsum.photos/seed/${seed}/${w}/${h}`;

// --- 1. locations ---
const LOCATIONS = [
    ["Bamenda", "bamenda", "city"],
    ["Mankon", "mankon", "quarter"],
    ["Nkwen", "nkwen", "quarter"],
    ["Bafut", "bafut", "town"],
    ["Buea", "buea", "city"],
    ["Douala", "douala", "city"],
    ["Yaoundé", "yaounde", "city"],
];

// --- 2. categories (per content type, en + fr labels) ---
const CATEGORIES = {
    photo_story: [
        ["Culture", "Culture", "culture"],
        ["Community", "Communauté", "community"],
        ["Infrastructure", "Infrastructure", "infrastructure"],
        ["People", "People", "people"],
        ["Everyday Africa", "Afrique de tous les jours", "everyday-africa"],
    ],
    news: [
        ["Community", "Communauté", "community"],
        ["Infrastructure", "Infrastructure", "infrastructure"],
        ["Education", "Éducation", "education"],
        ["Business", "Économie", "business"],
    ],
    notice: [
        ["Public Notice", "Avis public", "public-notice"],
        ["Road Closure", "Fermeture de route", "road-closure"],
        ["Community Alert", "Alerte communautaire", "community-alert"],
        ["Lost & Found", "Objets trouvés", "lost-found"],
    ],
    listing: [
        ["Phones & Electronics", "Téléphones & Électronique", "electronics"],
        ["Vehicles", "Véhicules", "vehicles"],
        ["Property", "Immobilier", "property"],
        ["Household", "Maison", "household"],
    ],
    culture: [
        ["Music", "Musique", "music"],
        ["Events", "Événements", "events"],
        ["Food", "Cuisine", "food"],
    ],
};
// --- 3. content items ---
const ITEMS_A = [
    {
        type: "photo_story",
        slug: "dawn-at-mankon-market",
        location: "Mankon",
        category: "Everyday Africa",
        verification: "verified",
        featured: true,
        days: 1,
        media: ["mankon-dawn", "mankon-dawn-2"],
        credit: "Sarah N.",
        en: {
            title: "Dawn at Mankon Market: The City Wakes in Colour",
            excerpt: "Before the first troley rolls into Bamenda, Mankon market is already alive — traders, tea steam and sunrise all competing for attention.",
            body: "At 5:40 AM the stalls are half-built and the bargaining has already begun.",
        },
        fr: {
            title: "L'aube au marché Mankon : la ville s'éveille en couleurs",
            excerpt: "Avant le premier troley à Bamenda, le marché Mankon vit déjà — commerçants, vapeur de thé et lever de soleil.",
            body: "À 5 h 40, les étals sont à moitié montés et le marchandage a déjà commencé.",
        },
    },
    {
        type: "photo_story",
        slug: "new-nkwen-footbridge",
        location: "Nkwen",
        category: "Infrastructure",
        verification: "official_source",
        days: 2,
        media: ["nkwen-bridge"],
        credit: "Eyong B.",
        en: {
            title: "The New Nkwen Footbridge, Through Neighbours' Eyes",
            excerpt: "Residents photographed the first week of the footbridge that finally links the two sides of the stream during rainy season.",
            body: "For eleven years the crossing disappeared every rainy season.",
        },
        fr: {
            title: "La nouvelle passerelle de Nkwen, vue par les riverains",
            excerpt: "Les habitants ont photographié la première semaine de la passerelle qui relie enfin les deux rives.",
            body: "Pendant onze ans, la traversée disparaissait à chaque saison des pluies.",
        },
    },
    {
        type: "photo_story",
        slug: "sunday-choir-bafut",
        location: "Bafut",
        category: "Culture",
        verification: "community_submission",
        days: 4,
        media: ["bafut-choir"],
        credit: "Mireille T.",
        en: {
            title: "Sunday Morning with the Bafut Youth Choir",
            excerpt: "One service, three languages, and a choir that keeps growing every month.",
            body: "The drums start before the sermon ends.",
        },
        fr: {
            title: "Dimanche matin avec la chorale de jeunes de Bafut",
            excerpt: "Une messe, trois langues et une chorale qui grandit chaque mois.",
            body: "Les tambours commencent avant la fin du sermon.",
        },
    },
    {
        type: "photo_story",
        slug: "motorcycle-taxi-nights-bamenda",
        location: "Bamenda",
        category: "People",
        verification: "community_submission",
        days: 6,
        media: ["bda-moto"],
        credit: "Kiven D.",
        en: {
            title: "Night Shift: Portrait of a Bamenda Motorcycle Taxi",
            excerpt: "Twelve hours, two fuel stops, one headlight — the city after dark, seen from the back of a bike.",
            body: "When the offices close, the second city opens.",
        },
        fr: {
            title: "De nuit : portrait d'un taxi-moto de Bamenda",
            excerpt: "Douze heures, deux pleins, un phare — la ville après le coucher du soleil, vue de l'arrière d'une moto.",
            body: "Quand les bureaux ferment, la deuxième ville s'ouvre.",
        },
    },
];

const ITEMS_B = [
    {
        type: "news",
        slug: "commercial-avenue-reopens",
        location: "Bamenda",
        category: "Infrastructure",
        verification: "official_source",
        featured: true,
        days: 1,
        en: {
            title: "Commercial Avenue Reopens After Three Weeks of Road Works",
            excerpt: "The stretch between the market roundabout and CRS junction reopened to traffic Monday morning after drainage upgrades.",
            body: "Drivers reported free-flowing traffic from 6 AM Monday.",
        },
        fr: {
            title: "L'avenue Commerciale rouvre après trois semaines de travaux",
            excerpt: "Le tronçon entre le rond-point du marché et le carrefour CRS a rouvert lundi après des travaux de drainage.",
            body: "Dès 6 h lundi, la circulation était fluide.",
        },
    },
    {
        type: "news",
        slug: "city-council-water-points",
        location: "Nkwen",
        category: "Community",
        verification: "verified",
        days: 2,
        en: {
            title: "City Council Confirms Twelve New Public Water Points",
            excerpt: "Locations announced for Nkwen and Mankon as the dry-season plan begins.",
            body: "The council published the full list on Tuesday.",
        },
        fr: {
            title: "La mairie confirme douze nouveaux points d'eau publics",
            excerpt: "Les sites annoncés à Nkwen et Mankon alors que le plan de saison sèche démarre.",
            body: "La mairie a publié la liste complète mardi.",
        },
    },
    {
        type: "news",
        slug: "bilingual-school-quiz",
        location: "Bamenda",
        category: "Education",
        verification: "community_submission",
        days: 3,
        en: {
            title: "Forty Schools Compete in the Annual Bilingual Quiz",
            excerpt: "The inter-school finals return to the congress hall this Saturday, English and French divisions.",
            body: "Organisers say registration doubled this year.",
        },
        fr: {
            title: "Quarante écoles en lice pour le grand quiz bilingue",
            excerpt: "La finale inter-écoles revient au palais des congrès samedi, divisions anglaise et française.",
            body: "Les organisateurs annoncent un doublement des inscriptions.",
        },
    },
    {
        type: "news",
        slug: "farmers-market-prices",
        location: "Bamenda",
        category: "Business",
        verification: "developing",
        days: 5,
        en: {
            title: "Tomato Prices Jump at Bamenda Food Market — Traders Explain",
            excerpt: "A bag that cost 18,000 FCFA last month now sells above 26,000. Transporters blame the rainy roads.",
            body: "Wholesalers pointed to two factors.",
        },
        fr: {
            title: "Le prix des tomates flambée au marché de Bamenda — explications",
            excerpt: "Un sac à 18 000 FCFA le mois dernier se vend au-dessus de 26 000. Les transporteurs invoquent les routes.",
            body: "Les grossistes pointent deux facteurs.",
        },
    },
];

const ITEMS_C = [
    {
        type: "notice",
        slug: "road-works-mankon-street",
        location: "Mankon",
        category: "Road Closure",
        noticeType: "road_closure",
        official: true,
        verification: "official_source",
        days: 0,
        expires: 9,
        org: "Bamenda City Council",
        en: {
            title: "Road Works on Mankon Main Street — Diversion Via Hospital Roundabout",
            excerpt: "Asphalt works from Thursday 6 AM to Saturday 6 PM. Market traffic diverted via Hospital Roundabout.",
            body: "Motorists should expect delays between 7 AM and 4 PM.",
        },
        fr: {
            title: "Travaux sur la rue principale de Mankon — dévia via le rond-point de l'Hôpital",
            excerpt: "Bitumage du jeudi 6 h au samedi 18 h. Circulation déviée par le rond-point de l'Hôpital.",
            body: "Prévoir des retards entre 7 h et 16 h.",
        },
    },
    {
        type: "notice",
        slug: "lost-student-id-card",
        location: "Bamenda",
        category: "Lost & Found",
        noticeType: "lost_found",
        verification: "community_submission",
        days: 1,
        expires: 20,
        en: {
            title: "Lost: Student ID Card Near Up Station Taxi Park",
            excerpt: "Blue cover, University of Bamenda, name starting with N. Finder please call — reward offered.",
            body: "Lost between the park and the pharmacy.",
        },
        fr: {
            title: "Perdu : carte d'étudiant près du parking de Up Station",
            excerpt: "Couverture bleue, Université de Bamenda, nom commençant par N. Récompense offerte.",
            body: "Perdue entre le parking et la pharmacie.",
        },
    },
    {
        type: "notice",
        slug: "malaria-prevention-drive",
        location: "Nkwen",
        category: "Community Alert",
        noticeType: "service_announcement",
        official: true,
        verification: "verified",
        days: 2,
        expires: 14,
        org: "District Health Service",
        en: {
            title: "Free Malaria Testing Week at Nkwen Health Centre",
            excerpt: "Testing and treated nets free of charge for children under five and pregnant women, all week.",
            body: "The centre opens 8 AM to 3 PM daily.",
        },
        fr: {
            title: "Semaine de dépistage gratuit du paludisme au centre de santé de Nkwen",
            excerpt: "Tests et moustiquaires imprégnées gratuits pour les moins de cinq ans et femmes enceintes.",
            body: "Le centre ouvre de 8 h à 15 h.",
        },
    },
    {
        type: "notice",
        slug: "youth-football-registration",
        location: "Bafut",
        category: "Public Notice",
        noticeType: "organization_notice",
        verification: "community_submission",
        days: 3,
        expires: 30,
        en: {
            title: "Registration Open: Bafut Community Youth League",
            excerpt: "Players aged 13–17 can register at the town hall annex until the end of the month.",
            body: "Bring a photocopy of a birth certificate.",
        },
        fr: {
            title: "Inscriptions ouvertes : ligue de jeunes de Bafut",
            excerpt: "Joueurs de 13 à 17 ans : inscriptions à l'annexe de la mairie jusqu'à la fin du mois.",
            body: "Apporter une photocopie de l'acte de naissance.",
        },
    },
];

const ITEMS_D = [
    {
        type: "listing",
        slug: "tecno-spark-10-for-sale",
        location: "Bamenda",
        category: "Phones & Electronics",
        price: 95000,
        days: 1,
        en: {
            title: "Tecno Spark 10 — 128GB, Clean Condition",
            excerpt: "Eight months old, screen protector since day one, charger included. Bamenda Commercial Avenue.",
            body: "Battery health is excellent.",
        },
        fr: {
            title: "Tecno Spark 10 — 128 Go, très bon état",
            excerpt: "Huit mois, vitre de protection depuis le premier jour, chargeur inclus. Avenue Commerciale.",
            body: "Batterie en excellent état.",
        },
    },
    {
        type: "listing",
        slug: "toyota-corolla-2008",
        location: "Douala",
        category: "Vehicles",
        price: 3200000,
        days: 2,
        en: {
            title: "Toyota Corolla 2008 — First Hand, Papers Complete",
            excerpt: "Grey, petrol, 4 new tyres, AC working. Serious buyers only, inspection in Bonabéri.",
            body: "Mileage at 168,000 km.",
        },
        fr: {
            title: "Toyota Corolla 2008 — première main, papiers complets",
            excerpt: "Gris, essence, 4 pneus neufs, clim OK. Visite à Bonabéri, acheteurs sérieux uniquement.",
            body: "Compteur à 168 000 km.",
        },
    },
    {
        type: "listing",
        slug: "two-bedroom-flat-nkwen",
        location: "Nkwen",
        category: "Property",
        price: 45000,
        days: 3,
        en: {
            title: "2-Bedroom Flat for Rent — Nkwen, Water & Power Included",
            excerpt: "Ground floor, tiled, private bathroom, 10 minutes from the motor park. One year advance.",
            body: "The compound has a borehole.",
        },
        fr: {
            title: "Appartement 2 chambres à louer — Nkwen, eau et électricité incluses",
            excerpt: "Rez-de-chaussée, carrelé, douche interne, à 10 minutes du motor park. Une année d'avance.",
            body: "La cour a un forage.",
        },
    },
    {
        type: "listing",
        slug: "deep-freezer-300l",
        location: "Bamenda",
        category: "Household",
        price: 180000,
        days: 4,
        en: {
            title: "Deep Freezer 300L — Ideal for Small Business",
            excerpt: "Works perfectly, used two years for a juice shop that is relocating. Nkwen delivery possible.",
            body: "Two baskets and keys included.",
        },
        fr: {
            title: "Congélateur 300 L — idéal pour petit commerce",
            excerpt: "Fonctionne parfaitement, utilisé deux ans par un vendeur de jus qui déménage. Livraison Nkwen possible.",
            body: "Deux paniers et clés inclus.",
        },
    },
];

const ITEMS_E = [
    {
        type: "culture",
        slug: "ngoma-festival-lineup",
        location: "Bamenda",
        category: "Events",
        verification: "official_source",
        featured: true,
        days: 2,
        media: ["ngoma-fest"],
        en: {
            title: "Ngoma Festival Announces Full Lineup for December Edition",
            excerpt: "Three days, two stages, and a diaspora showcase at the Bamenda congress hall.",
            body: "Organisers revealed the 24-artist lineup.",
        },
        fr: {
            title: "Le festival Ngoma dévoile la programmation de décembre",
            excerpt: "Trois jours, deux scènes et une vitrine diaspora au palais des congrès de Bamenda.",
            body: "Les organisateurs ont révélé la programmation de 24 artistes.",
        },
    },
    {
        type: "culture",
        slug: "acheke-food-review",
        location: "Mankon",
        category: "Food",
        verification: "community_submission",
        days: 4,
        media: ["acheke-plate"],
        en: {
            title: "The Best Achu & Pepe Soup Corner in Mankon? We Tested Three",
            excerpt: "One wins on spice, one on price, one on the meat. A completely unofficial investigation.",
            body: "We started at 11 AM and finished at 3 PM.",
        },
        fr: {
            title: "Le meilleur coin achu et soupe pepe de Mankon ? Test de trois adresses",
            excerpt: "L'un gagne sur le piment, l'autre sur le prix, le troisième sur la viande. Enquête officieuse.",
            body: "Début à 11 h, fin à 15 h.",
        },
    },
    {
        type: "culture",
        slug: "town-arts-new-gallery",
        location: "Bamenda",
        category: "Music",
        verification: "verified",
        days: 6,
        media: ["art-gallery"],
        en: {
            title: "A New Art Space Opens Behind Commercial Avenue",
            excerpt: "Nine local painters, one sewing studio and a small stage for spoken word — all under one roof.",
            body: "The space opens Tuesday to Saturday.",
        },
        fr: {
            title: "Un nouvel espace d'art ouvre derrière l'avenue Commerciale",
            excerpt: "Neuf peintres locaux, un atelier de couture et une petite scène de spoken word sous un même toit.",
            body: "Ouverture du mardi au samedi.",
        },
    },
];

const ALL_ITEMS = [...ITEMS_A, ...ITEMS_B, ...ITEMS_C, ...ITEMS_D, ...ITEMS_E];

// --- 4. main ---
async function upsertLocations() {
    const { data: existing } = await db.from("locations").select("id, name, slug");
    const map = new Map();
    for (const [name, slug, type] of LOCATIONS) {
        const found = (existing ?? []).find((l) => l.slug === slug);
        if (found) {
            map.set(name, found.id);
            continue;
        }
        const { data, error } = await db
            .from("locations")
            .insert({ name, slug, locale: "en", location_type: type, is_active: true })
            .select("id");
        if (error || !data?.[0]) throw new Error(`location ${name}: ${error?.message}`);
        map.set(name, data[0].id);
    }
    log(`locations: ${map.size} ready`);
    return map;
}

async function ensureCategories() {
    const { data: existing } = await db
        .from("categories")
        .select("id, content_type, category_translations(locale, name)");
    const map = new Map(); // `${type}:${enName}` -> id
    const byType = new Map(); // type -> [{id, names:Set}]
    for (const c of existing ?? []) {
        const list = byType.get(c.content_type) ?? [];
        list.push({ id: c.id, names: new Set((c.category_translations ?? []).map((t) => t.name)) });
        byType.set(c.content_type, list);
    }
    for (const [type, cats] of Object.entries(CATEGORIES)) {
        for (const [en, fr, slug] of cats) {
            let cat = (byType.get(type) ?? []).find((c) => c.names.has(en));
            if (!cat) {
                const { data, error } = await db
                    .from("categories")
                    .insert({ content_type: type, slug: `${type}-${slug}`, is_active: true })
                    .select("id");
                if (error || !data?.[0]) throw new Error(`category ${type}/${en}: ${error?.message}`);
                cat = { id: data[0].id, names: new Set() };
                const { error: trErr } = await db.from("category_translations").insert([
                    { category_id: cat.id, locale: "en", name: en },
                    { category_id: cat.id, locale: "fr", name: fr },
                ]);
                if (trErr) throw new Error(`cat translations ${en}: ${trErr.message}`);
                byType.set(type, [...(byType.get(type) ?? []), cat]);
            } else {
                // ensure the French label exists (existing seeds were en-only)
                const { data: frRows } = await db
                    .from("category_translations")
                    .select("id")
                    .eq("category_id", cat.id)
                    .eq("locale", "fr")
                    .limit(1);
                if (!frRows || frRows.length === 0) {
                    await db
                        .from("category_translations")
                        .insert({ category_id: cat.id, locale: "fr", name: fr });
                }
            }
            map.set(`${type}:${en}`, cat.id);
        }
    }
    log(`categories: ${map.size} ready`);
    return map;
}

async function seedItems(locationMap, categoryMap) {
    const { count } = await db.from("content_items").select("id", { count: "exact", head: true });
    if (count && count > 0) {
        log(`content_items already has ${count} rows — skipping item seed`);
        return null;
    }
    const ids = []; // {id, slug} in seed order
    for (const item of ALL_ITEMS) {
        const { data: created, error } = await db
            .from("content_items")
            .insert({
                type: item.type,
                slug: item.slug,
                status: "published",
                verification: item.verification,
                location_id: locationMap.get(item.location) ?? null,
                category_id: categoryMap.get(`${item.type}:${item.category}`) ?? null,
                published_at: daysAgo(item.days),
                is_featured: !!item.featured,
            })
            .select("id");
        if (error || !created?.[0]) throw new Error(`content_item ${item.slug}: ${error?.message}`);
        const id = created[0].id;
        ids.push({ id, slug: item.slug, item });

        const { error: trErr } = await db.from("content_translations").insert([
            { content_item_id: id, locale: "en", voice: "formal", title: item.en.title, excerpt: item.en.excerpt, body: item.en.body },
            { content_item_id: id, locale: "fr", voice: "formal", title: item.fr.title, excerpt: item.fr.excerpt, body: item.fr.body },
        ]);
        if (trErr) throw new Error(`translations ${item.slug}: ${trErr.message}`);

        if (item.media?.length) {
            const { error: mErr } = await db.from("media_assets").insert(
                item.media.map((seed, i) => ({
                    content_item_id: id,
                    kind: "image",
                    provider: "r2",
                    destination: "public_photo",
                    storage_key: `seed/${seed}.jpg`,
                    public_url: img(seed),
                    mime_type: "image/jpeg",
                    caption: item.en.excerpt,
                    photographer_credit: item.credit ?? "Eagle Eye Africa",
                    alt_text: item.en.title,
                    sort_order: i,
                    is_cover: i === 0,
                }))
            );
            if (mErr) throw new Error(`media ${item.slug}: ${mErr.message}`);
        }

        if (item.type === "notice") {
            const { error: nErr } = await db.from("notices").insert({
                content_item_id: id,
                notice_type: item.noticeType,
                is_official: !!item.official,
                organization_name: item.org ?? "Community member",
                notice_date: daysAgo(item.days),
                expiry_date: item.expires ? inDays(item.expires) : null,
            });
            if (nErr) throw new Error(`notice ${item.slug}: ${nErr.message}`);
        }
        if (item.type === "listing") {
            const { error: lErr } = await db.from("listings").insert({
                content_item_id: id,
                price: item.price,
                currency: "XAF",
                listing_status: "active",
            });
            if (lErr) throw new Error(`listing ${item.slug}: ${lErr.message}`);
        }
    }
    log(`content items: ${ids.length} seeded`);
    return ids;
}

async function curateHomepage(ids) {
    const { count } = await db.from("homepage_slots").select("id", { count: "exact", head: true });
    if (count && count > 0) {
        log("homepage_slots already populated — skipping");
        return;
    }
    const pick = (slug) => ids.find((i) => i.slug === slug);
    const hero = pick("dawn-at-mankon-market");
    const secondary = [
        pick("commercial-avenue-reopens"),
        pick("new-nkwen-footbridge"),
        pick("ngoma-festival-lineup"),
    ].filter(Boolean);
    const rows = [];
    if (hero) rows.push({ slot_key: "hero", content_item_id: hero.id, sort_order: 0, is_active: true });
    if (secondary[0])
        rows.push({ slot_key: "secondary", content_item_id: secondary[0].id, sort_order: 0, is_active: true });
    const { error } = await db.from("homepage_slots").insert(rows);
    if (error) throw new Error(`homepage_slots: ${error.message}`);
    log(`homepage curation: ${rows.length} slots`);
}

/** Homepage ad placements (spec §11): one leaderboard, a sidebar rail and two inline strips. */
const AD_SLOTS = [
    {
        slot_key: "homepage-banner",
        name: "Homepage Banner",
        dimensions: "970x250",
        campaign: {
            name: "Nkwen Building Supplies — Launch Campaign",
            copy_text: "Cement, roofing and tools delivered across Bamenda. Call 6 70 00 00 00.",
        },
    },
    {
        slot_key: "homepage-rail-top",
        name: "Homepage Rail (Top)",
        dimensions: "300x400",
        campaign: {
            name: "Santa Central Market — Weekend Special",
            copy_text: "Fresh produce, spices and fabric at wholesale prices. Santa Market, Bamenda — Saturdays from 6 AM.",
        },
    },
    { slot_key: "homepage-inline-mid", name: "Homepage Inline (Mid)", dimensions: "728x90", campaign: null },
    { slot_key: "homepage-inline-bottom", name: "Homepage Inline (Bottom)", dimensions: "728x90", campaign: null },
];

async function seedAdCampaign() {
    let activeCampaigns = 0;
    for (const def of AD_SLOTS) {
        // Ensure the slot exists (idempotent)…
        const { data: existingSlot } = await db
            .from("ad_slots")
            .select("id, slot_key")
            .eq("slot_key", def.slot_key)
            .limit(1);
        let slot = existingSlot?.[0] ?? null;
        if (!slot) {
            const { data: created, error } = await db
                .from("ad_slots")
                .insert({
                    slot_key: def.slot_key,
                    name: def.name,
                    placement: "homepage",
                    dimensions: def.dimensions,
                    currency: "XAF",
                })
                .select("id");
            if (!error && created?.[0]) slot = created[0];
        }
        if (!slot) {
            log(`ad slot ${def.slot_key} unavailable — skipped`);
            continue;
        }
        // …then seed one active demo campaign for the premium placements.
        if (!def.campaign) continue;
        const { data: existing } = await db
            .from("ad_campaigns")
            .select("id")
            .eq("ad_slot_id", slot.id)
            .eq("status", "active")
            .limit(1);
        if (existing?.length) {
            activeCampaigns += 1;
            continue;
        }
        const { error } = await db.from("ad_campaigns").insert({
            ad_slot_id: slot.id,
            name: def.campaign.name,
            status: "active",
            destination_url: "https://example.com",
            copy_text: def.campaign.copy_text,
            starts_at: daysAgo(1),
            ends_at: inDays(60),
            currency: "XAF",
        });
        if (error) throw new Error(`ad_campaigns: ${error.message}`);
        activeCampaigns += 1;
    }
    log(`ad slots ensured (${AD_SLOTS.length}); active campaigns: ${activeCampaigns}`);
}

async function main() {
    log("Seeding Eagle Eye Africa demo content…");
    const locations = await upsertLocations();
    const categories = await ensureCategories();
    let ids = await seedItems(locations, categories);
    if (!ids) {
        // items already exist — look up their ids for curation
        const slugs = ALL_ITEMS.map((i) => i.slug);
        const { data, error } = await db.from("content_items").select("id, slug").in("slug", slugs);
        if (error) throw new Error(`lookup: ${error.message}`);
        ids = (data ?? []).map((r) => ({ id: r.id, slug: r.slug }));
    }
    await curateHomepage(ids);
    await seedAdCampaign();
    log("Done.");
}

main().catch((e) => {
    console.error("SEED FAILED:", e.message);
    process.exit(1);
});