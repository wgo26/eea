/**
 * Sitemap route verification (audit §3.2 remediation).
 *
 * Checks every STATIC_PATHS entry in app/sitemap.ts against the App Router
 * manifest under app/[locale]/... without needing a database:
 *   - static paths must resolve to an existing route segment (page.tsx), and
 *   - dynamic detail segments (e.g. /news/[slug]) must exist for the
 *     SEGMENT_BY_TYPE prefixes (/news, /photo-stories, /culture, /buy-sell,
 *     /notices, /locations, /contributors).
 *
 * Usage: node scripts/verify-sitemap.mjs  (exit 1 on any mismatch so CI gates)
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sitemapSrc = readFileSync(join(root, "app", "sitemap.ts"), "utf8");

function extractStaticPaths(src) {
    const m = src.match(/const STATIC_PATHS = \[([\s\S]*?)\];/);
    if (!m) throw new Error("STATIC_PATHS block not found in app/sitemap.ts");
    return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function extractSegments(src) {
    const m = src.match(/const SEGMENT_BY_TYPE[^=]*= \{([\s\S]*?)\};/);
    if (!m) return [];
    return [...m[1].matchAll(/:\s*"([^"]+)"/g)].map((x) => x[1]);
}

// Candidate route roots: locale group dirs + shared parallel slots.
const ROUTE_ROOTS = [
    "app/[locale]/(public)",
    "app/[locale]/(focused)",
    "app/[locale]/(app)",
    "app/[locale]",
];

function routeExists(publicPath) {
    // "/" maps to the public landing page.
    if (publicPath === "/") {
        return ROUTE_ROOTS.some((r) => existsSync(join(root, r, "page.tsx")));
    }
    const rel = publicPath.replace(/^\//, "");
    return ROUTE_ROOTS.some((r) => existsSync(join(root, r, rel, "page.tsx")));
}

function dynamicPrefixCovered(prefix) {
    const rel = prefix.replace(/^\//, "");
    return ROUTE_ROOTS.some((r) => {
        const base = join(root, r, rel);
        if (!existsSync(base)) return false;
        // A detail route exists when any child dir holds a page (e.g. [slug]).
        try {
            return readdirSync(base, { withFileTypes: true }).some(
                (e) => e.isDirectory() && existsSync(join(base, e.name, "page.tsx")),
            );
        } catch {
            return false;
        }
    });
}

let failures = 0;
for (const p of extractStaticPaths(sitemapSrc)) {
    if (!routeExists(p)) {
        console.log(`MISSING route for sitemap path: ${p}`);
        failures++;
    }
}
for (const seg of extractSegments(sitemapSrc)) {
    if (!dynamicPrefixCovered(seg)) {
        console.log(`MISSING dynamic detail route for segment: ${seg}`);
        failures++;
    }
}

if (failures === 0) {
    console.log("Sitemap routes verified: all static paths + dynamic segments resolve.");
} else {
    console.log(`\n${failures} finding(s)`);
    process.exit(1);
}
