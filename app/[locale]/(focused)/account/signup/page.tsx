import type { Metadata } from "next";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { localePath, safeNextPath } from "@/lib/i18n/urls";
import { SignupForm } from "./signup-form";
import { enabledOAuthProviders } from "@/lib/auth/oauth";

type Props = {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ next?: string | string[] }>;
};

export async function generateMetadata({ params }: { params: Props["params"] }): Promise<Metadata> {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    return {
        title: getDictionary(locale).auth.signup.title,
        robots: { index: false, follow: false },
    };
};

/** Phase 1: locale comes from params (static-compatible), not headers(). */
export default async function SignupPage({ params, searchParams }: Props) {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);
    const { next: rawNext } = await searchParams;
    const nextParam = Array.isArray(rawNext) ? rawNext[0] : rawNext;
    // Carried through signup → login so the journey resumes after confirming.
    // Empty lets /auth/landing fall back to the role landing instead of
    // masking staff as members on direct signups.
    const nextPath = safeNextPath(nextParam, locale) ?? "";

    return (
        <div className="w-full max-w-md">
            <SignupForm
                copy={dict.auth.signup}
                nextPath={nextPath}
                loginHref={localePath(locale, "/account/login")}
                providers={enabledOAuthProviders()}
            />
        </div>
    );
}