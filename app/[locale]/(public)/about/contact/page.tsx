import type { Metadata } from "next";
import { buildAlternates } from "@/lib/i18n/urls";
import { headers } from "next/headers";

import { PolicyPage } from "@/components/about/policy-page";
import { resolveLocale } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
    const locale = resolveLocale((await headers()).get("x-locale"));
    return {
        title: "Contact",
        alternates: buildAlternates(locale, "/about/contact"),
    };
}

export default async function Page() {
    const locale = resolveLocale((await headers()).get("x-locale"));
    return <PolicyPage policyType="contact" locale={locale} />;
}
