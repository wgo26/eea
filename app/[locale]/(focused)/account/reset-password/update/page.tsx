import type { Metadata } from "next";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { UpdatePasswordForm } from "./update-password-form";

export async function generateMetadata(): Promise<Metadata> {
    const locale = await getRequestLocale();
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
 */
export default async function UpdatePasswordPage() {
    const locale = await getRequestLocale();
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