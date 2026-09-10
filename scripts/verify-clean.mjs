/**
 * Verifies that no demo ("dummy"/hardcoded seed) data remains in the database.
 *
 * Reads every public-content table through the service-role client and reports:
 *   1. Any rows still matching the exact demo identifiers (the slugs/keys created
 *      by scripts/seed-demo.mjs, scripts/seed-fundraisers.mjs and migration
 *      20260902000000_community_polls.sql — keep the lists below in sync with
 *      lib/admin/demo-data.ts). ANY hit here means the wipe was incomplete.
 *   2. Total row counts per table, so a fully-wiped site reads all zeros.
 *
 * Tables that hold real USER activity (submissions, reports, corrections,
 * data_requests, digest_subscribers, saved_content, …) are reported as
 * informational only — they are never demo data and this script never deletes
 * anything. To remove demo rows, use the admin dashboard's "Remove demo data"
 * card (lib/admin/actions-demo.ts) or `node scripts/teardown-demo.mjs`.
 *
 * About/Legal policy versions + about/advertise overrides + site_settings are
 * also informational: they are admin-managed content (empty = the public site
 * renders its built-in dictionary copy, never blank).
 *
 * Exit code: 0 when zero demo-identifier rows remain, 1 otherwise.
 *
 * Run: node scripts/verify-clean.mjs
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

// --- Exact demo identifiers (mirror lib/admin/demo-data.ts) ---
const DEMO_CONTENT_SLUGS = [
    "dawn-at-mankon-market",
    "new-nkwen-footbridge",
    "sunday-choir-bafut",
    "motorcycle-taxi-nights-bamenda",
    "commercial-avenue-reopens",
    "city-council-water-points",
    "bilingual-school-quiz",
    "farmers-market-prices",
    "road-works-mankon-street",
    "lost-student-id-card",
    "malaria-prevention-drive",
    "youth-football-registration",
    "tecno-spark-10-for-sale",
    "toyota-corolla-2008",
    "two-bedroom-flat-nkwen",
    "deep-freezer-300l",
    "ngoma-festival-lineup",
    "acheke-food-review",
    "town-arts-new-gallery",
    "fundraiser-mankon-market-drainage",
    "fundraiser-nkwen-baby-emergency",
    "fundraiser-bafut-school-roof",
];
const DEMO_AD_SLOT_KEYS = [
    "homepage-banner",
    "homepage-rail-top",
    "homepage-inline-mid",
    "homepage-inline-bottom",
];
const DEMO_POLL_SLUGS = [
    "mankon-market-priority",
    "rainy-season-readiness",
    "what-to-cover-next",
];
const DEMO_CATEGORY_SLUGS = [
    "photo_story-culture", "photo_story-community", "photo_story-infrastructure",
    "photo_story-people", "photo_story-everyday-africa",
    "news-community", "news-infrastructure", "news-education", "news-business",
    "notice-public-notice", "notice-road-closure", "notice-community-alert", "notice-lost-found",
    "listing-electronics", "listing-vehicles", "listing-property", "listing-household",
    "culture-music", "culture-events", "culture-food",
];
const DEMO_LOCATION_SLUGS = ["bamenda", "mankon", "nkwen", "bafut", "buea", "douala", "yaounde"];

let demoHits = 0;

async function count(table, filter) {
    // Select "*" (not "id"): several tables (fundraisers, listings, notices,
    // events, site_settings, …) use a non-"id" primary key.
    let q = db.from(table).select("*", { count: "exact", head: true });
    if (filter) q = q.match(filter);
    const { count: n, error } = await q;
    if (error) return `ERR (${error.message})`;
    return n ?? 0;
}

async function demoSlugs(table, column, slugs) {
    const { data, error } = await db.from(table).select(column).in(column, slugs);
    if (error) {
        log(`  ! ${table}: could not check (${error.message})`);
        return;
    }
    for (const row of data ?? []) {
        log(`  X DEMO REMAINING — ${table}.${column} = "${row[column]}"`);
        demoHits += 1;
    }
    if (!data || data.length === 0) log(`  ok ${table}: no demo identifiers`);
}

async function main() {
    log("Checking Eagle Eye Africa for leftover demo data…\n");

    log("[demo identifiers]");
    await demoSlugs("content_items", "slug", DEMO_CONTENT_SLUGS);
    await demoSlugs("polls", "slug", DEMO_POLL_SLUGS);
    await demoSlugs("ad_slots", "slot_key", DEMO_AD_SLOT_KEYS);
    await demoSlugs("categories", "slug", DEMO_CATEGORY_SLUGS);
    await demoSlugs("locations", "slug", DEMO_LOCATION_SLUGS);

    // Demo ad campaigns live under the demo slots (report names so they can be
    // recognised; any row here after a wipe means the slot sweep was skipped).
    const { data: slots } = await db.from("ad_slots").select("id, slot_key");
    const demoSlotIds = (slots ?? []).filter((s) => DEMO_AD_SLOT_KEYS.includes(s.slot_key)).map((s) => s.id);
    if (demoSlotIds.length > 0) {
        const { data: camps } = await db.from("ad_campaigns").select("name").in("ad_slot_id", demoSlotIds);
        for (const c of camps ?? []) {
            log(`  X DEMO REMAINING — ad_campaigns.name = "${c.name}"`);
            demoHits += 1;
        }
    }
    // Demo fundraisers are rows on demo campaign stories.
    const { data: demoItems } = await db.from("content_items").select("id, slug").in("slug", DEMO_CONTENT_SLUGS);
    if (demoItems && demoItems.length > 0) {
        const { data: funds } = await db
            .from("fundraisers")
            .select("content_item_id")
            .in("content_item_id", demoItems.map((i) => i.id));
        for (const f of funds ?? []) {
            const slug = demoItems.find((i) => i.id === f.content_item_id)?.slug;
            log(`  X DEMO REMAINING — fundraisers on "${slug}"`);
            demoHits += 1;
        }
    }

    // Explain any KEPT demo locations/categories (the sweep only removes them
    // when nothing references them — a kept row names its referrer here).
    const { data: keptLocs } = await db.from("locations").select("id, slug").in("slug", DEMO_LOCATION_SLUGS);
    for (const loc of keptLocs ?? []) {
        const [items, biz, profs] = await Promise.all([
            count("content_items", { location_id: loc.id }),
            count("businesses", { location_id: loc.id }),
            count("profiles", { location_id: loc.id }),
        ]);
        log(`  … location "${loc.slug}" kept by: ${items} content item(s), ${biz} business(es), ${profs} profile(s)`);
    }

    log("\n[table totals — a fully wiped site reads 0 on every demo-content line]");
    for (const t of [
        "content_items", "content_translations", "media_assets",
        "polls", "poll_options", "poll_votes",
        "fundraisers", "listings", "notices", "events",
        "ad_slots", "ad_campaigns", "homepage_slots",
        "categories", "category_translations", "locations",
    ]) {
        log(`  ${t}: ${await count(t)}`);
    }

    log("\n[user activity — informational only, never demo data]");
    for (const t of [
        "submissions", "reports", "corrections", "data_requests",
        "digest_subscribers", "policy_versions", "about_sections",
        "advertise_sections", "site_settings",
    ]) {
        log(`  ${t}: ${await count(t)}`);
    }

    log("");
    if (demoHits > 0) {
        log(`RESULT: ${demoHits} demo row(s) still present — re-run the dashboard "Remove demo data" sweep.`);
        process.exit(1);
    }
    log("RESULT: clean — zero demo-identifier rows. Remaining visible copy is dictionary UI text");
    log("(empty states, About/Advertise fallbacks) managed in the admin command center.");
}

main().catch((e) => {
    console.error("VERIFY-CLEAN FAILED:", e.message);
    process.exit(1);
});
