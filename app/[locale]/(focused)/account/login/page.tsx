import type { Metadata } from "next";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath, safeNextPath } from "@/lib/i18n/urls";
import { LoginForm } from "./login-form";

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export async function generateMetadata(): Promise<Metadata> {
    const locale = await getRequestLocale();
    return {
        title: getDictionary(locale).auth.login.title,
        robots: { index: false, follow: false },
    };
}

/**
 * Focused login screen (checklist items 2/3/4/6): minimal chrome, a back
 * path from the shell, localized copy, and a validated `next` that is
 * forwarded to /auth/landing (which honors it after role resolution).
 */
export default async function LoginPage({ searchParams }: Props) {
    const locale = await getRequestLocale();
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
            />
        </div>
    );
}
