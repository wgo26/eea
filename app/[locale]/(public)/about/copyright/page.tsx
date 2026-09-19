import type { Metadata } from "next";
import { buildAlternates } from "@/lib/i18n/urls";

import { PolicyPage } from "@/components/about/policy-page";
import { getDictionary, resolveLocale } from "@/lib/i18n";

/**
 * A3 — ISR: editorial content, revalidated every 5 minutes (or on demand).
 * The literal is required: segment config must be statically analyzable.
 */
export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);
    return {
        title: dict.footer.copyright,
        description: dict.about.copyrightMetaDesc,
        alternates: buildAlternates(locale, "/about/copyright"),
    };
}

export default async function Page({ params }: { params: Promise<{ locale: string }> }) {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    return <PolicyPage policyType="copyright" locale={locale} />;
}
