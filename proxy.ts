import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { acceptLanguageLocale, isLocalePrefixed } from "@/lib/i18n/urls";
import { LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";

/**
 * Next.js 16 request proxy (formerly middleware.ts).
 *
 * 1. Locale-first routing enforcement — THE single redirect mechanism for
 *    unprefixed URLs. Every user-facing URL is 307-redirected to
 *    /{locale}{path} (query string preserved; cookie → Accept-Language → en).
 *    Root paths never render content; localized routes under app/[locale] are
 *    the only canonical homes of pages.
 * 2. Refreshes the Supabase auth session cookie on every request.
 * 3. Resolves the active locale and UI shell and exposes them via the
 *    x-locale / x-app-shell request headers.
 *
 * Exemptions (never locale-redirected): /api/*, /auth/callback (Supabase
 * email links — the route handler redirects into the cookie's locale itself),
 * sitemap.xml, robots.txt, favicon and any asset-like path.
 */

/**
 * Legacy/old URL redirects — one table, one place. Applied before the locale
 * redirect so an old URL lands on its new localized equivalent directly.
 * Add pre-launch URLs here rather than scattering ad-hoc redirects.
 */
const LEGACY_REDIRECTS: Record<string, string> = {};

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

export async function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
    const negotiated: Locale =
        cookieLocale === "fr" || cookieLocale === "en"
            ? cookieLocale
            : acceptLanguageLocale(request.headers.get("accept-language"));

    // 1. Locale-first redirect for unprefixed URLs (single mechanism).
    if (!isLocalePrefixed(pathname) && !isExemptFromLocaleRedirect(pathname)) {
        const legacy = LEGACY_REDIRECTS[pathname];
        const target = legacy ?? (pathname === "/" ? "" : pathname);
        const url = request.nextUrl.clone();
        url.pathname = `/${negotiated}${target}`;
        const redirect = NextResponse.redirect(url, 307);
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

    // 2./3. Session refresh + locale/shell headers for the matched route.
    const prefix = /^\/(en|fr)(?=\/|$)/.exec(pathname);
    const locale: Locale = prefix ? (prefix[1] as Locale) : negotiated;
    const routePath = prefix ? pathname.replace(/^\/(?:en|fr)/, "") || "/" : pathname;

    const shell = routePath.startsWith("/admin")
        ? "admin"
        : routePath.startsWith("/account") || routePath.startsWith("/auth")
            ? "auth"
            : "public";

    const response = await updateSession(request);
    response.headers.set("x-locale", locale);
    response.headers.set("x-app-shell", shell);

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