/**
 * Blogger import metadata backfill (Phase A).
 *
 * Fills every field the Blogger export cannot carry, so flooded-in posts stop
 * being bare drafts and become complete, publishable articles:
 *
 *   - author_id   → the site's only contributor (Tardzenyuy Peter)
 *   - location_id → Bamenda (the publisher's home base)
 *   - category_id → keyword-scored from title/excerpt/body with a curated set
 *                   of news categories (created on demand, EN+FR labels);
 *                   unclassifiable posts fall back to "community-news"
 *   - status      → Blogger-LIVE posts become published (their original
 *                   published_at is already stored); Blogger-DRAFT posts stay
 *                   drafts
 *   - is_featured → up to 5 recent, illustrated, published posts power the
 *                   home/spotlight hero queues
 *   - verification → "verified" on imported posts (first-party publisher
 *                   content); pass --no-verify to skip
 *   - seo_description / byline on the en translation where still empty
 *
 * Idempotent: re-runs converge — only null SEO rows are filled, only
 * non-published LIVE posts flip, category scores are deterministic.
 *
 * Run:
 *   node scripts/backfill-blogger.mjs --dry-run          # print the plan
 *   node scripts/backfill-blogger.mjs                    # apply everything
 *   node scripts/backfill-blogger.mjs --limit 5          # pilot batch
 *   node scripts/backfill-blogger.mjs --no-verify        # keep verification null
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- env (same manual parse as scripts/import-blogger.mjs) ---
const env = readFileSync(join(root, ".env"), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(\\S+)`, "m"))?.[1];
const SUPA_URL = get("NEXT_PUBLIC_SUPABASE_URL");
const SUPA_KEY = get("SUPABASE_SERVICE_ROLE_KEY");
if (!SUPA_URL || !SUPA_KEY) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env");

const db = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });

// --- flags ---
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const NO_VERIFY = args.includes("--no-verify");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

// --- identities (resolved at runtime so ids never drift) ---
const CONTRIBUTOR_DISPLAY = "Wirngo Peter Tardzenyuy";
const BYLINE_NAME = "Tardzenyuy Peter";
const DEFAULT_LOCATION_SLUG = "bamenda";
const FALLBACK_CATEGORY_SLUG = "community-news";

// ---------------------------------------------------------------------------
// Feed parsing — authoritative Blogger status (LIVE/DRAFT) per post id.
// ---------------------------------------------------------------------------
function parseFeedStatuses() {
    const xml = readFileSync(
        join(root, "docs", "Blogger", "Blogs", "EAGLE EYE AFRICA", "feed.atom"),
        "utf8",
    );
    const map = new Map();
    const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry\s*>/gi) ?? [];
    for (const entry of entries) {
        if (!/<blogger:type>\s*POST\s*<\/blogger:type>/i.test(entry)) continue;
        const id = entry.match(/<id\b[^>]*>([\s\S]*?)<\/id\s*>/i)?.[1]?.trim();
        const status = entry.match(/<blogger:status\b[^>]*>([\s\S]*?)<\/blogger:status\s*>/i)?.[1]?.trim();
        if (id) map.set(id, status === "DRAFT" ? "draft" : "published");
    }
    return map;
}
// ---------------------------------------------------------------------------
// Category taxonomy + keyword rules (EN + FR). Slugs are stable so re-runs
// match the same categories; keywords are word-bounded and case-insensitive.
// ---------------------------------------------------------------------------
const CATEGORY_RULES = [
    {
        slug: "politics",
        en: "Politics",
        fr: "Politique",
        title: ["council", "mayor", "government", "governor", "election", "senator", "minister", "parliament", "decree", "official", "delegation", "ministry", "diplomat", "senate", "president", "parliamentarian", "anglop", "separatist", "ambazon", "crisis"],
        body: ["governance", "legislat", "campaign trail", "ballot", "democracy", "sovereignty", "ambazonia", "ceasefire", "peace talk", "humanitarian", "governor's office", "municipal"],
    },
    {
        slug: "education",
        en: "Education",
        fr: "Éducation",
        title: ["school", "university", "student", "teacher", "college", "education", "exam", "classroom", "nursery", "scholarship", "campus", "lecturer"],
        body: ["academic", "bilingual", "curriculum", "graduat", "enrol", "tuition", "teacher training", "head teacher"],
    },
    {
        slug: "business",
        en: "Business",
        fr: "Économie",
        title: ["market", "business", "economy", "trade", "commerce", "price", "invest", "entrepreneur", "shop", "trader", "bank", "money", "rice", "commodit", "expo", "financ"],
        body: ["commercial", "startup", "merchant", "import", "export", "currency", "naira", "xaf", "franc", "profit", "revenue", "supply"],
    },
    {
        slug: "infrastructure",
        en: "Infrastructure",
        fr: "Infrastructure",
        title: ["road", "bridge", "water", "electricity", "power", "construction", "project", "building", "highway", "tar", "asphalt", "street", "infrastructure", "footbridge"],
        body: ["contractor", "site", "carriageway", "culvert", "drainage", "renovat", "rehabilitat", "tarmac", "street light"],
    },
    {
        slug: "sports",
        en: "Sports",
        fr: "Sport",
        title: ["sport", "football", "tournament", "match", "team", "athlet", "league", "gym", "jamboree", "stadium", "boxing", "basketball"],
        body: ["coach", "referee", "pitch", "yellow jersey", "marathon", "workout", "fitness", "championship"],
    },
    {
        slug: "health",
        en: "Health",
        fr: "Santé",
        title: ["hospital", "health", "medical", "clinic", "doctor", "nurse", "disease", "malaria", "patient", "hygiene", "vaccine", "covid", "sick", "illness"],
        body: ["treatment", "ward", "pharmacy", "immuniz", "outbreak", "epidemic", "first aid", "maternity", "diabetes"],
    },
    {
        slug: "culture",
        en: "Culture & Entertainment",
        fr: "Culture & divertissement",
        title: ["music", "video", "film", "culture", "festival", "artist", "entertainment", "concert", "traditional", "dance", "album", "song", "movie", "documentary"],
        body: ["singer", "rapper", "groove", "lyrics", "cinema", "theatre", "caravan", "heritage", "masquerade"],
    },
];

const ALL_EXISTING_NEWS_CATEGORIES = new Map(); // slug -> id

/** HTML -> readable text (for scoring + SEO descriptions). */
function stripHtml(html) {
    return (html ?? "")
        .replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
        .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
}

/** Score one category's keyword rules against title/excerpt/body text. */
function scoreCategory(rule, title, excerpt, bodyText) {
    const haystack = (title ?? "").toLowerCase();
    const excerptLower = (excerpt ?? "").toLowerCase();
    const bodyLower = (bodyText ?? "").toLowerCase();
    const esc = (kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let score = 0;
    for (const kw of rule.title) {
        const re = new RegExp(`\\b${esc(kw)}`);
        if (re.test(haystack)) score += 4;
        if (re.test(excerptLower)) score += 2;
        if (re.test(bodyLower)) score += 1;
    }
    for (const kw of rule.body) {
        const re = new RegExp(`\\b${esc(kw)}`);
        if (re.test(haystack)) score += 2;
        if (re.test(excerptLower)) score += 1;
        if (re.test(bodyLower)) score += 1;
    }
    return score;
}

/** Pick the best-matching category slug, falling back to community-news. */
function categorize(title, excerpt, bodyText) {
    let best = null;
    let bestScore = 0;
    for (const rule of CATEGORY_RULES) {
        const score = scoreCategory(rule, title, excerpt, bodyText);
        if (score > bestScore) {
            bestScore = score;
            best = rule.slug;
        }
    }
    return best ?? FALLBACK_CATEGORY_SLUG;
}

/** First ~155 characters on a word boundary — a polite meta description. */
function makeSeoDescription(excerpt, body) {
    const text = stripHtml(excerpt ?? body ?? "");
    if (text.length <= 158) return text || null;
    const cut = text.slice(0, 155).trimEnd();
    const space = cut.lastIndexOf(" ");
    return (space > 100 ? cut.slice(0, space) : cut).trim();
}
// ---------------------------------------------------------------------------
// Lookups (ids resolved at runtime) + category provisioning
// ---------------------------------------------------------------------------
async function ensureAuthor() {
    const { data } = await db
        .from("profiles")
        .select("id")
        .ilike("display_name", `%${CONTRIBUTOR_DISPLAY.split(" ").join("%")}%`)
        .limit(1);
    const row = data?.[0];
    if (!row) throw new Error(`Contributor profile "${CONTRIBUTOR_DISPLAY}" not found in profiles.`);
    return row.id;
}

async function ensureLocation() {
    const { data } = await db
        .from("locations")
        .select("id")
        .eq("slug", DEFAULT_LOCATION_SLUG)
        .limit(1);
    const row = data?.[0];
    if (!row) throw new Error(`Location "${DEFAULT_LOCATION_SLUG}" not found.`);
    return row.id;
}

/** Create (once) every desired news category with EN/FR names.
 *  The remote DB keeps a GLOBAL unique categories.slug (drift from the repo's
 *  (content_type, slug) composite), so slugs that exist under another content
 *  type are promoted to news instead of re-inserted — safe here because those
 *  rows are unused by any content_item (verified by the import run).
 *
 *  `write=false` (dry-run) only maps existing rows — nothing is mutated. */
async function ensureCategories(write = true) {
    const { data: existing } = await db
        .from("categories")
        .select("id, slug, content_type");
    for (const row of existing ?? []) ALL_EXISTING_NEWS_CATEGORIES.set(row.slug, row.id);

    const DEFS = [
        ...CATEGORY_RULES.map((r) => ({ slug: r.slug, en: r.en, fr: r.fr })),
        { slug: FALLBACK_CATEGORY_SLUG, en: "Community News", fr: "Nouvelles communautaires" },
    ];
    for (const def of DEFS) {
        const found = (existing ?? []).find((r) => r.slug === def.slug);
        let id = found?.id;
        if (found) {
            if (found.content_type !== "news") {
                if (write) {
                    const { error } = await db
                        .from("categories")
                        .update({ content_type: "news" })
                        .eq("id", found.id);
                    if (error) throw new Error(`category promote ${def.slug}: ${error.message}`);
                }
                console.log(`  · ${write ? "promoted" : "would promote"} "${def.slug}" (${found.content_type}) → news`);
            }
        } else {
            if (write) {
                const { data: created, error } = await db
                    .from("categories")
                    .insert({ content_type: "news", slug: def.slug, is_active: true })
                    .select("id")
                    .single();
                if (error || !created) throw new Error(`category insert ${def.slug}: ${error?.message ?? "empty"}`);
                id = created.id;
            }
            console.log(`  · ${write ? "created" : "would create"} category "${def.en}" / "${def.fr}" (${def.slug})`);
        }
        if (!id) continue; // dry-run: category does not exist yet — not mappable
        for (const [locale, name] of [["en", def.en], ["fr", def.fr]]) {
            if (!write) continue;
            await db
                .from("category_translations")
                .upsert(
                    { category_id: id, locale, name, description: null },
                    { onConflict: "category_id,locale" },
                );
        }
        ALL_EXISTING_NEWS_CATEGORIES.set(def.slug, id);
    }
}
// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
    const statuses = parseFeedStatuses();
    const authorId = await ensureAuthor();
    const locationId = await ensureLocation();
    await ensureCategories(!DRY);
    console.log(`Author: ${CONTRIBUTOR_DISPLAY} | Location: ${DEFAULT_LOCATION_SLUG} | Feed statuses: ${statuses.size} posts`);

    const { data: items, error: itemErr } = await db
        .from("content_items")
        .select("id, slug, import_source_id, status, published_at, verification, is_featured, media:media_assets(id, is_cover)")
        .eq("import_source", "blogger");
    if (itemErr) throw new Error(`content_items: ${itemErr.message}`);
    if (!items?.length) {
        console.log("No blogger-imported content_items found — nothing to backfill.");
        return;
    }

    const ids = items.map((i) => i.id);
    const { data: translRows } = await db
        .from("content_translations")
        .select("content_item_id, locale, title, excerpt, body, byline, seo_description")
        .in("content_item_id", ids)
        .eq("locale", "en");

    const translations = new Map();
    for (const t of translRows ?? []) translations.set(t.content_item_id, t);

    // Featured candidates: published + illustrated (has a cover media row), newest first.
    const featuredIds = new Set(
        items
            .filter((i) => i.status === "published" || statuses.get(i.import_source_id) === "published")
            .filter((i) => (i.media ?? []).some((m) => m.is_cover))
            .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
            .slice(0, 5)
            .map((i) => i.id),
    );

    const batch = items.slice(0, LIMIT);
    const plan = [];
    for (const item of batch) {
        const tr = translations.get(item.id);
        const text = stripHtml(tr?.body ?? "");
        const categorySlug = categorize(tr?.title, tr?.excerpt, text);
        // Dry-run may not map would-be-created categories; a sentinel keeps the
        // patch flag honest (string ≠ uuid ⇒ always "needs category").
        const categoryId = ALL_EXISTING_NEWS_CATEGORIES.get(categorySlug) ?? `CREATE:${categorySlug}`;
        const seo = tr?.seo_description?.trim() ? null : makeSeoDescription(tr?.excerpt, tr?.body);
        const wantStatus = statuses.get(item.import_source_id) ?? "published";
        plan.push({
            item,
            seo,
            byline: tr?.byline?.trim() ? null : BYLINE_NAME,
            categorySlug,
            wantStatus,
            patches: {
                author: item.author_id !== authorId,
                location: item.location_id !== locationId,
                category: categoryId !== item.category_id,
                status: item.status !== wantStatus,
                verify: !NO_VERIFY && item.verification !== "verified",
                featured: featuredIds.has(item.id) && !item.is_featured,
            },
            categoryId,
        });
    }

    // ---- report ----
    const toPublish = plan.filter((p) => p.wantStatus === "published" && p.patches.status).length;
    const keepDraft = plan.filter((p) => p.wantStatus === "draft").length;
    const cats = new Map();
    for (const p of plan) cats.set(p.categorySlug, (cats.get(p.categorySlug) ?? 0) + 1);
    const applied = plan.filter((p) => Object.values(p.patches).some(Boolean)).length;
    console.log(`\nPlan for ${plan.length} posts (${applied} need changes):`);
    console.log(`  status → published: ${toPublish} | drafts kept: ${keepDraft}`);
    console.log(`  featured: ${featuredIds.size}`);
    console.log(`  categories: ${[...cats.entries()].map(([k, v]) => `${k}(${v})`).join(", ")}`);
    console.log(`  seo fill: ${plan.filter((p) => p.seo).length} | byline fill: ${plan.filter((p) => p.byline).length}`);

    if (DRY) {
        console.log("\nDRY RUN — no writes performed. Remove --dry-run to apply.");
        return;
    }
// ---- apply ----
    let updated = 0;
    for (const p of plan) {
        const patch = {
            ...(p.patches.author ? { author_id: authorId } : {}),
            ...(p.patches.location ? { location_id: locationId } : {}),
            ...(p.patches.category ? { category_id: p.categoryId } : {}),
            ...(p.patches.status ? { status: p.wantStatus } : {}),
            ...(p.patches.verify ? { verification: "verified" } : {}),
            ...(p.patches.featured ? { is_featured: true } : {}),
        };
        if (Object.keys(patch).length) {
            const { error } = await db.from("content_items").update(patch).eq("id", p.item.id);
            if (error) throw new Error(`update ${p.item.slug}: ${error.message}`);
            updated++;
        }
        const trPatch = {
            ...(p.seo ? { seo_description: p.seo } : {}),
            ...(p.byline ? { byline: p.byline } : {}),
        };
        if (Object.keys(trPatch).length) {
            // Only touch the row we read (en/formal); leave non-empty values alone.
            const { error: trErr } = await db
                .from("content_translations")
                .update(trPatch)
                .eq("content_item_id", p.item.id)
                .eq("locale", "en")
                .or("seo_description.is.null,seo_description.eq.,byline.is.null");
            if (trErr) throw new Error(`translation ${p.item.slug}: ${trErr.message}`);
        }
    }
    console.log(`\nDone — patched ${updated} content_items (+ empty translation rows filled).`);
}

main().catch((e) => {
    console.error("BACKFILL FAILED:", e.message);
    process.exit(1);
});