import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { acceptLanguageLocale, isLocalePrefixed } from "@/lib/i18n/urls";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { createClient } from "@supabase/supabase-js";

/**
 * Next.js 16 request proxy (formerly middleware.ts).
 *
 * 1. Locale-first routing enforcement — THE single redirect mechanism for
 *    unprefixed URLs. Every user-facing URL is 307-redirected to
 *    /{locale}{path} (query string preserved; cookie → Accept-Language → en).
 *    Root paths never render content; localized routes under app/[locale] are
 *    the only canonical homes of pages.
 * 2. Refreshes the Supabase auth session cookie on every request.
 * 3. Resolves the active locale and exposes it via the x-locale header.
 *    (Shells are static route-group decisions — no runtime shell header.)
 *
 * Exemptions (never locale-redirected): /api/*, /auth/callback (Supabase
 * email links — the route handler redirects into the cookie's locale itself),
 * sitemap.xml, robots.txt, favicon and any asset-like path. The legacy
 * redirect table is consulted BEFORE these exemptions — Blogger-era paths end
 * in an extension and would otherwise never reach their canonical home.
 */

/**
 * Legacy/old URL redirects — loaded from the `legacy_redirects` table.
 * Cached in memory with a short TTL so the proxy stays fast.
 * Phase 5 (audit A14): Blogger-era URLs (/YYYY/MM/slug.html) redirect to
 * their new canonical localized paths.
 */
let legacyRedirectsCache: Record<string, string> | null = null;
let legacyRedirectsCacheAt = 0;
const LEGACY_REDIRECTS_TTL_MS = 5 * 60 * 1000; // 5 minutes

async function getLegacyRedirects(): Promise<Record<string, string>> {
  const now = Date.now();
  if (legacyRedirectsCache && now - legacyRedirectsCacheAt < LEGACY_REDIRECTS_TTL_MS) {
    return legacyRedirectsCache;
  }
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(url, key);
    const { data, error } = await supabase
      .from("legacy_redirects")
      .select("from_path, to_path");
    if (error) {
      // Negative-cache the miss for one TTL so a missing/unreachable table
      // doesn't re-query + log on EVERY request (verified 2026-09-23: the
      // table is absent until the legacy_redirects migration is pushed, which
      // spammed one error line per request). PGRST205 (absent from the
      // PostgREST schema cache) is an expected state on lagging DBs, so it
      // stays silent; anything else still warns. Either way the proxy fails
      // open — legacy URLs just don't redirect until the table exists.
      legacyRedirectsCacheAt = now;
      if (error.code !== "PGRST205") {
        console.error("[proxy] failed to load legacy redirects:", error.message);
      }
      return legacyRedirectsCache ?? {};
    }
    const map: Record<string, string> = {};
    for (const row of data ?? []) {
      map[row.from_path] = row.to_path;
    }
    legacyRedirectsCache = map;
    legacyRedirectsCacheAt = now;
    return map;
  } catch {
    return legacyRedirectsCache ?? {};
  }
}

function isExemptFromLocaleRedirect(pathname: string): boolean {
    return (
        pathname.startsWith("/api") ||
        pathname.startsWith("/auth/callback") ||
        pathname === "/sitemap.xml" ||
        pathname === "/robots.txt" ||
        pathname === "/favicon.ico" ||
        /\.[a-zA-Z0-9]+$/.test(pathname)
    );
}

/**
 * P1 IA consolidation redirects (merged audit: Professionals MERGE-lite into
 * Places). The storefront product is cut — header/footer no longer link it —
 * so deep links land on the town square instead of a removed directory:
 *   /professionals / {en,fr}/professionals → /{locale}/locations
 *   /professionals/<slug> → /{locale}/locations (storefront detail)
 * Explicitly NOT matched: /professionals/claim (claim intake stays alive).
 * DB-backed `legacy_redirects` remain the mechanism for Blogger-era URLs and
 * any future IA moves; this static map covers only the P1 product cut.
 */
function iaConsolidationTarget(pathname: string): string | null {
    const stripped = pathname.replace(/^\/(en|fr)(?=\/|$)/, "") || "/";
    if (stripped === "/professionals") return "/locations";
    if (stripped.startsWith("/professionals/")) {
        const rest = stripped.slice("/professionals/".length).split("/")[0];
        if (rest && rest !== "claim") return "/locations";
        return null;
    }
    return null;
}

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
    const negotiated: Locale =
        cookieLocale === "fr" || cookieLocale === "en"
            ? cookieLocale
            : acceptLanguageLocale(request.headers.get("accept-language"));

    // 0. Legacy redirects (Phase 5 / audit A14) — applied before the locale
    //    redirect AND before the asset-like exemption, because every
    //    Blogger-era source path (/YYYY/MM/slug.html) ends in an extension.
    //    Gating this lookup behind isExemptFromLocaleRedirect() made the whole
    //    legacy_redirects table unreachable: every old URL 404'd instead of
    //    redirecting to its canonical localized home. The lookup is an
    //    in-memory Map behind a 5-minute TTL, so this stays off the hot path.
    //    308 (permanent, method-preserving) — the move is permanent; 307 told
    //    crawlers to keep the dead URL indexed.
    {
        const legacyRedirects = await getLegacyRedirects();
        const legacy = legacyRedirects[pathname];
        if (legacy) {
            const url = request.nextUrl.clone();
            url.pathname = `/${negotiated}${legacy}`;
            const redirect = NextResponse.redirect(url, 308);
            if (!cookieLocale) {
                redirect.cookies.set(LOCALE_COOKIE, negotiated, {
                    path: "/",
                    maxAge: 31536000,
                    sameSite: "lax",
                });
            }
            return redirect;
        }
    }

    // 1. Locale-first redirect for unprefixed URLs (single mechanism).
    if (!isLocalePrefixed(pathname) && !isExemptFromLocaleRedirect(pathname)) {
        // P1 product-cut redirect applies before locale-prefixing so both
        // /professionals and /en/professionals converge on /{locale}/locations.
        const iaTarget = iaConsolidationTarget(pathname);
        const target = iaTarget ?? (pathname === "/" ? "" : pathname);
        const url = request.nextUrl.clone();
        url.pathname = `/${negotiated}${target}`;
        const redirect = NextResponse.redirect(url, iaTarget ? 308 : 307);
        // Persist a first-visit choice only — never overwrite an explicit
        // language choice (the switcher owns the cookie after that).
        if (!cookieLocale) {
            redirect.cookies.set(LOCALE_COOKIE, negotiated, {
                path: "/",
                maxAge: 31536000,
                sameSite: "lax",
            });
        }
        return redirect;
    }

    // 1b. P1 product-cut redirect for locale-prefixed URLs (e.g.
    // /en/professionals/some-shop → /en/locations). Runs after the
    // unprefixed branch; locale is preserved from the URL itself.
    if (isLocalePrefixed(pathname)) {
        const iaTarget = iaConsolidationTarget(pathname);
        if (iaTarget) {
            const prefix = /^\/(en|fr)(?=\/|$)/.exec(pathname);
            const locale: Locale = prefix ? (prefix[1] as Locale) : negotiated;
            const url = request.nextUrl.clone();
            url.pathname = `/${locale}${iaTarget}`;
            url.search = "";
            return NextResponse.redirect(url, 308);
        }
    }

    // 2./3. Session refresh + locale/shell headers for the matched route.
    const prefix = /^\/(en|fr)(?=\/|$)/.exec(pathname);
    const locale: Locale = prefix ? (prefix[1] as Locale) : negotiated;

    // A4: anonymous fast path — Supabase SSR stores the session in
    // `sb-<ref>-auth-token*` cookies, so their absence means there is no
    // session to refresh. Skipping updateSession() avoids client
    // construction plus a getUser() round-trip on every anonymous/static
    // hit; the x-locale header is still set below. Authenticated requests
    // always carry the cookie (expired or not), so refresh still runs.
    const hasSessionCookie = request.cookies
        .getAll()
        .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
    const response = hasSessionCookie
        ? await updateSession(request)
        : NextResponse.next({ request });
    response.headers.set("x-locale", locale);

    return response;
}

export const config = {
    matcher: [
        /*
         * Match all request paths except:
         * - _next/static, _next/image
         * - favicon.ico and other static assets (svg, png, jpg, etc.)
         */
        "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};