import { redirect } from "next/navigation";
import { resolveLocale } from "@/lib/i18n";

/**
 * /{locale}/account → the member dashboard in the same locale.
 * (Unprefixed /account never reaches a page — proxy.ts redirects it here.)
 */
export default async function Page({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale } = await params;
    redirect(`/${resolveLocale(locale)}/account/dashboard`);
}
