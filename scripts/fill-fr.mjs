/**
 * French fill (Phase B) — translates every Blogger-imported article into
 * French with the DeepL API and stores it as content_translations(fr, formal).
 *
 * What gets translated per post:
 *   - title, excerpt, seo_description (plain text)
 *   - body (HTML — DeepL `tag_handling=html`, `ignore_tags=img,iframe`, so
 *     markup and embedded media are preserved and only text is translated)
 *   - byline is copied as-is (a person's name)
 *
 * Notes on the free tier (500k chars/month):
 *   - The default char budget is 450k per run; when the budget is exhausted
 *     the run stops cleanly and prints what remains. DB rows are the state —
 *     re-running skips every post that already has an fr body, so a big job
 *     simply continues on the next month's quota.
 *   - Rate limit: 55 chars → sleep 1.5s between requests (free tier allows 50
 *     requests/min; paid allows 20r/s).
 *
 * Setup: add `DEEPL_API_KEY=...` to .env (free keys end in `:fx`; the script
 * picks the free vs paid endpoint from the key).
 *
 * Run:
 *   node scripts/fill-fr.mjs --dry-run      # list how many posts/chars remain
 *   node scripts/fill-fr.mjs                # translate until the budget runs out
 *   node scripts/fill-fr.mjs --budget 1000000 --limit 20
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(join(root, ".env"), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(\\S+)`, "m"))?.[1];

const SUPA_URL = get("NEXT_PUBLIC_SUPABASE_URL");
const SUPA_KEY = get("SUPABASE_SERVICE_ROLE_KEY");
const DEEPL_KEY = get("DEEPL_API_KEY");
if (!SUPA_URL || !SUPA_KEY) throw new Error("Missing Supabase env in .env");
if (!DEEPL_KEY) {
    console.log("DEEPL_API_KEY is not set in .env yet — add it (free keys end with ':fx') then re-run.");
    console.log("All non-translation work is done; this script only writes French translations.");
    process.exit(0);
}

const db = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const budgetIdx = args.indexOf("--budget");
const limitIdx = args.indexOf("--limit");
const BUDGET = budgetIdx >= 0 ? Number(args[budgetIdx + 1]) : 450_000;
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

const DEEPL_ENDPOINT = DEEPL_KEY.endsWith(":fx")
    ? "https://api-free.deepl.com/v2/translate"
    : "https://api.deepl.com/v2/translate";
const SLEEP_MS = 1500;

let budgetUsed = 0;
let translatedPosts = 0;
let failed = [];

async function callDeepL(texts, tagHandling) {
    const body = {
        text: texts,
        target_lang: "FR",
        source_lang: "EN",
        ...(tagHandling ? { tag_handling: "html", ignore_tags: ["img", "iframe"] } : {}),
        split_sentences: "nonewlines",
    };
    const headers = {
        "Content-Type": "application/json",
        Authorization: `DeepL-Auth-Key ${DEEPL_KEY}`,
    };
    for (let attempt = 1; attempt <= 4; attempt++) {
        const res = await fetch(DEEPL_ENDPOINT, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
        });
        if (res.status === 429 && attempt < 4) {
            await new Promise((r) => setTimeout(r, SLEEP_MS * 4 * attempt));
            continue;
        }
        if (res.status === 456) throw new Error("DEEPL_QUOTA_EXCEEDED — monthly character limit reached");
        if (res.status === 403) {
            const detail = await res.text();
            throw new Error(`deepl auth rejected (${detail.slice(0, 120)}). Check DEEPL_API_KEY.`);
        }
        if (!res.ok) {
            const detail = await res.text();
            throw new Error(`deepl ${res.status}: ${detail.slice(0, 200)}`);
        }
        const json = await res.json();
        return json.translations.map((t) => t.text);
    }
    throw new Error("deepl 429 after retries");
}

async function translatePost(tr) {
    // Count source chars for the budget.
    const sourceLen =
        (tr.title ?? "").length + (tr.excerpt ?? "").length + (tr.body ?? "").length + (tr.seo_description ?? "").length;

    // Title + excerpt + SEO in one plain-text request.
    const plain = [tr.title ?? "", tr.excerpt ?? "", tr.seo_description ?? ""];
    const [frTitle, frExcerpt, frSeo] = await callDeepL(plain, false);

    // Body as HTML in a second request.
    const [frBody] = await callDeepL(tr.body ? [tr.body] : [""], true);

    await db.from("content_translations").upsert(
        {
            content_item_id: tr.content_item_id,
            locale: "fr",
            voice: "formal",
            title: frTitle.slice(0, 300),
            excerpt: frExcerpt,
            body: frBody,
            seo_description: frSeo?.slice(0, 300),
            byline: tr.byline ?? null,
            updated_at: new Date().toISOString(),
        },
        { onConflict: "content_item_id,locale,voice" },
    );
    return sourceLen;
}
async function main() {
    const { data: items, error: itemErr } = await db
        .from("content_items")
        .select("id, import_source_id")
        .eq("import_source", "blogger");
    if (itemErr) throw new Error(`content_items: ${itemErr.message}`);
    const ids = (items ?? []).map((i) => i.id);

    const { data: enRows } = await db
        .from("content_translations")
        .select("content_item_id, locale, title, excerpt, body, seo_description, byline")
        .in("content_item_id", ids)
        .eq("locale", "en");
    const byId = new Map();
    for (const r of enRows ?? []) byId.set(r.content_item_id, r);

    const { data: frRows } = await db
        .from("content_translations")
        .select("content_item_id, body")
        .in("content_item_id", ids)
        .eq("locale", "fr");

    // Idempotent: posts whose fr body already exists are skipped.
    const done = new Set((frRows ?? []).filter((r) => r.body?.trim()).map((r) => r.content_item_id));
    const pending = (items ?? [])
        .map((i) => byId.get(i.id))
        .filter((tr) => tr && !done.has(tr.content_item_id));
    const totalChars = pending.reduce((sum, tr) => sum + (tr.title ?? "").length + (tr.excerpt ?? "").length + (tr.body ?? "").length, 0);

    console.log(`Posts: ${items?.length ?? 0} | pending fr: ${pending.length} | remaining chars: ${totalChars.toLocaleString()} | budget/run: ${BUDGET.toLocaleString()}`);

    if (DRY) {
        console.log("\nDRY RUN — nothing translated. Remove --dry-run to translate.");
        return;
    }

    const batch = pending.slice(0, LIMIT);
    for (const [i, tr] of batch.entries()) {
        if (budgetUsed >= BUDGET) {
            console.log(`\nBudget exhausted after ${translatedPosts} posts (${budgetUsed.toLocaleString()} chars).`);
            console.log(`Re-run to continue; ${pending.length - translatedPosts} posts remain.`);
            break;
        }
        try {
            const used = await translatePost(tr);
            budgetUsed += used;
            translatedPosts++;
            console.log(`  [${i + 1}/${batch.length}] ✓ ${tr.title.slice(0, 60)} (${used.toLocaleString()} chars, total ${budgetUsed.toLocaleString()})`);
            await new Promise((r) => setTimeout(r, SLEEP_MS));
        } catch (e) {
            if (e.message === "DEEPL_QUOTA_EXCEEDED — monthly character limit reached") {
                console.log(`\n${e.message} after ${translatedPosts} posts (${budgetUsed.toLocaleString()} chars). Resume next month.`);
                break;
            }
            failed.push(`${tr.title.slice(0, 50)} — ${e.message}`);
            console.error(`  !! ${tr.title.slice(0, 50)} — ${e.message}`);
            await new Promise((r) => setTimeout(r, SLEEP_MS * 2));
        }
    }

    console.log(`\nDone — translated ${translatedPosts} posts (${budgetUsed.toLocaleString()} chars used this run).`);
    if (failed.length) {
        console.log(`Failures (${failed.length}):`);
        for (const f of failed) console.log("  " + f);
    }
    console.log("Verify with: node scripts/verify-import.mjs (fr translations count).");
}

main().catch((e) => {
    console.error("FR-FILL FAILED:", e.message);
    process.exit(1);
});