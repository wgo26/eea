import type { Metadata } from "next";
import { buildAlternates } from "@/lib/i18n/urls";
import { headers } from "next/headers";

import { PolicyPage } from "@/components/about/policy-page";
import { getDictionary, resolveLocale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);
    return {
        title: dict.footer.privacy,
        description: dict.about.privacyMetaDesc,
        alternates: buildAlternates(locale, "/about/privacy"),
    };
}

export default async function Page() {
    const locale = resolveLocale((await headers()).get("x-locale"));
    return <PolicyPage policyType="privacy" locale={locale} />;
}
