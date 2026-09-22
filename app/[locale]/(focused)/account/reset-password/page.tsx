import type { Metadata } from "next";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";
import { ResetRequestForm } from "./reset-request-form";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    return {
        title: getDictionary(locale).auth.reset.requestTitle,
        robots: { index: false, follow: false },
    };
}

/**
 * Focused reset-request screen (replaces the old Placeholder): emails a
 * recovery link through /auth/callback, which lands the user on the
 * localized "set a new password" screen in their own language.
 *
 * Phase 1: locale comes from params (static-compatible), not headers().
 */
export default async function ResetPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);

    return (
        <div className="w-full max-w-md">
            <ResetRequestForm
                locale={locale}
                copy={dict.auth.reset}
                loginHref={localePath(locale, "/account/login")}
            />
        </div>
    );
}