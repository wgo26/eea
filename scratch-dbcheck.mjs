import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = readFileSync(new URL("./.env", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(\\S+)`, "m"))?.[1];
const db = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const ID = "a469d0f1-9f99-44d8-9d3e-7a7725d1a60a";

// 1. moderation_log trail for the published row
const { data: log } = await db.from("moderation_log")
    .select("created_at, action, to_status, actor_id")
    .eq("content_item_id", ID)
    .order("created_at", { ascending: true });
console.log("moderation_log for some-public-figures:", JSON.stringify(log, null, 1));

// 2. current state
const { data: row } = await db.from("content_items")
    .select("status, published_at, created_at, updated_at").eq("id", ID);
console.log("row now:", JSON.stringify(row));

// 3. All blogger items with created_at timestamps — histogram by minute to see
//    whether two import processes were interleaving
const { data: all } = await db.from("content_items")
    .select("created_at").eq("import_source", "blogger").order("created_at", { ascending: true });
const byMinute = {};
for (const r of all ?? []) {
    const m = r.created_at.slice(0, 16);
    byMinute[m] = (byMinute[m] ?? 0) + 1;
}
console.log("\nblogger rows created per minute:");
for (const [m, c] of Object.entries(byMinute)) console.log(`  ${m}: ${c}`);

// 4. any moderation_log rows at all referencing blogger items (the wizard path)
const { data: importLogs } = await db.from("moderation_log")
    .select("created_at, action, actor_id, content_item_id").order("created_at", { ascending: true }).limit(200);
const importLogRows = (importLogs ?? []).filter((l) => /import/i.test(l.action ?? ""));
console.log("\nimport-related moderation_log rows:", importLogRows.length);

