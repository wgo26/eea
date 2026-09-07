import type { Metadata } from "next";
import { buildAlternates } from "@/lib/i18n/urls";
import { headers } from "next/headers";

import { PolicyPage } from "@/components/about/policy-page";
import { getDictionary, resolveLocale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
    const locale = resolveLocale((await headers()).get("x-locale"));
    const dict = getDictionary(locale);
    return {
        title: dict.footer.copyright,
        description: dict.about.copyrightMetaDesc,
        alternates: buildAlternates(locale, "/about/copyright"),
    };
}

export default async function Page() {
    const locale = resolveLocale((await headers()).get("x-locale"));
    return <PolicyPage policyType="copyright" locale={locale} />;
}
