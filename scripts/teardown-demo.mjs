/**
 * Removes the demo content created by scripts/seed-demo.mjs,
 * scripts/seed-fundraisers.mjs and scripts/seed-notify.mjs, plus the demo
 * polls seeded by migration 20260902000000_community_polls.sql.
 *
 * Idempotent and scoped: it only touches rows that match the exact slugs /
 * slot keys used by the seeders, so real editorial content is never affected.
 * Deleting a content_item cascades through translations, media, listings,
 * notices, events, fundraisers, tags, saved_content, corrections, and
 * relationships (schema-level ON DELETE CASCADE); homepage slots, ad slots /
 * campaigns, and polls are cleared explicitly here because their FKs are
 * SET NULL and do not cascade.
 *
 * Deliberately NOT deleted: the About/Legal policy versions
 * (migration 20260905000000_about_legal.sql / scripts/seed-about-legal.mjs) —
 * that is real legal copy, not demo content. Re-run the seed scripts
 * afterwards to restore the demo data.
 *
 * Run: node scripts/teardown-demo.mjs
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

// --- Exact demo identifiers (mirror the seeders) ---
const CONTENT_SLUGS = [
    // seed-demo.mjs — photo stories
    "dawn-at-mankon-market",
    "new-nkwen-footbridge",
    "sunday-choir-bafut",
    "motorcycle-taxi-nights-bamenda",
    // seed-demo.mjs — news
    "commercial-avenue-reopens",
    "city-council-water-points",
    "bilingual-school-quiz",
    "farmers-market-prices",
    // seed-demo.mjs — notices
    "road-works-mankon-street",
    "lost-student-id-card",
    "malaria-prevention-drive",
    "youth-football-registration",
    // seed-demo.mjs — listings
    "tecno-spark-10-for-sale",
    "toyota-corolla-2008",
    "two-bedroom-flat-nkwen",
    "deep-freezer-300l",
    // seed-demo.mjs — culture
    "ngoma-festival-lineup",
    "acheke-food-review",
    "town-arts-new-gallery",
    // seed-fundraisers.mjs — fundraising campaign stories
    "fundraiser-mankon-market-drainage",
    "fundraiser-nkwen-baby-emergency",
    "fundraiser-bafut-school-roof",
];

const LOCATION_SLUGS = ["bamenda", "mankon", "nkwen", "bafut", "buea", "douala", "yaounde"];

// `${content_type}-${category slug}` as created by ensureCategories().
const CATEGORY_SLUGS = [
    "photo_story-culture", "photo_story-community", "photo_story-infrastructure",
    "photo_story-people", "photo_story-everyday-africa",
    "news-community", "news-infrastructure", "news-education", "news-business",
    "notice-public-notice", "notice-road-closure", "notice-community-alert", "notice-lost-found",
    "listing-electronics", "listing-vehicles", "listing-property", "listing-household",
    "culture-music", "culture-events", "culture-food",
];

const AD_SLOT_KEYS = [
    "homepage-banner",
    "homepage-rail-top",
    "homepage-inline-mid",
    "homepage-inline-bottom",
];

const POLL_SLUGS = [
    "mankon-market-priority",
    "rainy-season-readiness",
    "what-to-cover-next",
];

async function countRows(table, filter) {
    const q = db.from(table).select("id", { count: "exact", head: true });
    const { count } = await (filter ? q.match(filter) : q);
    return count ?? 0;
}

async function main() {
    log("Tearing down Eagle Eye Africa demo content…");

    // 1. Polls (migration-seeded demo polls). Votes/options cascade from the poll_id FK.
    for (const slug of POLL_SLUGS) {
        const { data: rows } = await db.from("polls").select("id").eq("slug", slug);
        for (const poll of rows ?? []) {
            const { error } = await db.from("polls").delete().eq("id", poll.id);
            if (error) throw new Error(`poll ${slug}: ${error.message}`);
            log(`  deleted poll ${slug}`);
        }
    }

    // 2. Content items (cascades clean translations, media, type rows, …).
    const { data: items } = await db
        .from("content_items")
        .select("id, slug")
        .in("slug", CONTENT_SLUGS);
    const itemIds = (items ?? []).map((r) => r.id);
    if (itemIds.length) {
        // 2a. Homepage slots (FK is SET NULL — must be cleared explicitly).
        const { error: slotErr } = await db
            .from("homepage_slots")
            .delete()
            .in("content_item_id", itemIds);
        if (slotErr) throw new Error(`homepage_slots: ${slotErr.message}`);
        log(`  cleared homepage slots referencing ${itemIds.length} demo item(s)`);

        // 2b. Fundraiser rows referencing the demo campaign stories.
        const { error: fundErr } = await db
            .from("fundraisers")
            .delete()
            .in("content_item_id", itemIds);
        if (fundErr) throw new Error(`fundraisers: ${fundErr.message}`);

        // 2c. The items themselves.
        const { error: itemErr } = await db
            .from("content_items")
            .delete()
            .in("slug", CONTENT_SLUGS);
        if (itemErr) throw new Error(`content_items: ${itemErr.message}`);
        log(`  deleted ${itemIds.length} demo content item(s)`);
    } else {
        log("  no demo content items found — nothing to delete");
    }

    // 3. Ad slots + campaigns (standalone tables, no cascade from content).
    const { data: slots } = await db
        .from("ad_slots")
        .select("id, slot_key")
        .in("slot_key", AD_SLOT_KEYS);
    for (const slot of slots ?? []) {
        const { error: campErr } = await db
            .from("ad_campaigns")
            .delete()
            .eq("ad_slot_id", slot.id);
        if (campErr) throw new Error(`ad_campaigns (${slot.slot_key}): ${campErr.message}`);
        const { error: slotErr } = await db.from("ad_slots").delete().eq("id", slot.id);
        if (slotErr) throw new Error(`ad_slots (${slot.slot_key}): ${slotErr.message}`);
        log(`  deleted ad slot ${slot.slot_key}`);
    }

    // 4. Categories with the seeded slugs, ONLY when nothing references them.
    const { data: cats } = await db
        .from("categories")
        .select("id, slug")
        .in("slug", CATEGORY_SLUGS);
    for (const cat of cats ?? []) {
        const used = await countRows("content_items", { category_id: cat.id });
        if (used > 0) {
            log(`  kept category ${cat.slug} (still used by ${used} content item(s))`);
            continue;
        }
        const { error } = await db.from("categories").delete().eq("id", cat.id);
        if (error) throw new Error(`category ${cat.slug}: ${error.message}`);
        log(`  deleted category ${cat.slug}`);
    }

    // 5. Locations with the seeded slugs, ONLY when nothing references them.
    const { data: locs } = await db
        .from("locations")
        .select("id, slug")
        .in("slug", LOCATION_SLUGS);
    for (const loc of locs ?? []) {
        const inItems = await countRows("content_items", { location_id: loc.id });
        const inBusinesses = await countRows("businesses", { location_id: loc.id });
        const inProfiles = await countRows("profiles", { location_id: loc.id });
        if (inItems + inBusinesses + inProfiles > 0) {
            log(`  kept location ${loc.slug} (${inItems} items, ${inBusinesses} businesses, ${inProfiles} profiles)`);
            continue;
        }
        const { error } = await db.from("locations").delete().eq("id", loc.id);
        if (error) throw new Error(`location ${loc.slug}: ${error.message}`);
        log(`  deleted location ${loc.slug}`);
    }

    // 6. Notification demo rows (scripts/seed-notify.mjs markers only —
    //    real outbox rows and subscribers are user activity, never touched).
    const { data: demoRows } = await db
        .from("notification_outbox")
        .select("id")
        .filter("data->>demo", "eq", "seed-notify");
    for (const row of demoRows ?? []) {
        const { error } = await db.from("notification_outbox").delete().eq("id", row.id);
        if (error) throw new Error(`notification_outbox demo row: ${error.message}`);
        log("  deleted notification_outbox demo row");
    }
    {
        const { error } = await db.from("digest_subscribers").delete().eq("email", "demo-notify@example.com");
        if (error) throw new Error(`digest_subscribers demo row: ${error.message}`);
        log("  deleted digest demo subscriber (if present)");
    }

    log("Done. About/Legal policy versions were intentionally left untouched.");
}

main().catch((e) => {
    console.error("TEARDOWN FAILED:", e.message);
    process.exit(1);
});