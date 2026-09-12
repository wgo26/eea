/**
 * Post-import verification — prints the state of the Blogger-imported rows so
 * the backfill (and later the fr-fill) can be audited at a glance.
 *
 *   node scripts/verify-import.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(join(root, ".env"), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(\\S+)`, "m"))?.[1];
const db = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
});

const counts = {};
const tally = (obj, key) => {
    obj[key] = (obj[key] ?? 0) + 1;
};

const { data: items, error } = await db
    .from("content_items")
    .select("id, status, location_id, category_id, author_id, is_featured, verification, published_at")
    .eq("import_source", "blogger");

if (error) {
    console.error("content_items:", error.message);
    process.exit(1);
}

for (const r of items ?? []) {
    tally(counts, `status:${r.status}`);
    tally(counts, `location:${r.location_id ? "set" : "MISSING"}`);
    tally(counts, `category:${r.category_id ? "set" : "MISSING"}`);
    tally(counts, `author:${r.author_id ? "set" : "MISSING"}`);
    tally(counts, `verification:${r.verification ?? "null"}`);
    if (r.is_featured) tally(counts, "featured");
    if (!r.published_at && r.status === "published") tally(counts, "published-without-date");
}

console.log(`Blogger items: ${items?.length ?? 0}`);
for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k}: ${v}`);

const ids = (items ?? []).map((i) => i.id);
const { data: fr } = await db
    .from("content_translations")
    .select("content_item_id, locale")
    .in("content_item_id", ids)
    .eq("locale", "fr");
console.log(`fr translations: ${fr?.length ?? 0}`);

process.exit(0);