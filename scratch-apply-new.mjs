// One-off: apply only the two new migrations (apply-migrations.mjs re-runs
// everything and dies on the already-applied init schema).
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("./.env", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(\\S+)`, "m"))?.[1];
const URL_ = get("NEXT_PUBLIC_SUPABASE_URL");
const KEY = get("SUPABASE_SERVICE_ROLE_KEY");

const files = ["20260926000001_remove_demo_polls.sql", "20260927000000_blogger_import.sql"];
for (const file of files) {
    const sql = readFileSync(new URL(`./supabase/migrations/${file}`, import.meta.url), "utf8");
    const res = await fetch(`${URL_}/sql`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            apikey: KEY,
            Authorization: `Bearer ${KEY}`,
            "X-Client-Info": "eea-apply-new",
        },
        body: JSON.stringify({ query: sql }),
    });
    const text = await res.text();
    if (!res.ok) {
        console.error(`--- ${file} FAILED (HTTP ${res.status}) ---`);
        console.error(text.slice(0, 2000));
        process.exit(1);
    }
    console.log(`OK ${file}`);
}
