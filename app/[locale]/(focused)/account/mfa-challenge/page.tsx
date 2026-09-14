import type { Metadata } from "next";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { safeNextPath } from "@/lib/i18n/urls";
import { MfaChallengeForm } from "./mfa-challenge-form";

export async function generateMetadata(): Promise<Metadata> {
    const locale = await getRequestLocale();
    return {
        title: getDictionary(locale).auth.mfa.challengeTitle,
        robots: { index: false, follow: false },
    };
}

/**
 * Second step for TOTP-enrolled accounts: the password sign-in lands here
 * (aal1 session) instead of the app; a correct 6-digit code completes the
 * step-up to aal2 and continues to `next` (or the role landing).
 */
export default async function MfaChallengePage({
    searchParams,
}: {
    searchParams: Promise<{ next?: string | string[] }>;
}) {
    const locale = await getRequestLocale();
    const dict = getDictionary(locale);
    const { next: rawNext } = await searchParams;
    const nextParam = Array.isArray(rawNext) ? rawNext[0] : rawNext;
    const nextPath = safeNextPath(nextParam, locale) ?? "";

    return (
        <div className="w-full max-w-md">
            <MfaChallengeForm copy={dict.auth.mfa} nextPath={nextPath} />
        </div>
    );
}
