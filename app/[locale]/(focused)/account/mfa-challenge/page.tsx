import type { Metadata } from "next";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { safeNextPath } from "@/lib/i18n/urls";
import { MfaChallengeForm } from "./mfa-challenge-form";

type Props = {
    params: Promise<{ locale: string }>;
    searchParams: Promise<{ next?: string | string[] }>;
};

export async function generateMetadata({ params }: { params: Props["params"] }): Promise<Metadata> {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    return {
        title: getDictionary(locale).auth.mfa.challengeTitle,
        robots: { index: false, follow: false },
    };
}

/**
 * Second step for TOTP-enrolled accounts: the password sign-in lands here
 * (aal1 session) instead of the app; a correct 6-digit code completes the
 * step-up to aal2 and continues to `next` (or the role landing).
 *
 * Phase 1: locale comes from params (static-compatible), not headers().
 */
export default async function MfaChallengePage({ params, searchParams }: Props) {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
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
