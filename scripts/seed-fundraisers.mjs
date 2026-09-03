/**
 * Seeds demo Community Fundraising campaigns.
 *
 * A campaign is a published `news` content item (the story behind it) plus a
 * row in the `fundraisers` table holding the money metadata. This script
 * creates both, in English and French, so the fundraising module on the
 * Community News page has real content to render.
 *
 * Idempotent: skips if any of the campaign slugs already exist.
 *
 * Run: node scripts/seed-fundraisers.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

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

const daysAgo = (d) => {
    const t = new Date();
    t.setUTCDate(t.getUTCDate() - d);
    t.setUTCHours(9, 15, 0, 0);
    return t.toISOString();
};
const inDays = (d) => {
    const t = new Date();
    t.setUTCDate(t.getUTCDate() + d);
    return t.toISOString();
};
const img = (seed) => `https://picsum.photos/seed/${seed}/1200/800`;

const CAMPAIGNS = [
    {
        slug: "fundraiser-mankon-market-drainage",
        location: "Mankon",
        category: "Infrastructure",
        verification: "verified",
        days: 3,
        media: "mankon-drainage-fund",
        credit: "Sarah N.",
        goal_amount: 2_500_000,
        raised_amount: 1_640_000,
        currency: "XAF",
        organizer_name: "Mankon Market Traders Association",
        organizer_phone: "+237 6 77 12 45 90",
        donation_url: "https://example.org/give/mankon-drainage",
        verification_notes:
            "Organizer identity and trader committee confirmed by the Eagle Eye editorial team on 30 August 2026.",
        closes_in_days: 12,
        en: {
            title: "Mankon Market Traders Raise Funds to Rebuild the Drainage Channels",
            excerpt:
                "Every rainy season the lower stalls flood before noon. The traders association has costed the repairs and started a community campaign.",
            body:
                "The drainage channels along the lower row of Mankon market were last rebuilt in 2009. Since 2022 they have overflowed in every rainy season, closing as many as forty stalls at a time. An engineer’s estimate put the repair at 2.5 million FCFA, covering new channels, a culvert across the main entrance and two days of labour. The traders association has committed 640,000 FCFA from its own reserves and is asking the community for the remaining 1.86 million.",
        },
        fr: {
            title: "Les commerçants du marché Mankon collectent pour reconstruire les canalisations",
            excerpt:
                "À chaque saison des pluies, les étals du bas sont inondés avant midi. L’association des commerçants a chiffré les réparations et lancé une collecte.",
            body:
                "Les canalisations du bas du marché Mankon n’ont pas été refaites depuis 2009. Depuis 2022, elles débordent à chaque saison des pluies, fermant jusqu’à quarante étals à la fois. Un devis d’ingénieur a estimé la réparation à 2,5 millions de FCFA. L’association des commerçants a engagé 640 000 FCFA sur ses réserves et demande à la communauté les 1,86 million restants.",
        },
    },
    {
        slug: "fundraiser-nkwen-baby-emergency",
        location: "Nkwen",
        category: "Community",
        verification: "verified",
        days: 1,
        media: "nkwen-medical-fund",
        credit: "Eyong B.",
        goal_amount: 850_000,
        raised_amount: 712_500,
        currency: "XAF",
        organizer_name: "Nkwen Neighbourhood Health Committee",
        organizer_phone: "+237 6 74 08 33 12",
        donation_url: "https://example.org/give/nkwen-emergency",
        verification_notes:
            "Hospital admission record and committee officers verified by two separate Eagle Eye editors.",
        closes_in_days: 4,
        en: {
            title: "Emergency Surgery Fund for a Three-Week-Old in Nkwen",
            excerpt:
                "The family cannot cover the referral and surgery costs alone. The neighbourhood health committee opened a campaign on Sunday evening.",
            body:
                "A three-week-old girl was referred from the Nkwen health centre to the regional hospital on Sunday with an intestinal obstruction requiring immediate surgery. The family has no insurance and was asked to deposit 850,000 FCFA before the procedure. The neighbourhood health committee opened a campaign that evening; 712,500 FCFA has been raised so far, mostly in small amounts from neighbours and the local taxi rank.",
        },
        fr: {
            title: "Caisse d’urgence pour une opération d’un bébé de trois semaines à Nkwen",
            excerpt:
                "La famille ne peut pas couvrir seule les frais d’évacuation et d’opération. Le comité de santé du quartier a ouvert une collecte dimanche soir.",
            body:
                "Une fillette de trois semaines a été évacuée du centre de santé de Nkwen vers l’hôpital régional dimanche pour une occlusion intestinale nécessitant une opération immédiate. La famille n’a pas d’assurance et une caution de 850 000 FCFA a été demandée. Le comité de santé du quartier a ouvert une collecte le soir même ; 712 500 FCFA ont déjà été réunis, surtout en petites sommes.",
        },
    },
    {
        slug: "fundraiser-bafut-school-roof",
        location: "Bafut",
        category: "Education",
        verification: "community_submission",
        days: 6,
        media: "bafut-school-fund",
        credit: "Mireille T.",
        goal_amount: 3_200_000,
        raised_amount: 480_000,
        currency: "XAF",
        organizer_name: "Bafut Government School PTA",
        organizer_phone: "+237 6 79 55 20 41",
        donation_url: null,
        verification_notes:
            "Submitted by a parent and reviewed by editors. Organizer contact confirmed; costed quote still being validated.",
        closes_in_days: 26,
        en: {
            title: "Bafut Parents Launch Appeal to Replace a Leaking Classroom Roof",
            excerpt:
                "Two classrooms have been closed since a March storm tore off the roof sheets. The PTA is raising the 3.2 million FCFA needed to rebuild.",
            body:
                "A storm in March lifted the roof off two classrooms at the Bafut government school. Both rooms have been unused since, and the affected classes now run in shifts in the school hall. The PTA obtained a quote of 3.2 million FCFA for new sheets, timber and labour, and opened the appeal at the end-of-term meeting. Donations are collected through the PTA treasurer and recorded in a ledger parents can inspect.",
        },
        fr: {
            title: "Les parents de Bafut lancent un appel pour remplacer un toit qui fuit",
            excerpt:
                "Deux salles de classe sont fermées depuis qu’une tempête de mars a arraché les tôles. L’APE collecte les 3,2 millions nécessaires.",
            body:
                "Une tempête en mars a arraché le toit de deux salles de classe de l’école publique de Bafut. Les deux salles sont inutilisées depuis et les classes concernées se partagent la salle polyvalente. L’APE a obtenu un devis de 3,2 millions de FCFA pour les tôles, le bois et la main-d’œuvre, et a lancé l’appel lors de la réunion de fin de trimestre. Les dons sont collectés par le trésorier de l’APE et consignés dans un registre consultable par les parents.",
        },
    },
];

const slugs = CAMPAIGNS.map((c) => c.slug);

const { data: existing } = await db.from("content_items").select("id, slug").in("slug", slugs);
if (existing && existing.length > 0) {
    log(`Already seeded (${existing.length} campaign(s) found) — nothing to do.`);
    process.exit(0);
}

const { data: locations } = await db.from("locations").select("id, name");
const locationMap = new Map((locations ?? []).map((l) => [l.name, l.id]));

const { data: categories } = await db
    .from("categories")
    .select("id, slug, content_type, category_translations(locale, name)");
const categoryMap = new Map();
for (const c of categories ?? []) {
    const enName = c.category_translations?.find((t) => t.locale === "en")?.name;
    if (enName) categoryMap.set(`${c.content_type}:${enName}`, c.id);
}

let seeded = 0;
for (const c of CAMPAIGNS) {
    const { data: created, error } = await db
        .from("content_items")
        .insert({
            type: "news",
            slug: c.slug,
            status: "published",
            verification: c.verification,
            location_id: locationMap.get(c.location) ?? null,
            category_id: categoryMap.get(`news:${c.category}`) ?? null,
            published_at: daysAgo(c.days),
            // The fundraisers table has no deadline column — the parent
            // story's expires_at is what the campaign countdown reads.
            expires_at: inDays(c.closes_in_days),
            is_featured: false,
        })
        .select("id");

    if (error || !created?.[0]) {
        throw new Error(`content_item ${c.slug}: ${error?.message}`);
    }
    const id = created[0].id;

    const { error: trErr } = await db.from("content_translations").insert([
        {
            content_item_id: id,
            locale: "en",
            voice: "formal",
            title: c.en.title,
            excerpt: c.en.excerpt,
            body: c.en.body,
        },
        {
            content_item_id: id,
            locale: "fr",
            voice: "formal",
            title: c.fr.title,
            excerpt: c.fr.excerpt,
            body: c.fr.body,
        },
    ]);
    if (trErr) throw new Error(`translations ${c.slug}: ${trErr.message}`);

    const { error: mErr } = await db.from("media_assets").insert({
        content_item_id: id,
        kind: "image",
        provider: "r2",
        destination: "public_photo",
        storage_key: `seed/${c.media}.jpg`,
        public_url: img(c.media),
        mime_type: "image/jpeg",
        caption: c.en.excerpt,
        photographer_credit: c.credit,
        alt_text: c.en.title,
        sort_order: 0,
        is_cover: true,
    });
    if (mErr) throw new Error(`media ${c.slug}: ${mErr.message}`);

    const { error: fErr } = await db.from("fundraisers").insert({
        content_item_id: id,
        goal_amount: c.goal_amount,
        currency: c.currency,
        raised_amount: c.raised_amount,
        organizer_name: c.organizer_name,
        organizer_phone: c.organizer_phone,
        organizer_email: null,
        donation_url: c.donation_url,
        verification_notes: c.verification_notes,
        closed_at: null,
    });
    if (fErr) throw new Error(`fundraiser ${c.slug}: ${fErr.message}`);

    seeded += 1;
    log(`  seeded ${c.slug}`);
}

log(`Done — ${seeded} fundraising campaigns created.`);
