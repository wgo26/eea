import type { Metadata } from "next";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { localePath, safeNextPath } from "@/lib/i18n/urls";
import { LoginForm } from "./login-form";
import { enabledOAuthProviders } from "@/lib/auth/oauth";

type Props = {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ next?: string | string[] }>;
};

export async function generateMetadata({ params }: { params: Props["params"] }): Promise<Metadata> {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    return {
        title: getDictionary(locale).auth.login.title,
        robots: { index: false, follow: false },
    };
}

/**
 * Focused login screen (checklist items 2/3/4/6): minimal chrome, a back
 * path from the shell, localized copy, and a validated `next` that is
 * forwarded to /auth/landing (which honors it after role resolution).
 *
 * Phase 1: locale comes from params (static-compatible), not headers().
 */
export default async function LoginPage({ params, searchParams }: Props) {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    const { next: rawNext } = await searchParams;
    const nextParam = Array.isArray(rawNext) ? rawNext[0] : rawNext;
    // Pass through only an explicit `next`; empty lets /auth/landing fall back
    // to the role landing (staff → /admin/dashboard). Defaulting here to
    // /account/dashboard would mask the admin role on every direct login.
    const nextPath = safeNextPath(nextParam, locale) ?? "";

    return (
        <div className="w-full max-w-md">
            <LoginForm
                copy={dict.auth.login}
                nextPath={nextPath}
                resetHref={localePath(locale, "/account/reset-password")}
                signupHref={localePath(locale, "/account/signup")}
                providers={enabledOAuthProviders()}
            />
        </div>
    );
}
