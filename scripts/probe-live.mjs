/**
 * Read-only production probe (audit W4) — validates the live deployment's
 * public posture WITHOUT credentials or writes:
 *
 *   1. /            → 200 + security headers (CSP, HSTS, X-Frame-Options…)
 *   2. /api/health  → liveness stays green during a DB outage by design
 *   3. /api/ready   → readiness (Supabase + R2 reachable)
 *   4. /robots.txt + /sitemap.xml → SEO plumbing
 *   5. legacy_redirects (via the public anon key from .env, read-only) →
 *      fetches up to two real legacy Blogger URLs and reports the status.
 *      Expect 308 → localized canonical after audit D1/W1; 404 = D1 live.
 *
 * Run: node scripts/probe-live.mjs      (reads .env; prints no secrets)
 */
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env", import.meta.url), "utf8");
const get = (k) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim();

const site = (get("NEXT_PUBLIC_SITE_URL") || "").replace(/\/+$/, "");
console.log("SITE_URL:", site || "(unset)");
if (!site) process.exit(1);

const headerNames = (r) =>
    [...r.headers.entries()]
        .filter(([k]) =>
            /content-security-policy|strict-transport|x-frame-options|referrer-policy|x-content-type/i.test(k),
        )
        .map(([k]) => k)
        .join(",") || "NONE";

const paths = ["/", "/api/health", "/api/ready", "/robots.txt", "/sitemap.xml"];
for (const p of paths) {
    try {
        const r = await fetch(site + p, { redirect: "manual" });
        console.log(
            `${p} → ${r.status} | security-headers: ${headerNames(r)}` +
                (r.headers.get("location") ? ` | location: ${r.headers.get("location")}` : ""),
        );
    } catch (err) {
        console.log(`${p} → ERROR ${String(err?.message ?? err).slice(0, 140)}`);
    }
}

// Legacy redirect spot-check (read-only REST read with the PUBLIC anon key).
const su = get("NEXT_PUBLIC_SUPABASE_URL");
const ak = get("NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (su && ak) {
    try {
        const res = await fetch(
            `${su}/rest/v1/legacy_redirects?select=from_path,to_path&limit=2`,
            { headers: { apikey: ak, Authorization: `Bearer ${ak}` } },
        );
        const rows = (await res.json().catch(() => [])) ?? [];
        for (const row of Array.isArray(rows) ? rows.slice(0, 2) : []) {
            const r = await fetch(site + row.from_path, { redirect: "manual" });
            console.log(
                `legacy ${row.from_path} → ${r.status}` +
                    (r.headers.get("location") ? ` → ${r.headers.get("location")}` : " (no location header)"),
            );
        }
        if (!Array.isArray(rows) || rows.length === 0) {
            console.log("legacy_redirects: table reachable but empty (or unreadable) — nothing to probe");
        }
    } catch (err) {
        console.log("legacy_redirects probe skipped:", String(err?.message ?? err).slice(0, 140));
    }
} else {
    console.log("legacy_redirects probe skipped: anon key not configured in .env");
}
