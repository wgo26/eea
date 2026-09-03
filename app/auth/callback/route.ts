import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LOCALE_COOKIE, defaultLocale, type Locale } from "@/lib/i18n/config";
import { localePath, safeNextPath } from "@/lib/i18n/urls";

/**
 * Supabase auth callback — exchanges the auth code for a session
 * (email confirmation, magic link, password recovery) and redirects onward.
 *
 * This handler is exempt from the proxy's locale redirect (email links must
 * work verbatim); instead it redirects into the locale the user's cookie
 * holds, so email-link landings never switch the reader's language
 * (checklist item 9).
 */
function cookieLocale(request: NextRequest): Locale {
    const value = request.cookies.get(LOCALE_COOKIE)?.value;
    return value === "fr" ? "fr" : value === "en" ? "en" : defaultLocale;
}

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const locale = cookieLocale(request);

    // `next` must be a same-origin absolute path, re-prefixed with the
    // cookie's locale — never an external URL.
    const next =
        safeNextPath(searchParams.get("next"), locale) ??
        localePath(locale, "/auth/landing");

    if (code) {
        const supabase = await createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
            return NextResponse.redirect(`${origin}${next}`);
        }
    }

    return NextResponse.redirect(
        `${origin}${localePath(locale, "/auth/auth-code-error")}`,
    );
}