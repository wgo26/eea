import type { Metadata } from "next";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath, safeNextPath } from "@/lib/i18n/urls";
import { SignupForm } from "./signup-form";

type Props = { searchParams: Promise<{ next?: string | string[] }> };

export async function generateMetadata(): Promise<Metadata> {
    const locale = await getRequestLocale();
    return {
        title: getDictionary(locale).auth.signup.title,
        robots: { index: false, follow: false },
    };
}

export default async function SignupPage({ searchParams }: Props) {
    const locale = await getRequestLocale();
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
            />
        </div>
    );
}