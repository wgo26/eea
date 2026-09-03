import type { Metadata } from "next";
import { getDictionary } from "@/lib/i18n";
import { getRequestLocale } from "@/lib/i18n/server";
import { localePath } from "@/lib/i18n/urls";
import { ResetRequestForm } from "./reset-request-form";

export async function generateMetadata(): Promise<Metadata> {
    const locale = await getRequestLocale();
    return {
        title: getDictionary(locale).auth.reset.requestTitle,
        robots: { index: false, follow: false },
    };
}

/**
 * Focused reset-request screen (replaces the old Placeholder): emails a
 * recovery link through /auth/callback, which lands the user on the
 * localized "set a new password" screen in their own language.
 */
export default async function ResetPasswordPage() {
    const locale = await getRequestLocale();
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