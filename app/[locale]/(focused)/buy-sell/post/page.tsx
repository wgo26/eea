import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { ArrowLeft } from "lucide-react";

import { Placeholder } from "@/components/placeholder";
import { getDictionary, resolveLocale } from "@/lib/i18n";
import { localePath } from "@/lib/i18n/urls";

export async function generateMetadata(): Promise<Metadata> {
    const locale = resolveLocale((await headers()).get("x-locale"));
    return {
        title: getDictionary(locale).buySell.postTitle,
        robots: { index: false, follow: false },
    };
}

export default async function Page({
    params,
}: {
    params: Promise<{ locale: string }>;
}) {
    const { locale: rawLocale } = await params;
    const locale = resolveLocale(rawLocale);
    const dict = getDictionary(locale);

    return (
        <div className="w-full max-w-2xl">
            <Link
                href={localePath(locale, "/buy-sell")}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
                <ArrowLeft className="h-4 w-4" aria-hidden />
                {dict.nav.buySell}
            </Link>
            <Placeholder
                title={dict.buySell.postTitle}
                description={dict.buySell.postTagline}
            />
        </div>
    );
}
