/**
 * Blogger Takeout bulk import — reads the unzipped Google Takeout export
 * (docs/Blogger) and imports every blog POST (LIVE + DRAFT) as a content
 * draft, ready for the normal admin review/publish workflow on /admin/content.
 *
 * What it preserves ("all metadata in place"):
 *   - title, body HTML, excerpt (first 300 chars), per-post meta description
 *     → content_translations (en, formal) with seo_description
 *   - original public URL slug (blogger:filename → /2020/10/foo.html → foo)
 *   - original publish date (LIVE posts keep published_at; the admin publish
 *     flip preserves an already-set published_at)
 *   - author byline + source provenance → moderation_log
 *   - images: matched against the Takeout Albums by filename, uploaded to R2
 *     (public-photo/{contentItemId}/{mediaId}/{filename}) with the same
 *     re-encode rules as lib/storage (sharp rotate/max-4000px/jpeg q85),
 *     and the post HTML srcs are rewritten to the R2 URLs (blogger's CDN
 *     is not in next/image remotePatterns, so hotlinks would break);
 *     unmatched images stay hotlinked and are reported
 *
 * Idempotent: keyed on content_items.import_source='blogger' +
 * import_source_id (migration 20260927000000_blogger_import.sql) — re-runs
 * skip already-imported posts.
 *
 * Videos: the local .mp4 files are not referenced by any post body and
 * exceed the 15 MB public-photo cap, so they are NOT imported; the summary
 * lists them for manual attachment via the admin media picker.
 *
 * Run:
 *   node scripts/import-blogger.mjs --dry-run          # parse + match only
 *   node scripts/import-blogger.mjs                    # import everything
 *   node scripts/import-blogger.mjs --limit 5          # pilot batch
 *   node scripts/import-blogger.mjs --media-only       # backfill R2 uploads
 *   node scripts/import-blogger.mjs --normalize-only   # restructure stored bodies
 *   node scripts/import-blogger.mjs --tags-only        # map feed labels → tags
 */
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { fileTypeFromBuffer } from "file-type";
import { randomUUID } from "node:crypto";

// --- env (same manual parse as scripts/seed-demo.mjs) ---
const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const get = (k) => {
    const m = env.match(new RegExp(`^${k}=(\\S+)`, "m"));
    return m?.[1];
};
const SUPA_URL = get("NEXT_PUBLIC_SUPABASE_URL");
const SUPA_KEY = get("SUPABASE_SERVICE_ROLE_KEY");
const R2 = {
    accountId: get("R2_ACCOUNT_ID"),
    accessKeyId: get("R2_ACCESS_KEY_ID"),
    secretAccessKey: get("R2_SECRET_ACCESS_KEY"),
    bucket: get("R2_BUCKET"),
    publicBaseUrl: get("R2_PUBLIC_BASE_URL"),
};
for (const [k, v] of Object.entries({ SUPA_URL, SUPA_KEY, ...R2 })) {
    if (!v) throw new Error(`Missing ${k} in .env`);
}

const db = createClient(SUPA_URL, SUPA_KEY, { auth: { persistSession: false } });
const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${R2.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true, // R2 has no virtual-hosted DNS — path-style only
    credentials: { accessKeyId: R2.accessKeyId, secretAccessKey: R2.secretAccessKey },
});
const r2PublicBase = R2.publicBaseUrl.replace(/\/$/, "");

// --- flags ---
const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const MEDIA_ONLY = args.includes("--media-only");
const NORMALIZE_ONLY = args.includes("--normalize-only");
const TAGS_ONLY = args.includes("--tags-only");
const limitIdx = args.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BLOGGER_DIR = join(root, "docs", "Blogger");

// --- helpers (mirror lib/admin/blogger.ts) ---
function unescapeXmlEntities(value) {
    // Takeout exports double-escape some fields (e.g. &amp;#39; in titles), so
    // iterate until the value is stable (bounded, like the shared parser).
    let out = value;
    for (let i = 0; i < 3; i++) {
        const next = out
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
            .replace(/&#x([0-9a-fA-F]+);/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
            .replace(/&amp;/g, "&");
        if (next === out) break;
        out = next;
    }
    return out;
}

function firstGroup(haystack, pattern) {
    const m = haystack.match(pattern);
    return m?.[1]?.trim() ? m[1].trim() : null;
}

function parseBloggerExport(xml) {
    const entries = xml.match(/<entry[\s>][\s\S]*?<\/entry\s*>/gi) ?? [];
    const posts = [];
    for (const entry of entries) {
        const kindTerms = [...entry.matchAll(/<category\b[^>]*\bterm=(["'])(.*?)\1/gi)].map((m) => m[2]);
        const isPost =
            kindTerms.some((t) => t.includes("kind#post")) ||
            /<blogger:type>\s*POST\s*<\/blogger:type>/i.test(entry);
        if (!isPost) continue;

        const rawTitle = firstGroup(entry, /<title\b[^>]*>([\s\S]*?)<\/title\s*>/i);
        const rawContent = firstGroup(entry, /<content\b[^>]*>([\s\S]*?)<\/content\s*>/i);
        const bodyCdata = rawContent?.startsWith("<![CDATA[")
            ? rawContent.replace(/^<!\[CDATA\[/, "").replace(/\]\]>$/, "")
            : rawContent ?? "";
        const bodyHtml = unescapeXmlEntities(bodyCdata).trim();

        const publishedAt = firstGroup(entry, /<published\b[^>]*>([\s\S]*?)<\/published\s*>/i);
        const updatedAt = firstGroup(entry, /<updated\b[^>]*>([\s\S]*?)<\/updated\s*>/i);
        const bloggerId = firstGroup(entry, /<id\b[^>]*>([\s\S]*?)<\/id\s*>/i);

        const labels = [...entry.matchAll(/<category\b[^>]*>/gi)]
            .map((m) => m[0])
            .filter((tag) => tag.includes("blogger.com/atom/ns"))
            .map((tag) => tag.match(/\bterm=(["'])(.*?)\1/i)?.[2]?.trim() ?? "")
            .filter(Boolean);

        const statusRaw = firstGroup(entry, /<blogger:status\b[^>]*>([\s\S]*?)<\/blogger:status\s*>/i);
        const filename = firstGroup(entry, /<blogger:filename\b[^>]*>([\s\S]*?)<\/blogger:filename\s*>/i);
        const metaDescription = firstGroup(entry, /<blogger:metaDescription\b[^>]*>([\s\S]*?)<\/blogger:metaDescription\s*>/i);
        const authorName = firstGroup(entry, /<author\b[^>]*>[\s\S]*?<name\b[^>]*>([\s\S]*?)<\/name\s*>/i);

        const textFallback = stripHtml(bodyHtml).split(/\s+/).slice(0, 8).join(" ").trim();
        const title = unescapeXmlEntities(rawTitle ?? "").trim() || textFallback || "Untitled import";

        posts.push({
            bloggerId: bloggerId ?? `${title}-${posts.length}`,
            title,
            bodyHtml,
            publishedAt: publishedAt && !Number.isNaN(Date.parse(publishedAt)) ? publishedAt : null,
            updatedAt: updatedAt && !Number.isNaN(Date.parse(updatedAt)) ? updatedAt : null,
            labels,
            status: statusRaw ? statusRaw.toUpperCase() : null,
            filename: filename ? unescapeXmlEntities(filename) : null,
            metaDescription: metaDescription ? unescapeXmlEntities(metaDescription) : null,
            authorName: authorName ? unescapeXmlEntities(authorName) : null,
        });
    }
    return posts;
}

function stripHtml(html) {
    return html
        .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
        .replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/\s+/g, " ")
        .trim();
}

function makeExcerpt(html, maxLength = 300) {
    const text = stripHtml(html);
    if (!text) return null;
    return text.length > maxLength ? `${text.slice(0, maxLength - 1).trimEnd()}…` : text;
}

function slugify(value) {
    return value
        .toLowerCase()
        .normalize("NFKD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80);
}

/** All http(s) img srcs (both quote styles), in order, de-duplicated. */
function extractImageUrls(html, max = 60) {
    const urls = [];
    for (const m of html.matchAll(/<img\b[^>]*\bsrc=(["'])(.*?)\1/gi)) {
        const url = m[2].trim();
        if (!/^https?:\/\//i.test(url)) continue;
        if (!urls.includes(url)) urls.push(url);
        if (urls.length >= max) break;
    }
    return urls;
}

// --- Takeout album index: normalized basename → local file ---
function walkFiles(dir) {
    let out = [];
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        let st;
        try { st = statSync(p); } catch { continue; }
        if (st.isDirectory()) out = out.concat(walkFiles(p));
        else out.push({ path: p, size: st.size });
    }
    return out;
}

/** "us10.jpg(1).jpg" / "photo (2).png" → "us10.jpg" / "photo.png" */
function stripDupSuffix(name) {
    return name.replace(/\((\d+)\)(\.[a-z0-9]+)$/i, "$2");
}

const albumsDir = join(BLOGGER_DIR, "Albums");
let albumFiles = [];
try {
    albumFiles = walkFiles(albumsDir);
} catch {
    console.error(`WARN: no Albums directory at ${albumsDir} — images will stay hotlinked.`);
}
const albumIndex = new Map(); // normalized basename → {path,size}
const albumIndexDup = new Map(); // normalized dedup-stripped basename → [{path,size}]
for (const f of albumFiles) {
    const b = basename(f.path).toLowerCase();
    if (b.endsWith(".json")) continue;
    const prev = albumIndex.get(b);
    if (!prev || f.size > prev.size) albumIndex.set(b, f);
    const stripped = stripDupSuffix(basename(f.path)).toLowerCase();
    if (stripped !== b) {
        const list = albumIndexDup.get(stripped) ?? [];
        list.push(f);
        albumIndexDup.set(stripped, list);
    }
}

function findLocalImage(url) {
    let name;
    try {
        name = decodeURIComponent(url.split("/").pop().split("?")[0]);
    } catch {
        return null;
    }
    if (!name || !/\.[a-z0-9]{2,5}$/i.test(name)) return null;
    const exact = albumIndex.get(name.toLowerCase());
    if (exact) return exact;
    const candidates = albumIndexDup.get(stripDupSuffix(name).toLowerCase());
    if (!candidates?.length) return null;
    return candidates.reduce((a, b) => (b.size > a.size ? b : a));
}

// --- media processing (mirror lib/storage/validate.ts image rules) ---
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_DIMENSION = 4000;
async function processImage(buffer) {
    const sniffed = await fileTypeFromBuffer(buffer);
    if (!sniffed || !sniffed.mime.startsWith("image/")) return null;
    const image = sharp(buffer, { failOn: "error" }).rotate();
    const resized = image.resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: "inside", withoutEnlargement: true });
    const isPng = sniffed.mime === "image/png";
    const output = isPng
        ? await resized.png({ compressionLevel: 9 }).toBuffer()
        : await resized.jpeg({ quality: 85 }).toBuffer();
    let finalBuf = output;
    if (finalBuf.byteLength > MAX_IMAGE_BYTES) {
        finalBuf = await sharp(output)
            .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
            .toBuffer();
        if (finalBuf.byteLength > MAX_IMAGE_BYTES) return null;
    }
    const meta = await sharp(finalBuf).metadata();
    return {
        buffer: finalBuf,
        mime: isPng ? "image/png" : "image/jpeg",
        width: meta.width ?? null,
        height: meta.height ?? null,
    };
}

async function uploadToR2(key, buffer, mime) {
    await s3.send(new PutObjectCommand({
        Bucket: R2.bucket,
        Key: key,
        Body: buffer,
        ContentType: mime,
        CacheControl: "public, max-age=31536000, immutable",
    }));
    return `${r2PublicBase}/${key}`;
}

function normalizeFilename(originalName) {
    const dot = originalName.lastIndexOf(".");
    const ext = dot >= 0 ? originalName.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "") : "";
    const base = (dot >= 0 ? originalName.slice(0, dot) : originalName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "file";
    return ext ? `${base}.${ext}` : base;
}

function slugFromPost(post) {
    const fromFilename = post.filename
        ? (post.filename.split("/").pop() ?? "").replace(/\.html?$/i, "")
        : "";
    return slugify(fromFilename || post.title) || "imported-post";
}

async function uniqueSlug(base) {
    for (let i = 1; i <= 50; i++) {
        const candidate = i === 1 ? base : `${base}-${i}`;
        const { data } = await db.from("content_items").select("id").eq("slug", candidate).limit(1);
        if (!data || data.length === 0) return candidate;
    }
    return `${base}-${Date.now()}`;
}

// Mirror of normalizeBloggerBody in lib/admin/blogger.ts — restructures
// Blogger's div-per-line composer HTML into semantic paragraphs (text-only
// <div> → <p>, spacer divs and block-edge <br>s dropped) so the `prose`
// container spaces imported bodies correctly. Sanitization stays at the
// render boundary (lib/security/html.ts). Idempotent.
const BLOCK_TAG = /<(?:div|p|table|ul|ol|dl|blockquote|pre|figure|h[1-6]|img|iframe|video|audio|hr)\b/i;

function normalizeBloggerBody(html) {
    if (!html || !html.trim()) return html ?? "";
    let out = html;
    out = out.replace(/<!--[\s\S]*?-->/g, "");
    const spacerDiv =
        /<div(?:\s[^>]*)?>(?:\s|<br\s*\/?>|&nbsp;|<span(?:\s[^>]*)?>|<\/span>)*<\/div>/gi;
    for (let pass = 0; pass < 20; pass++) {
        const next = out.replace(spacerDiv, "");
        if (next === out) break;
        out = next;
    }
    for (let pass = 0; pass < 20; pass++) {
        const next = out.replace(
            /<div(\s[^>]*)?>((?:(?!<div\b)[\s\S])*?)<\/div>/gi,
            (match, attrs, inner) => {
                if (BLOCK_TAG.test(inner)) return match;
                if (!inner.trim()) return "";
                return `<p${attrs ?? ""}>${inner}</p>`;
            },
        );
        if (next === out) break;
        out = next;
    }
    const cleanups = [
        [/<p(?:\s[^>]*)?>(?:\s|<br\s*\/?>|&nbsp;|<span(?:\s[^>]*)?>|<\/span>)*<\/p>/gi, ""],
        [/(<(?:p|li|blockquote|h[1-6]|td|div)[^>]*>)\s*(?:<br\s*\/?>\s*)+/gi, "$1"],
        [/(?:<br\s*\/?>\s*)+(<\/(?:p|li|blockquote|h[1-6]|td|div)\s*>)/gi, "$1"],
        [/(&nbsp;|\s)+(<\/(?:p|li|blockquote|h[1-6]|td|div)\s*>)/gi, "$2"],
        [/(?:<br\s*\/?>\s*)+$/i, ""],
    ];
    for (let pass = 0; pass < 20; pass++) {
        let next = out;
        for (const [pattern, replacement] of cleanups) next = next.replace(pattern, replacement);
        if (next === out) break;
        out = next;
    }
    for (let pass = 0; pass < 20; pass++) {
        const next = out.replace(/(^|>)(\s*<br\s*\/?>\s*)+(?=<)/g, (_match, edge) => edge);
        if (next === out) break;
        out = next;
    }
    return out.trim();
}

// Mirror of lib/admin/tags.ts ensureTag — find-or-create a tag by label.
async function ensureTagId(label) {
    const slug = slugify(label);
    if (!slug) return null;
    const { data: existing } = await db.from("tags").select("id").eq("slug", slug).limit(1);
    if (existing?.[0]) return existing[0].id;
    const { data: created, error } = await db.from("tags").insert({ slug }).select("id").single();
    if (error || !created) return null;
    await db.from("tag_translations").upsert(
        { tag_id: created.id, locale: "en", name: label.slice(0, 120) },
        { onConflict: "tag_id,locale" },
    );
    return created.id;
}

async function importPost(post) {
    // Normalize Blogger's div-per-line composer HTML into semantic paragraphs
    // before storing (mirror of lib/admin/blogger.ts normalizeBloggerBody).
    const bodyHtml = normalizeBloggerBody(post.bodyHtml).slice(0, 500_000);
    const slug = await uniqueSlug(slugFromPost(post));
    const isDraftPost = post.status === "DRAFT";
    const insert = {
        type: "news",
        slug,
        status: "draft",
        import_source: "blogger",
        import_source_id: post.bloggerId,
        // Live posts keep their original publish date (the admin publish flip
        // preserves an existing published_at); never-published Blogger drafts
        // keep published_at null like any native draft.
        ...(isDraftPost || !post.publishedAt ? {} : { published_at: post.publishedAt }),
    };
    const { data: created, error: createErr } = await db
        .from("content_items")
        .insert(insert)
        .select("id")
        .single();
    if (createErr || !created) throw new Error(`content_items: ${createErr?.message ?? "empty"}`);
    const contentId = created.id;

    try {
        const { error: tErr } = await db.from("content_translations").upsert(
            {
                content_item_id: contentId,
                locale: "en",
                voice: "formal",
                title: post.title.slice(0, 300),
                excerpt: makeExcerpt(bodyHtml),
                body: bodyHtml,
                seo_description: post.metaDescription,
                byline: post.authorName ?? null,
            },
            { onConflict: "content_item_id,locale,voice" },
        );
        if (tErr) throw new Error(`translation: ${tErr.message}`);

        // Source labels → tags (same mapping as the admin-UI import path).
        const seenTags = new Set();
        for (const label of post.labels ?? []) {
            const tagId = await ensureTagId(label);
            if (!tagId || seenTags.has(tagId)) continue;
            seenTags.add(tagId);
            await db.from("content_tags").upsert(
                { content_item_id: contentId, tag_id: tagId },
                { onConflict: "content_item_id,tag_id" },
            );
        }

        // Media: upload matched local images to R2, rewrite the HTML srcs.
        // An upload failure (e.g. a read-only R2 token) degrades that image
        // to a hotlink instead of failing the whole post — the --media-only
        // pass backfills uploads once the token is fixed.
        let body = bodyHtml;
        const urls = extractImageUrls(body);
        const mediaRows = [];
        let hotlinked = 0;
        for (const [i, rawUrl] of urls.entries()) {
            const url = rawUrl.replace(/&amp;/g, "&");
            const local = findLocalImage(url);
            if (!local) { hotlinked++; continue; }
            const buf = readFileSync(local.path);
            const processed = await processImage(buf);
            if (!processed) { hotlinked++; continue; }
            const mediaId = randomUUID();
            const key = `public-photo/${contentId}/${mediaId}/${normalizeFilename(basename(local.path))}`;
            let publicUrl;
            try {
                publicUrl = await uploadToR2(key, processed.buffer, processed.mime);
            } catch (e) {
                hotlinked++;
                hotlinkFallbacks.push({ slug, name: basename(local.path), reason: e.message });
                continue;
            }
            body = body.split(rawUrl).join(publicUrl);
            mediaRows.push({
                id: mediaId,
                content_item_id: contentId,
                kind: "image",
                provider: "r2",
                destination: "public_photo",
                storage_key: key,
                public_url: publicUrl,
                mime_type: processed.mime,
                file_size_bytes: processed.buffer.byteLength,
                width: processed.width,
                height: processed.height,
                sort_order: i,
                is_cover: mediaRows.length === 0,
            });
        }
        if (mediaRows.length > 0) {
            const { error: mErr } = await db.from("media_assets").insert(mediaRows);
            if (mErr) throw new Error(`media_assets: ${mErr.message}`);
        }
        if (body !== bodyHtml) {
            const { error: bErr } = await db
                .from("content_translations")
                .update({ body: body.slice(0, 500_000) })
                .eq("content_item_id", contentId)
                .eq("locale", "en")
                .eq("voice", "formal");
            if (bErr) throw new Error(`body rewrite: ${bErr.message}`);
        }

        await db.from("moderation_log").insert({
            action: "content:import:cli",
            content_item_id: contentId,
            notes: `news/${slug} source=${post.filename ?? "feed.atom"} bloggerId=${post.bloggerId} bloggerStatus=${post.status ?? "classic"} published=${post.publishedAt ?? "unknown"} author=${post.authorName ?? "unknown"}`,
        });

        return { slug, uploaded: mediaRows.length, hotlinked };
    } catch (e) {
        // roll the half-built item back so a retry doesn't collide on slugs
        await db.from("content_items").delete().eq("id", contentId);
        throw e;
    }
}

// Fallbacks recorded when an R2 upload is refused (read-only token etc.) —
// the image stays hotlinked and --media-only can retry later.
const hotlinkFallbacks = [];

// Backfill pass: for posts already imported by a previous run, upload the
// images that were left hotlinked (no local upload happened) and register
// the media rows. Run after fixing the R2 credentials:
//   node scripts/import-blogger.mjs --media-only
async function runMediaPass() {
    const pageSize = 50;
    let uploaded = 0, skipped = 0, page = 0;
    for (;;) {
        const { data: items, error } = await db
            .from("content_items")
            .select("id, slug, import_source_id")
            .eq("import_source", "blogger")
            .order("created_at", { ascending: true })
            .range(page * pageSize, page * pageSize + pageSize - 1);
        if (error) throw new Error(`content_items: ${error.message}`);
        if (!items?.length) break;
        page++;
        for (const item of items) {
            const post = postsByBloggerId.get(item.import_source_id);
            if (!post) { skipped++; continue; }
            const { data: existingMedia } = await db
                .from("media_assets")
                .select("id, sort_order")
                .eq("content_item_id", item.id)
                .order("sort_order", { ascending: true });
            const hasMedia = (existingMedia?.length ?? 0) > 0;
            const maxSort = existingMedia?.length
                ? Math.max(...existingMedia.map((m) => m.sort_order ?? 0))
                : -1;

            // Current body from the en translation (rewritten by earlier passes).
            const { data: tr } = await db
                .from("content_translations")
                .select("body")
                .eq("content_item_id", item.id)
                .eq("locale", "en")
                .eq("voice", "formal")
                .limit(1);
            const body = tr?.[0]?.body ?? post.bodyHtml;
            if (!body) { skipped++; continue; }

            let newBody = body;
            const rows = [];
            const urls = extractImageUrls(body);
            let nextSort = maxSort + 1;
            for (const rawUrl of urls) {
                const url = rawUrl.replace(/&amp;/g, "&");
                // Skip urls already pointing at our own storage.
                if (url.startsWith(r2PublicBase)) continue;
                const local = findLocalImage(url);
                if (!local) continue;
                const buf = readFileSync(local.path);
                const processed = await processImage(buf);
                if (!processed) continue;
                const mediaId = randomUUID();
                const key = `public-photo/${item.id}/${mediaId}/${normalizeFilename(basename(local.path))}`;
                let publicUrl;
                try {
                    publicUrl = await uploadToR2(key, processed.buffer, processed.mime);
                } catch (e) {
                    console.error(`  upload failed (${item.slug}/${basename(local.path)}): ${e.message}`);
                    continue;
                }
                newBody = newBody.split(rawUrl).join(publicUrl);
                rows.push({
                    id: mediaId,
                    content_item_id: item.id,
                    kind: "image",
                    provider: "r2",
                    destination: "public_photo",
                    storage_key: key,
                    public_url: publicUrl,
                    mime_type: processed.mime,
                    file_size_bytes: processed.buffer.byteLength,
                    width: processed.width,
                    height: processed.height,
                    sort_order: nextSort,
                    is_cover: !hasMedia && rows.length === 0,
                });
                nextSort++;
            }
            if (rows.length === 0) { skipped++; continue; }
            const { error: mErr } = await db.from("media_assets").insert(rows);
            if (mErr) { console.error(`  media insert failed (${item.slug}): ${mErr.message}`); continue; }
            if (newBody !== body) {
                await db.from("content_translations")
                    .update({ body: newBody.slice(0, 500_000) })
                    .eq("content_item_id", item.id)
                    .eq("locale", "en")
                    .eq("voice", "formal");
            }
            uploaded += rows.length;
            console.log(`  ${item.slug}: +${rows.length} media`);
        }
        console.log(`  … page ${page} done (${uploaded} uploaded so far)`);
    }
    console.log(`\nMedia pass complete: ${uploaded} uploaded, ${skipped} skipped.`);
}

// Backfill pass: normalize the stored bodies of posts already imported by a
// previous run — older imports stored Blogger's raw div-per-line HTML, which
// the `prose` container renders as one unspaced wall of text. Idempotent.
//   node scripts/import-blogger.mjs --normalize-only
async function runNormalizePass() {
    let changed = 0, scanned = 0, page = 0;
    const pageSize = 50;
    for (;;) {
        const { data: items, error } = await db
            .from("content_items")
            .select("id, slug")
            .eq("import_source", "blogger")
            .order("created_at", { ascending: true })
            .range(page * pageSize, page * pageSize + pageSize - 1);
        if (error) throw new Error(`content_items: ${error.message}`);
        if (!items?.length) break;
        page++;
        for (const item of items) {
            const { data: tr } = await db
                .from("content_translations")
                .select("body")
                .eq("content_item_id", item.id)
                .eq("locale", "en")
                .eq("voice", "formal")
                .limit(1);
            const body = tr?.[0]?.body;
            if (!body) continue;
            scanned++;
            const next = normalizeBloggerBody(body);
            if (next === body) continue;
            const { error: uErr } = await db
                .from("content_translations")
                .update({ body: next.slice(0, 500_000) })
                .eq("content_item_id", item.id)
                .eq("locale", "en")
                .eq("voice", "formal");
            if (uErr) {
                console.error(`  ${item.slug}: ${uErr.message}`);
                continue;
            }
            changed++;
        }
        console.log(`  … page ${page} done (${changed} rewritten so far)`);
    }
    console.log(`\nNormalize pass: ${scanned} bodies scanned, ${changed} rewritten.`);
}

// Backfill pass: map the source feed's labels to tags for posts imported by
// an older CLI revision (the admin-UI import path always created tags).
//   node scripts/import-blogger.mjs --tags-only
async function runTagsPass() {
    let tagged = 0, skipped = 0, page = 0;
    const pageSize = 50;
    for (;;) {
        const { data: items, error } = await db
            .from("content_items")
            .select("id, slug, import_source_id")
            .eq("import_source", "blogger")
            .order("created_at", { ascending: true })
            .range(page * pageSize, page * pageSize + pageSize - 1);
        if (error) throw new Error(`content_items: ${error.message}`);
        if (!items?.length) break;
        page++;
        for (const item of items) {
            const post = postsByBloggerId.get(item.import_source_id);
            if (!post || !post.labels?.length) { skipped++; continue; }
            const seen = new Set();
            let added = 0;
            for (const label of post.labels) {
                const tagId = await ensureTagId(label);
                if (!tagId || seen.has(tagId)) continue;
                seen.add(tagId);
                const { error: cErr } = await db
                    .from("content_tags")
                    .upsert(
                        { content_item_id: item.id, tag_id: tagId },
                        { onConflict: "content_item_id,tag_id" },
                    );
                if (cErr) {
                    console.error(`  ${item.slug}: ${cErr.message}`);
                    continue;
                }
                added++;
            }
            if (added > 0) {
                tagged++;
                console.log(`  ${item.slug}: +${added} tags`);
            }
        }
    }
    console.log(`\nTags pass: ${tagged} posts tagged, ${skipped} skipped (no labels in the feed).`);
}

// __CHUNK8__

// Parsed feed state (shared by the import run and the --media-only pass).
let allPosts = [];
const postsByBloggerId = new Map();

async function main() {
    const feedPath = join(BLOGGER_DIR, "Blogs", "EAGLE EYE AFRICA", "feed.atom");
    const xml = readFileSync(feedPath, "utf8");
    allPosts = parseBloggerExport(xml);
    for (const p of allPosts) postsByBloggerId.set(p.bloggerId, p);
    const posts = allPosts;
    console.log(`Parsed ${posts.length} posts from ${feedPath.replace(root + "\\", "")}`);
    const live = posts.filter((p) => p.status !== "DRAFT");
    const drafts = posts.filter((p) => p.status === "DRAFT");
    console.log(`  LIVE: ${live.length}, DRAFT: ${drafts.length}`);

    if (MEDIA_ONLY) {
        if (DRY) { console.log("--media-only ignores --dry-run"); }
        await runMediaPass();
        return;
    }

    if (NORMALIZE_ONLY) {
        if (DRY) { console.log("--normalize-only ignores --dry-run"); }
        await runNormalizePass();
        return;
    }

    if (TAGS_ONLY) {
        if (DRY) { console.log("--tags-only ignores --dry-run"); }
        await runTagsPass();
        return;
    }

    // Idempotency: skip posts already imported by a previous run.
    const ids = posts.map((p) => p.bloggerId);
    const existing = new Set();
    for (let i = 0; i < ids.length; i += 100) {
        const { data } = await db
            .from("content_items")
            .select("import_source_id")
            .eq("import_source", "blogger")
            .in("import_source_id", ids.slice(i, i + 100));
        for (const row of data ?? []) existing.add(row.import_source_id);
    }
    const fresh = posts.filter((p) => !existing.has(p.bloggerId));
    const skipped = posts.length - fresh.length;
    if (skipped > 0) console.log(`Skipping ${skipped} already-imported posts.`);

    if (DRY) {
        let localMatch = 0, remoteOnly = 0;
        const unmatched = [];
        for (const p of posts) {
            for (const url of extractImageUrls(p.bodyHtml)) {
                if (findLocalImage(url)) localMatch++;
                else {
                    remoteOnly++;
                    if (unmatched.length < 10) unmatched.push(url.slice(0, 110));
                }
            }
        }
        console.log(`DRY RUN — images: ${localMatch} matched in Albums, ${remoteOnly} remote-only (stay hotlinked)`);
        console.log("sample unmatched:", unmatched);
        console.log("sample slugs:", fresh.slice(0, 5).map((p) => slugFromPost(p)).join(", "));
        console.log(`Would import ${fresh.length} drafts.`);
        return;
    }

    let imported = 0, failed = 0, uploadedTotal = 0, hotlinkedTotal = 0;
    const failures = [];
    const batch = fresh.slice(0, LIMIT === Infinity ? fresh.length : LIMIT);

    for (const post of batch) {
        try {
            const res = await importPost(post);
            imported++;
            uploadedTotal += res.uploaded;
            hotlinkedTotal += res.hotlinked;
            if (imported % 10 === 0) console.log(`  … ${imported}/${batch.length} imported (${uploadedTotal} images uploaded)`);
        } catch (e) {
            failed++;
            failures.push(`${post.title.slice(0, 60)} — ${e.message}`);
            console.error(`FAIL: ${post.title.slice(0, 60)} — ${e.message}`);
        }
    }

    console.log(`\nImported: ${imported} drafts | images uploaded to R2: ${uploadedTotal} | still hotlinked: ${hotlinkedTotal} | failed: ${failed}`);
    if (hotlinkFallbacks.length > 0) {
        const reasons = new Set(hotlinkFallbacks.map((f) => f.reason));
        console.log(`\nR2 uploads refused (${hotlinkFallbacks.length} images fell back to hotlinks): ${[...reasons].join("; ")}`);
        console.log("→ Fix the R2 token (needs Object Read & Write), then run: node scripts/import-blogger.mjs --media-only");
    }
    if (failures.length) {
        console.log("Failures:");
        for (const f of failures) console.log("  " + f);
    }
    const unusedVideos = [];
    try {
        const blogDir = join(BLOGGER_DIR, "Blogs", "EAGLE EYE AFRICA");
        for (const name of readdirSync(blogDir)) {
            if (/\.(mp4|mov|webm)$/i.test(name)) unusedVideos.push(`${name} (${(statSync(join(blogDir, name)).size / 1048576).toFixed(0)} MB)`);
        }
    } catch { /* no blog dir */ }
    if (unusedVideos.length) {
        console.log(`\nVideos not imported (not referenced by any post body; attach via /admin MediaPicker):`);
        for (const v of unusedVideos) console.log("  " + v);
    }
}

main().catch((e) => {
    console.error("IMPORT FAILED:", e);
    process.exit(1);
});





