/**
 * Seeds the notification loop for local development so the admin queue,
 * the per-row actions and the digest list are exercisable without waiting
 * for real intake. Idempotent: every insert is guarded by its demo marker.
 *
 * What it creates (all clearly marked, safe by default):
 *   1. One PENDING staff outbox row (demo submission alert) → visible in
 *      /admin/notifications with working Retry / wa.me / copy actions.
 *   2. One INACTIVE digest subscriber (demo-notify@example.com) → visible
 *      in the subscribers table; toggling it active opts a sink address
 *      into the 06:00 fan-out (example.com never delivers).
 *   3. With `--user <uuid>`: upserts that profile's notification_prefs
 *      (WhatsApp on, quiet hours 22→7) so /account/notifications shows
 *      non-default values. Skipped without the flag — prefs otherwise
 *      default correctly in the worker.
 *
 * The worker treats seeded rows like any other: "Run worker now" delivers
 * the demo row in-app to current staff (email/WhatsApp skip honestly when
 * unconfigured). Remove with `node scripts/teardown-demo.mjs`.
 *
 * Run: node scripts/seed-notify.mjs [--user <profile-uuid>]
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

const DEMO_EMAIL = "demo-notify@example.com";

async function main() {
    const userFlag = process.argv.indexOf("--user");
    const userId = userFlag === -1 ? null : process.argv[userFlag + 1];
    log("Seeding notification loop demo rows…");

    // 1. Pending staff outbox demo row.
    const { data: existing } = await db
        .from("notification_outbox")
        .select("id")
        .filter("data->>demo", "eq", "seed-notify")
        .limit(1);
    if ((existing ?? []).length > 0) {
        log("  outbox demo row already present — skipping");
    } else {
        const { error } = await db.from("notification_outbox").insert({
            audience: "staff",
            event: "submission.received",
            title: "New news submission needs review",
            title_fr: "Nouvelle soumission news à vérifier",
            body: "Demo market repairs — from Demo Contributor. Open the moderation queue to review it.",
            body_fr: "Réparations du marché démo — de Demo Contributor. Ouvrez la file de modération pour vérifier.",
            data: { demo: "seed-notify", type: "news", title: "Demo market repairs", from: "Demo Contributor", path: "/admin/moderation" },
        });
        if (error) throw new Error(`outbox seed: ${error.message}`);
        log("  inserted pending staff demo row (submission.received)");
    }

    // 2. Inactive demo digest subscriber (sink address, never delivers).
    const { data: sub } = await db.from("digest_subscribers").select("id").eq("email", DEMO_EMAIL).limit(1);
    if ((sub ?? []).length > 0) {
        log("  digest demo subscriber already present — skipping");
    } else {
        const { error } = await db.from("digest_subscribers").insert({
            email: DEMO_EMAIL,
            phone: null,
            whatsapp: null,
            locale: "en",
            is_active: false,
        });
        if (error) throw new Error(`subscriber seed: ${error.message}`);
        log("  inserted inactive demo subscriber (demo-notify@example.com)");
    }

    // 3. Optional prefs for a real profile.
    if (userId) {
        const { data: profile } = await db.from("profiles").select("id").eq("id", userId).maybeSingle();
        if (!profile) throw new Error(`no profiles row for --user ${userId}`);
        const { error } = await db.from("notification_prefs").upsert(
            { user_id: userId, inapp: true, email: true, whatsapp: true, locale: "en", quiet_start: 22, quiet_end: 7, updated_at: new Date().toISOString() },
            { onConflict: "user_id" },
        );
        if (error) throw new Error(`prefs seed: ${error.message}`);
        log(`  upserted prefs for ${userId} (whatsapp on, quiet 22→7)`);
    } else {
        log("  no --user flag — skipping prefs seed (worker defaults apply)");
    }

    log("Done. Exercise via /admin/notifications (Run worker now / Send test to me).");
}

main().catch((e) => {
    console.error("SEED FAILED:", e.message);
    process.exit(1);
});
