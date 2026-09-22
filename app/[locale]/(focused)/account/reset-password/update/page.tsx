import type { Metadata } from "next";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { UpdatePasswordForm } from "./update-password-form";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    return {
        title: getDictionary(locale).auth.reset.updateTitle,
        robots: { index: false, follow: false },
    };
}

/**
 * "Set a new password" screen. Supabase's recovery link signs the user in
 * (PASSWORD_RECOVERY) before landing here, so the form can call
 * updateUser() directly. Reachable only through /auth/callback with a valid
 * recovery code — unauthenticated visits fall back to the request screen
 * via the account guard-less render (the update call simply fails with a
 * localized error and the reset-request screen is one click away).
 *
 * Phase 1: locale comes from params (static-compatible), not headers().
 */
export default async function UpdatePasswordPage({ params }: { params: Promise<{ locale: string }> }) {
    const { locale: raw } = await params;
    const locale = resolveLocale(raw);
    const dict = getDictionary(locale);

    return (
        <div className="w-full max-w-md">
            <UpdatePasswordForm
                locale={locale}
                copy={dict.auth.reset}
            />
        </div>
    );
}